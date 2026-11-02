package voiceagent

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"mime/multipart"
	"net/http"
	"strings"
	"sync"
	"time"
)

type ChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type OpenRouterAgent struct {
	cfg       AgentConfig
	keys      APIKeys
	callbacks Callbacks
	log       *slog.Logger

	pacer *AudioPacer
	vad   *VAD

	mu      sync.Mutex
	history []ChatMessage
	turns   []Turn
	ctx     context.Context
	cancel  context.CancelFunc

	activeRespMu sync.Mutex
	activeCancel context.CancelFunc
}

func NewOpenRouterAgent(ctx context.Context, cfg AgentConfig, keys APIKeys, cb Callbacks, log *slog.Logger) *OpenRouterAgent {
	if log == nil {
		log = slog.Default()
	}
	agentCtx, cancel := context.WithCancel(ctx)

	a := &OpenRouterAgent{
		cfg:       cfg,
		keys:      keys,
		callbacks: cb,
		log:       log.With("agent", "openrouter"),
		ctx:       agentCtx,
		cancel:    cancel,
		history:   make([]ChatMessage, 0),
		turns:     make([]Turn, 0),
	}

	a.pacer = NewAudioPacer(func(pcm []float32) {
		if cb.OnFeedPCM != nil {
			cb.OnFeedPCM(pcm)
		}
	})

	sysPrompt := a.interpolate(cfg.SystemPrompt)
	if sysPrompt == "" {
		sysPrompt = "Você é um assistente virtual atencioso e prestativo conversando por telefone. Seja conciso e direto em suas respostas."
	}
	a.history = append(a.history, ChatMessage{Role: "system", Content: sysPrompt})

	vadCfg := DefaultVADConfig()
	a.vad = NewVAD(vadCfg)
	a.vad.OnSpeechStart = a.handleSpeechStart
	a.vad.OnSpeechEnd = a.handleSpeechEnd

	return a
}

func (a *OpenRouterAgent) Start(ctx context.Context) error {
	return nil
}

func (a *OpenRouterAgent) OnConnected() {
	a.log.Info("call connected, starting agent conversation")
	if a.cfg.FirstMessage != "" {
		first := a.interpolate(a.cfg.FirstMessage)
		go a.speakAndRecord(first)
	}
}

func (a *OpenRouterAgent) FeedPeerAudio(pcm []float32) {
	if a.vad != nil {
		frameSize := 320
		for offset := 0; offset+frameSize <= len(pcm); offset += frameSize {
			a.vad.ProcessFrame(pcm[offset : offset+frameSize])
		}
	}
}

func (a *OpenRouterAgent) Speak(ctx context.Context, text string) error {
	a.speakAndRecord(text)
	return nil
}

func (a *OpenRouterAgent) Interrupt() {
	a.handleSpeechStart()
}

func (a *OpenRouterAgent) Close() {
	a.cancel()
	a.cancelActiveResponse()
	if a.pacer != nil {
		a.pacer.Close()
	}
	if a.vad != nil {
		a.vad.Reset()
	}
}

func (a *OpenRouterAgent) GetTranscript() []Turn {
	a.mu.Lock()
	defer a.mu.Unlock()
	res := make([]Turn, len(a.turns))
	copy(res, a.turns)
	return res
}

func (a *OpenRouterAgent) handleSpeechStart() {
	if a.pacer.IsPlaying() {
		a.log.Debug("barge-in detected: clearing playback and cancelling active generation")
		a.pacer.Clear()
		a.cancelActiveResponse()
	}
}

func (a *OpenRouterAgent) handleSpeechEnd(utterance []float32) {
	a.log.Debug("speech end detected, processing utterance", "samples", len(utterance))

	text, err := a.transcribeSTT(utterance)
	if err != nil {
		a.log.Warn("STT transcription error", "err", err)
		return
	}
	text = strings.TrimSpace(text)
	if text == "" || len(text) < 2 {
		return
	}

	a.log.Info("transcribed user speech", "text", text)
	turn := Turn{
		Speaker:   "user",
		Text:      text,
		Timestamp: time.Now(),
	}

	a.mu.Lock()
	a.history = append(a.history, ChatMessage{Role: "user", Content: text})
	a.turns = append(a.turns, turn)
	a.mu.Unlock()

	if a.callbacks.OnTurn != nil {
		a.callbacks.OnTurn(turn)
	}

	go a.generateResponse()
}

func (a *OpenRouterAgent) speakAndRecord(text string) {
	text = strings.TrimSpace(text)
	if text == "" {
		return
	}

	turn := Turn{
		Speaker:   "agent",
		Text:      text,
		Timestamp: time.Now(),
	}

	a.mu.Lock()
	a.history = append(a.history, ChatMessage{Role: "assistant", Content: text})
	a.turns = append(a.turns, turn)
	a.mu.Unlock()

	if a.callbacks.OnTurn != nil {
		a.callbacks.OnTurn(turn)
	}

	pcm, err := a.synthesizeTTS(a.ctx, text)
	if err != nil {
		a.log.Error("TTS synthesis error", "err", err)
		return
	}
	a.pacer.Enqueue(pcm)
}

func (a *OpenRouterAgent) generateResponse() {
	a.cancelActiveResponse()

	respCtx, cancel := context.WithCancel(a.ctx)
	a.activeRespMu.Lock()
	a.activeCancel = cancel
	a.activeRespMu.Unlock()

	defer cancel()

	a.mu.Lock()
	messages := make([]ChatMessage, len(a.history))
	copy(messages, a.history)
	a.mu.Unlock()

	model := a.cfg.Model
	if model == "" {
		model = "google/gemini-2.0-flash-001"
	}

	apiKey := a.keys.OpenRouterKey
	apiURL := "https://openrouter.ai/api/v1/chat/completions"
	if apiKey == "" && a.keys.OpenAIKey != "" {
		apiKey = a.keys.OpenAIKey
		apiURL = "https://api.openai.com/v1/chat/completions"
		if !strings.HasPrefix(model, "gpt-") {
			model = "gpt-4o-mini"
		}
	}

	reqBody := map[string]any{
		"model":       model,
		"messages":    messages,
		"stream":      true,
		"temperature": a.cfg.Temperature,
	}
	if a.cfg.Temperature == 0 {
		reqBody["temperature"] = 0.7
	}

	bodyBytes, _ := json.Marshal(reqBody)
	httpReq, err := http.NewRequestWithContext(respCtx, "POST", apiURL, bytes.NewReader(bodyBytes))
	if err != nil {
		a.log.Error("failed to create chat request", "err", err)
		return
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+apiKey)
	httpReq.Header.Set("HTTP-Referer", "https://atendicalls.com")
	httpReq.Header.Set("X-Title", "AtendiCalls")

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(httpReq)
	if err != nil {
		if respCtx.Err() == nil {
			a.log.Error("chat completion request failed", "err", err)
		}
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		a.log.Error("chat completion returned error", "status", resp.StatusCode, "body", string(b))
		return
	}

	scanner := bufio.NewScanner(resp.Body)
	var fullResponse strings.Builder
	var sentenceBuffer strings.Builder

	for scanner.Scan() {
		if respCtx.Err() != nil {
			return
		}
		line := scanner.Text()
		if !strings.HasPrefix(line, "data: ") {
			continue
		}
		dataStr := strings.TrimPrefix(line, "data: ")
		if strings.TrimSpace(dataStr) == "[DONE]" {
			break
		}

		var chunk struct {
			Choices []struct {
				Delta struct {
					Content string `json:"content"`
				} `json:"delta"`
			} `json:"choices"`
		}
		if err := json.Unmarshal([]byte(dataStr), &chunk); err != nil {
			continue
		}
		if len(chunk.Choices) == 0 {
			continue
		}

		token := chunk.Choices[0].Delta.Content
		if token == "" {
			continue
		}

		fullResponse.WriteString(token)
		sentenceBuffer.WriteString(token)

		sentence := sentenceBuffer.String()
		if isSentenceDelimiter(sentence) {
			cleanSentence := strings.TrimSpace(sentence)
			sentenceBuffer.Reset()
			if len(cleanSentence) > 0 {
				go func(s string) {
					pcm, err := a.synthesizeTTS(respCtx, s)
					if err == nil && respCtx.Err() == nil {
						a.pacer.Enqueue(pcm)
					}
				}(cleanSentence)
			}
		}
	}

	if rem := strings.TrimSpace(sentenceBuffer.String()); len(rem) > 0 && respCtx.Err() == nil {
		pcm, err := a.synthesizeTTS(respCtx, rem)
		if err == nil && respCtx.Err() == nil {
			a.pacer.Enqueue(pcm)
		}
	}

	finalText := strings.TrimSpace(fullResponse.String())
	if finalText != "" && respCtx.Err() == nil {
		turn := Turn{
			Speaker:   "agent",
			Text:      finalText,
			Timestamp: time.Now(),
		}
		a.mu.Lock()
		a.history = append(a.history, ChatMessage{Role: "assistant", Content: finalText})
		a.turns = append(a.turns, turn)
		a.mu.Unlock()

		if a.callbacks.OnTurn != nil {
			a.callbacks.OnTurn(turn)
		}
	}
}

func (a *OpenRouterAgent) cancelActiveResponse() {
	a.activeRespMu.Lock()
	if a.activeCancel != nil {
		a.activeCancel()
		a.activeCancel = nil
	}
	a.activeRespMu.Unlock()
}

func (a *OpenRouterAgent) transcribeSTT(samples []float32) (string, error) {
	wavBytes := EncodeWAV16kHzMono(samples)

	apiKey := a.keys.GroqKey
	apiURL := "https://api.groq.com/openai/v1/audio/transcriptions"
	model := "whisper-large-v3-turbo"

	if apiKey == "" {
		apiKey = a.keys.OpenAIKey
		apiURL = "https://api.openai.com/v1/audio/transcriptions"
		model = "whisper-1"
	}
	if apiKey == "" {
		return "", fmt.Errorf("no STT api key configured (groq or openai)")
	}

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)

	part, err := writer.CreateFormFile("file", "speech.wav")
	if err != nil {
		return "", err
	}
	if _, err := io.Copy(part, bytes.NewReader(wavBytes)); err != nil {
		return "", err
	}

	_ = writer.WriteField("model", model)
	_ = writer.WriteField("language", "pt")
	_ = writer.WriteField("response_format", "json")
	_ = writer.Close()

	req, err := http.NewRequestWithContext(a.ctx, "POST", apiURL, body)
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())
	req.Header.Set("Authorization", "Bearer "+apiKey)

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("stt error %d: %s", resp.StatusCode, string(respBody))
	}

	var result struct {
		Text string `json:"text"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}
	return result.Text, nil
}

func (a *OpenRouterAgent) synthesizeTTS(ctx context.Context, text string) ([]float32, error) {
	apiKey := a.keys.OpenAIKey
	if apiKey == "" {
		return nil, fmt.Errorf("no OpenAI API key configured for TTS")
	}

	voice := a.cfg.Voice
	if voice == "" {
		voice = "alloy"
	}

	reqBody := map[string]any{
		"model":           "tts-1",
		"input":           text,
		"voice":           voice,
		"response_format": "pcm", // 24kHz raw 16-bit LE mono PCM
		"speed":           1.0,
	}

	bodyBytes, _ := json.Marshal(reqBody)
	req, err := http.NewRequestWithContext(ctx, "POST", "https://api.openai.com/v1/audio/speech", bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+apiKey)

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		errBody, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("tts error %d: %s", resp.StatusCode, string(errBody))
	}

	pcm24kBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	f32_24k := PCMInt16LEToFloat32(pcm24kBytes)
	f32_16k := ResampleLinear(f32_24k, 24000, 16000)

	return f32_16k, nil
}

func (a *OpenRouterAgent) interpolate(text string) string {
	res := text
	for k, v := range a.cfg.Variables {
		res = strings.ReplaceAll(res, "{{"+k+"}}", v)
		res = strings.ReplaceAll(res, "{"+k+"}", v)
	}
	return res
}

func isSentenceDelimiter(s string) bool {
	trimmed := strings.TrimSpace(s)
	if len(trimmed) == 0 {
		return false
	}
	lastChar := trimmed[len(trimmed)-1:]
	if lastChar == "." || lastChar == "!" || lastChar == "?" || lastChar == "\n" {
		return true
	}
	if lastChar == "," && len(trimmed) > 40 {
		return true
	}
	return false
}
