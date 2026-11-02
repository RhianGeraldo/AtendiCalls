package voiceagent

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/coder/websocket"
)

type OpenAIRealtimeAgent struct {
	cfg       AgentConfig
	keys      APIKeys
	callbacks Callbacks
	log       *slog.Logger

	pacer *AudioPacer

	wsConn *websocket.Conn
	mu     sync.Mutex
	turns  []Turn

	ctx    context.Context
	cancel context.CancelFunc
}

func NewOpenAIRealtimeAgent(ctx context.Context, cfg AgentConfig, keys APIKeys, cb Callbacks, log *slog.Logger) *OpenAIRealtimeAgent {
	if log == nil {
		log = slog.Default()
	}
	agentCtx, cancel := context.WithCancel(ctx)

	a := &OpenAIRealtimeAgent{
		cfg:       cfg,
		keys:      keys,
		callbacks: cb,
		log:       log.With("agent", "openai_realtime"),
		ctx:       agentCtx,
		cancel:    cancel,
		turns:     make([]Turn, 0),
	}

	a.pacer = NewAudioPacer(func(pcm []float32) {
		if cb.OnFeedPCM != nil {
			cb.OnFeedPCM(pcm)
		}
	})

	return a
}

func (a *OpenAIRealtimeAgent) Start(ctx context.Context) error {
	apiKey := a.keys.OpenAIKey
	if apiKey == "" {
		return fmt.Errorf("openAI API key required for realtime provider")
	}

	model := a.cfg.Model
	if model == "" {
		model = "gpt-4o-realtime-preview"
	}

	url := "wss://api.openai.com/v1/realtime?model=" + model
	headers := http.Header{}
	headers.Set("Authorization", "Bearer "+apiKey)
	headers.Set("OpenAI-Beta", "realtime=v1")

	conn, _, err := websocket.Dial(a.ctx, url, &websocket.DialOptions{HTTPHeader: headers})
	if err != nil {
		return fmt.Errorf("failed to dial openai realtime websocket: %w", err)
	}
	conn.SetReadLimit(16 * 1024 * 1024)
	a.wsConn = conn

	instructions := a.interpolate(a.cfg.SystemPrompt)
	if instructions == "" {
		instructions = "Você é um assistente virtual gentil conversando por telefone. Fale sempre em português do Brasil de forma concisa e natural."
	}
	voice := a.cfg.Voice
	if voice == "" {
		voice = "alloy"
	}

	updateMsg := map[string]any{
		"type": "session.update",
		"session": map[string]any{
			"modalities":          []string{"audio", "text"},
			"instructions":        instructions,
			"voice":               voice,
			"input_audio_format":  "pcm16",
			"output_audio_format": "pcm16",
			"input_audio_transcription": map[string]string{
				"model": "whisper-1",
			},
			"turn_detection": map[string]any{
				"type":                "server_vad",
				"threshold":           0.5,
				"prefix_padding_ms":   300,
				"silence_duration_ms": 500,
			},
		},
	}
	if err := a.sendJSON(updateMsg); err != nil {
		_ = conn.Close(websocket.StatusInternalError, "session init failed")
		return err
	}

	go a.readLoop()
	return nil
}

func (a *OpenAIRealtimeAgent) OnConnected() {
	if a.cfg.FirstMessage != "" {
		first := a.interpolate(a.cfg.FirstMessage)
		time.Sleep(300 * time.Millisecond)
		_ = a.Speak(a.ctx, first)
	}
}

func (a *OpenAIRealtimeAgent) FeedPeerAudio(pcm16k []float32) {
	if a.wsConn == nil {
		return
	}
	f32_24k := ResampleLinear(pcm16k, 16000, 24000)
	rawBytes := PCMFloat32ToInt16LE(f32_24k)
	b64Audio := base64.StdEncoding.EncodeToString(rawBytes)

	msg := map[string]any{
		"type":  "input_audio_buffer.append",
		"audio": b64Audio,
	}
	_ = a.sendJSON(msg)
}

func (a *OpenAIRealtimeAgent) Speak(ctx context.Context, text string) error {
	msg := map[string]any{
		"type": "response.create",
		"response": map[string]any{
			"instructions": "Diga exatamente a seguinte frase de forma natural: " + text,
		},
	}
	return a.sendJSON(msg)
}

func (a *OpenAIRealtimeAgent) Interrupt() {
	a.pacer.Clear()
	_ = a.sendJSON(map[string]any{"type": "response.cancel"})
}

func (a *OpenAIRealtimeAgent) Close() {
	a.cancel()
	if a.pacer != nil {
		a.pacer.Close()
	}
	if a.wsConn != nil {
		_ = a.wsConn.Close(websocket.StatusNormalClosure, "call ended")
	}
}

func (a *OpenAIRealtimeAgent) GetTranscript() []Turn {
	a.mu.Lock()
	defer a.mu.Unlock()
	res := make([]Turn, len(a.turns))
	copy(res, a.turns)
	return res
}

func (a *OpenAIRealtimeAgent) readLoop() {
	for {
		select {
		case <-a.ctx.Done():
			return
		default:
		}

		_, msgBytes, err := a.wsConn.Read(a.ctx)
		if err != nil {
			if a.ctx.Err() == nil {
				a.log.Debug("openai realtime ws read error", "err", err)
			}
			return
		}

		var event struct {
			Type       string `json:"type"`
			Delta      string `json:"delta"`
			Audio      string `json:"audio"`
			Transcript string `json:"transcript"`
		}
		if err := json.Unmarshal(msgBytes, &event); err != nil {
			continue
		}

		switch event.Type {
		case "input_audio_buffer.speech_started":
			a.log.Debug("openai server vad: speech started (barge-in)")
			a.pacer.Clear()
			_ = a.sendJSON(map[string]any{"type": "response.cancel"})

		case "response.audio.delta":
			if event.Delta != "" {
				audioBytes, err := base64.StdEncoding.DecodeString(event.Delta)
				if err == nil && len(audioBytes) > 0 {
					f32_24k := PCMInt16LEToFloat32(audioBytes)
					f32_16k := ResampleLinear(f32_24k, 24000, 16000)
					a.pacer.Enqueue(f32_16k)
				}
			}

		case "response.audio_transcript.done":
			if event.Transcript != "" {
				turn := Turn{
					Speaker:   "agent",
					Text:      event.Transcript,
					Timestamp: time.Now(),
				}
				a.mu.Lock()
				a.turns = append(a.turns, turn)
				a.mu.Unlock()
				if a.callbacks.OnTurn != nil {
					a.callbacks.OnTurn(turn)
				}
			}

		case "conversation.item.input_audio_transcription.completed":
			if event.Transcript != "" {
				turn := Turn{
					Speaker:   "user",
					Text:      event.Transcript,
					Timestamp: time.Now(),
				}
				a.mu.Lock()
				a.turns = append(a.turns, turn)
				a.mu.Unlock()
				if a.callbacks.OnTurn != nil {
					a.callbacks.OnTurn(turn)
				}
			}
		}
	}
}

func (a *OpenAIRealtimeAgent) sendJSON(v any) error {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.wsConn == nil {
		return fmt.Errorf("ws not connected")
	}
	b, err := json.Marshal(v)
	if err != nil {
		return err
	}
	return a.wsConn.Write(a.ctx, websocket.MessageText, b)
}

func (a *OpenAIRealtimeAgent) interpolate(text string) string {
	res := text
	for k, v := range a.cfg.Variables {
		res = strings.ReplaceAll(res, "{{"+k+"}}", v)
		res = strings.ReplaceAll(res, "{"+k+"}", v)
	}
	return res
}
