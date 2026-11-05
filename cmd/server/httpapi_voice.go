package main

import (
	"context"
	"encoding/json"
	"net/http"
	"regexp"
	"strings"
	"time"

	"atendicalls/internal/voip/core"
	"atendicalls/internal/voip/voiceagent"
)

var phoneDigitsRegex = regexp.MustCompile(`\D`)

// authenticateRequest extracts the API key / token from headers or query parameters and validates it:
// 1. Matches master system_api_key (full access)
// 2. Matches an instance token (access for that instance)
// 3. Or allows if no system_api_key is configured
func (s *server) authenticateRequest(r *http.Request) (authenticated bool, isMaster bool, matchedSess *Session) {
	apiKey := r.Header.Get("X-API-Key")
	if apiKey == "" {
		apiKey = r.Header.Get("apikey")
	}
	if apiKey == "" {
		apiKey = r.Header.Get("Instance-Token")
	}
	if apiKey == "" {
		auth := r.Header.Get("Authorization")
		if strings.HasPrefix(strings.ToLower(auth), "bearer ") {
			apiKey = strings.TrimSpace(auth[7:])
		}
	}
	if apiKey == "" {
		apiKey = r.URL.Query().Get("token")
	}
	apiKey = strings.TrimSpace(apiKey)

	configuredKey, err := s.settings.Get(r.Context(), "system_api_key")
	configuredKey = strings.TrimSpace(configuredKey)

	// If no master key is set and no api key provided, allow during initial setup
	if (err != nil || configuredKey == "") && apiKey == "" {
		return true, true, nil
	}

	// Master key match
	if configuredKey != "" && apiKey == configuredKey {
		return true, true, nil
	}

	// Instance token match
	if apiKey != "" {
		if sess, ok := s.sessions.GetByToken(apiKey); ok && sess != nil {
			return true, false, sess
		}
	}

	// If configuredKey was empty, but apiKey was provided and didn't match any session
	if configuredKey == "" {
		return true, true, nil
	}

	return false, false, nil
}

func (s *server) checkVoiceAuth(r *http.Request) bool {
	auth, _, _ := s.authenticateRequest(r)
	return auth
}

func (s *server) handleVoiceAPICreateCall(w http.ResponseWriter, r *http.Request) {
	if !s.checkVoiceAuth(r) {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized: invalid API key"})
		return
	}

	var req struct {
		SessionID  string                 `json:"sessionId"`
		AgentID    string                 `json:"agentId"`
		To         string                 `json:"to"`
		WebhookURL string                 `json:"webhookUrl"`
		Agent      voiceagent.AgentConfig `json:"agent"`
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

	// If agentId is provided or if no prompt is given, look up registered multi-agent profile
	if s.agents != nil {
		var matchedAgent *AIAgent
		if req.AgentID != "" {
			matchedAgent, _ = s.agents.GetAgent(r.Context(), req.AgentID)
		} else if req.Agent.SystemPrompt == "" {
			matchedAgent, _ = s.agents.FindAgentForSession(r.Context(), sess.id)
		}

		if matchedAgent != nil {
			if req.Agent.Provider == "" {
				req.Agent.Provider = matchedAgent.Provider
			}
			if req.Agent.Model == "" {
				req.Agent.Model = matchedAgent.Model
			}
			if req.Agent.Voice == "" {
				req.Agent.Voice = matchedAgent.Voice
			}
			if req.Agent.SystemPrompt == "" {
				req.Agent.SystemPrompt = matchedAgent.SystemPrompt
			}
			if req.Agent.FirstMessage == "" {
				req.Agent.FirstMessage = matchedAgent.FirstMessage
			}
			if req.WebhookURL == "" {
				req.WebhookURL = matchedAgent.CallWebhookURL
			}
			req.Agent.EnableHangup = matchedAgent.EnableHangup
			req.Agent.HangupDelaySec = matchedAgent.HangupDelaySec
			req.Agent.EnableWhatsAppMessage = matchedAgent.EnableWhatsAppMessage
			req.Agent.WhatsAppMessageRules = matchedAgent.WhatsAppMessageRules
		}
	}

	// Default agent configuration if not provided
	if req.Agent.Provider == "" {
		if defProv, err := s.settings.Get(r.Context(), "default_ai_provider"); err == nil && defProv != "" {
			req.Agent.Provider = defProv
		} else {
			req.Agent.Provider = "openrouter"
		}
	}
	if req.Agent.Model == "" {
		if defModel, err := s.settings.Get(r.Context(), "default_ai_model"); err == nil && defModel != "" {
			req.Agent.Model = defModel
		}
	}
	if req.Agent.SystemPrompt == "" {
		if defPrompt, err := s.settings.Get(r.Context(), "default_ai_prompt"); err == nil && defPrompt != "" {
			req.Agent.SystemPrompt = defPrompt
		}
	}
	if req.Agent.Voice == "" {
		if defVoice, err := s.settings.Get(r.Context(), "default_ai_voice"); err == nil && defVoice != "" {
			req.Agent.Voice = defVoice
		}
	}
	if !req.Agent.EnableHangup && req.Agent.HangupDelaySec == 0 {
		req.Agent.EnableHangup = true
		req.Agent.HangupDelaySec = 1.5
	}

	callID, err := sess.startOutgoingWithAgent(context.Background(), peerJid, req.Agent, req.WebhookURL)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"callId":    callID,
		"sessionId": sess.id,
		"to":        cleanPhone,
		"status":    "initiating",
		"mode":      "ai",
		"provider":  req.Agent.Provider,
		"createdAt": time.Now().UnixMilli(),
	})
}

func (s *server) handleVoiceAPIListCalls(w http.ResponseWriter, r *http.Request) {
	if !s.checkVoiceAuth(r) {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	calls := s.broker.activeCalls()
	res := make([]map[string]any, 0, len(calls))

	for _, c := range calls {
		mode := "human"
		if sess, ok := s.sessions.Get(c.SessionID); ok && sess != nil {
			if ac, ok := sess.reg.get(c.CallID); ok && ac.mode == "ai" {
				mode = "ai"
			}
		}
		res = append(res, map[string]any{
			"callId":      c.CallID,
			"sessionId":   c.SessionID,
			"sessionName": c.SessionName,
			"peer":        c.Peer,
			"direction":   c.Direction,
			"status":      c.Status,
			"owner":       c.Owner,
			"mode":        mode,
			"startedAt":   c.StartedAt,
			"connectedAt": c.ConnectedAt,
		})
	}

	writeJSON(w, http.StatusOK, map[string]any{"calls": res, "total": len(res)})
}

func (s *server) handleVoiceAPIGetCall(w http.ResponseWriter, r *http.Request) {
	if !s.checkVoiceAuth(r) {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	callID := r.PathValue("id")
	callRec, ok := s.broker.getCall(callID)
	if !ok {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "call not found"})
		return
	}

	var transcript []voiceagent.Turn
	mode := "human"

	if sess, ok := s.sessions.Get(callRec.SessionID); ok && sess != nil {
		if ac, ok := sess.reg.get(callID); ok {
			if ac.mode == "ai" {
				mode = "ai"
			}
			if ac.voiceAgent != nil {
				transcript = ac.voiceAgent.GetTranscript()
			}
		}
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"call":       callRec,
		"mode":       mode,
		"transcript": transcript,
	})
}

func (s *server) handleVoiceAPITerminateCall(w http.ResponseWriter, r *http.Request) {
	if !s.checkVoiceAuth(r) {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	callID := r.PathValue("id")
	callRec, ok := s.broker.getCall(callID)
	if !ok {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "call not found"})
		return
	}

	sess, ok := s.sessions.Get(callRec.SessionID)
	if !ok || sess == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "session not found"})
		return
	}

	sess.terminateCall(callID, core.EndCallReasonUserEnded)
	writeJSON(w, http.StatusOK, map[string]string{"status": "terminated"})
}

func (s *server) handleVoiceAPISpeak(w http.ResponseWriter, r *http.Request) {
	if !s.checkVoiceAuth(r) {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	callID := r.PathValue("id")
	callRec, ok := s.broker.getCall(callID)
	if !ok {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "call not found"})
		return
	}

	sess, ok := s.sessions.Get(callRec.SessionID)
	if !ok || sess == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "session not found"})
		return
	}

	ac, ok := sess.reg.get(callID)
	if !ok || ac.voiceAgent == nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "call does not have an active voice agent"})
		return
	}

	var body struct {
		Text string `json:"text"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || strings.TrimSpace(body.Text) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "'text' field is required"})
		return
	}

	_ = ac.voiceAgent.Speak(r.Context(), body.Text)
	writeJSON(w, http.StatusOK, map[string]string{"status": "spoken"})
}

func (s *server) handleVoiceAPIInterrupt(w http.ResponseWriter, r *http.Request) {
	if !s.checkVoiceAuth(r) {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	callID := r.PathValue("id")
	callRec, ok := s.broker.getCall(callID)
	if !ok {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "call not found"})
		return
	}

	sess, ok := s.sessions.Get(callRec.SessionID)
	if !ok || sess == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "session not found"})
		return
	}

	ac, ok := sess.reg.get(callID)
	if !ok || ac.voiceAgent == nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "call does not have an active voice agent"})
		return
	}

	ac.voiceAgent.Interrupt()
	writeJSON(w, http.StatusOK, map[string]string{"status": "interrupted"})
}

func (s *server) handleVoiceAPITransfer(w http.ResponseWriter, r *http.Request) {
	if !s.checkVoiceAuth(r) {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	callID := r.PathValue("id")
	callRec, ok := s.broker.getCall(callID)
	if !ok {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "call not found"})
		return
	}

	sess, ok := s.sessions.Get(callRec.SessionID)
	if !ok || sess == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "session not found"})
		return
	}

	ac, ok := sess.reg.get(callID)
	if !ok {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "active call not found"})
		return
	}

	if ac.voiceAgent != nil {
		ac.voiceAgent.Close()
		ac.voiceAgent = nil
	}
	ac.mode = "human"

	s.broker.setOwner(callID, "") // released for human pickup
	writeJSON(w, http.StatusOK, map[string]string{"status": "transferred_to_human"})
}
