package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

// handleSendMessageText sends a text message to a WhatsApp number.
func (s *server) handleSendMessageText(w http.ResponseWriter, r *http.Request) {
	if !s.checkVoiceAuth(r) {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized: invalid API key"})
		return
	}

	var req struct {
		SessionID string `json:"sessionId"`
		To        string `json:"to"`
		Text      string `json:"text"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON body: " + err.Error()})
		return
	}

	if req.To == "" || strings.TrimSpace(req.Text) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "'to' and 'text' are required"})
		return
	}

	cleanPhone := phoneDigitsRegex.ReplaceAllString(req.To, "")
	if len(cleanPhone) < 8 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid phone number"})
		return
	}

	sess := s.resolveSession(r, req.SessionID)
	if sess == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "no active/paired WhatsApp session found"})
		return
	}
	peerJid := sess.resolvePeerJID(r.Context(), cleanPhone)

	msgID, err := sess.sendTextMessage(r.Context(), peerJid, req.Text)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"status":    "sent",
		"messageId": msgID,
		"sessionId": sess.id,
		"to":        cleanPhone,
		"timestamp": time.Now().UnixMilli(),
	})
}

// handleSendMessageButtons sends an interactive button message (Native Flow buttons).
func (s *server) handleSendMessageButtons(w http.ResponseWriter, r *http.Request) {
	if !s.checkVoiceAuth(r) {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized: invalid API key"})
		return
	}

	var req struct {
		SessionID string           `json:"sessionId"`
		To        string           `json:"to"`
		Title     string           `json:"title"`
		Text      string           `json:"text"`
		Footer    string           `json:"footer"`
		Buttons   []WhatsAppButton `json:"buttons"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON body: " + err.Error()})
		return
	}

	if req.To == "" || strings.TrimSpace(req.Text) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "'to' and 'text' are required"})
		return
	}

	if len(req.Buttons) == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "'buttons' must contain at least one button"})
		return
	}

	cleanPhone := phoneDigitsRegex.ReplaceAllString(req.To, "")
	if len(cleanPhone) < 8 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid phone number"})
		return
	}

	sess := s.resolveSession(r, req.SessionID)
	if sess == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "no active/paired WhatsApp session found"})
		return
	}
	peerJid := sess.resolvePeerJID(r.Context(), cleanPhone)

	msgID, err := sess.sendButtonsMessage(r.Context(), peerJid, req.Title, req.Text, req.Footer, req.Buttons)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"status":       "sent",
		"messageId":    msgID,
		"sessionId":    sess.id,
		"to":           cleanPhone,
		"buttonsCount": len(req.Buttons),
		"timestamp":    time.Now().UnixMilli(),
	})
}

// handleSendMessageAudio sends a voice note (PTT) or audio file.
// Can synthesize voice note directly from text via OpenAI TTS or send raw audio.
func (s *server) handleSendMessageAudio(w http.ResponseWriter, r *http.Request) {
	if !s.checkVoiceAuth(r) {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized: invalid API key"})
		return
	}

	var req struct {
		SessionID   string `json:"sessionId"`
		To          string `json:"to"`
		Text        string `json:"text"`        // If provided, synthesizes speech with TTS
		Voice       string `json:"voice"`       // TTS voice (alloy, echo, nova, etc.)
		AudioBase64 string `json:"audioBase64"` // Raw audio file base64
		AudioURL    string `json:"audioUrl"`    // Remote audio URL to download and send
		PTT         *bool  `json:"ptt"`         // True for voice note waveform (default true)
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON body: " + err.Error()})
		return
	}

	if req.To == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "'to' phone number is required"})
		return
	}

	cleanPhone := phoneDigitsRegex.ReplaceAllString(req.To, "")
	if len(cleanPhone) < 8 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid phone number"})
		return
	}

	sess := s.resolveSession(r, req.SessionID)
	if sess == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "no active/paired WhatsApp session found"})
		return
	}
	peerJid := sess.resolvePeerJID(r.Context(), cleanPhone)

	var audioBytes []byte
	var err error

	isPTT := true
	if req.PTT != nil {
		isPTT = *req.PTT
	}

	// 1. Text synthesis via OpenAI TTS in OGG Opus format
	if strings.TrimSpace(req.Text) != "" {
		audioBytes, err = s.synthesizeOpusTTS(r.Context(), req.Text, req.Voice)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "TTS synthesis failed: " + err.Error()})
			return
		}
	} else if req.AudioBase64 != "" {
		// 2. Raw base64 audio
		audioBytes, err = base64.StdEncoding.DecodeString(req.AudioBase64)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid audioBase64 string: " + err.Error()})
			return
		}
	} else if req.AudioURL != "" {
		// 3. Download from remote URL
		audioBytes, err = s.downloadRemoteFile(r.Context(), req.AudioURL)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "failed to download audioUrl: " + err.Error()})
			return
		}
	} else {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "one of 'text', 'audioBase64' or 'audioUrl' must be provided"})
		return
	}

	msgID, err := sess.sendAudioMessage(r.Context(), peerJid, audioBytes, isPTT)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"status":    "sent",
		"messageId": msgID,
		"sessionId": sess.id,
		"to":        cleanPhone,
		"ptt":       isPTT,
		"timestamp": time.Now().UnixMilli(),
	})
}

// handleSendMessageMedia sends an image or document/PDF.
func (s *server) handleSendMessageMedia(w http.ResponseWriter, r *http.Request) {
	if !s.checkVoiceAuth(r) {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized: invalid API key"})
		return
	}

	var req struct {
		SessionID   string `json:"sessionId"`
		To          string `json:"to"`
		MediaBase64 string `json:"mediaBase64"`
		MediaURL    string `json:"mediaUrl"`
		MimeType    string `json:"mimeType"`
		FileName    string `json:"fileName"`
		Caption     string `json:"caption"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON body: " + err.Error()})
		return
	}

	if req.To == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "'to' phone number is required"})
		return
	}

	cleanPhone := phoneDigitsRegex.ReplaceAllString(req.To, "")
	if len(cleanPhone) < 8 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid phone number"})
		return
	}

	sess := s.resolveSession(r, req.SessionID)
	if sess == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "no active/paired WhatsApp session found"})
		return
	}
	peerJid := sess.resolvePeerJID(r.Context(), cleanPhone)

	var mediaBytes []byte
	var err error

	if req.MediaBase64 != "" {
		mediaBytes, err = base64.StdEncoding.DecodeString(req.MediaBase64)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid mediaBase64 string: " + err.Error()})
			return
		}
	} else if req.MediaURL != "" {
		mediaBytes, err = s.downloadRemoteFile(r.Context(), req.MediaURL)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "failed to download mediaUrl: " + err.Error()})
			return
		}
	} else {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "either 'mediaBase64' or 'mediaUrl' is required"})
		return
	}

	mimeType := req.MimeType
	if mimeType == "" {
		mimeType = http.DetectContentType(mediaBytes)
	}
	fileName := req.FileName
	if fileName == "" {
		if strings.HasPrefix(mimeType, "image/") {
			fileName = "image.png"
		} else {
			fileName = "document.pdf"
		}
	}

	msgID, err := sess.sendMediaMessage(r.Context(), peerJid, mediaBytes, mimeType, fileName, req.Caption)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"status":    "sent",
		"messageId": msgID,
		"sessionId": sess.id,
		"to":        cleanPhone,
		"fileName":  fileName,
		"mimeType":  mimeType,
		"timestamp": time.Now().UnixMilli(),
	})
}

// resolveSession returns the requested session or the session authenticated by instance token, or the first paired open session.
func (s *server) resolveSession(r *http.Request, sessionID string) *Session {
	if sessionID != "" {
		if sess, ok := s.sessions.GetByIDOrName(sessionID); ok {
			return sess
		}
	}
	if r != nil {
		if _, isMaster, sess := s.authenticateRequest(r); !isMaster && sess != nil {
			return sess
		}
	}
	for _, sID := range s.sessions.order {
		if cand, ok := s.sessions.Get(sID); ok && cand != nil && cand.auth.State == "open" {
			return cand
		}
	}
	return nil
}

// synthesizeOpusTTS calls OpenAI TTS returning native OGG Opus bytes for WhatsApp voice notes.
func (s *server) synthesizeOpusTTS(ctx context.Context, text, voice string) ([]byte, error) {
	apiKey, _ := s.settings.Get(ctx, "openai_api_key")
	if apiKey == "" {
		apiKey = os.Getenv("OPENAI_API_KEY")
	}
	if apiKey == "" {
		return nil, fmt.Errorf("openAI API key required for voice note synthesis")
	}

	if voice == "" {
		voice = "alloy"
	}

	reqBody := map[string]any{
		"model":           "tts-1",
		"input":           text,
		"voice":           voice,
		"response_format": "opus", // WhatsApp uses OGG Opus natively for voice notes
	}

	bodyBytes, _ := json.Marshal(reqBody)
	req, err := http.NewRequestWithContext(ctx, "POST", "https://api.openai.com/v1/audio/speech", bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+apiKey)

	client := &http.Client{Timeout: 20 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		errBytes, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("tts API returned status %d: %s", resp.StatusCode, string(errBytes))
	}

	return io.ReadAll(resp.Body)
}

func (s *server) downloadRemoteFile(ctx context.Context, fileURL string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", fileURL, nil)
	if err != nil {
		return nil, err
	}
	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("download returned status %d", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}
