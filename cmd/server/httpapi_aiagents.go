package main

import (
	"encoding/json"
	"net/http"
	"strings"
)

func (s *server) handleAIAgentList(w http.ResponseWriter, r *http.Request) {
	u := s.authUser(r)
	userID := ""
	if u != nil && u.Role != RoleAdmin {
		userID = u.ID
	}

	agents, err := s.agents.ListAgents(r.Context(), userID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	if agents == nil {
		agents = []*AIAgent{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"agents": agents})
}

func (s *server) handleAIAgentGet(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "id is required"})
		return
	}

	agent, err := s.agents.GetAgent(r.Context(), id)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "agent not found"})
		return
	}
	writeJSON(w, http.StatusOK, agent)
}

type aiAgentPayload struct {
	Name                  string   `json:"name"`
	Description           string   `json:"description"`
	Provider              string   `json:"provider"`
	Model                 string   `json:"model"`
	Voice                 string   `json:"voice"`
	SystemPrompt          string   `json:"systemPrompt"`
	FirstMessage          string   `json:"firstMessage"`
	AutoAnswer            *bool    `json:"autoAnswer"`
	AutoAnswerDelaySec    int      `json:"autoAnswerDelaySec"`
	AssignedSessions      []string `json:"assignedSessions"`
	CallWebhookURL        string   `json:"callWebhookUrl"`
	EnableHangup          *bool    `json:"enableHangup"`
	HangupDelaySec        float64  `json:"hangupDelaySec"`
	EnableWhatsAppMessage *bool    `json:"enableWhatsAppMessage"`
	WhatsAppMessageRules  string   `json:"whatsappMessageRules"`
	IsActive              *bool    `json:"isActive"`
}

func (s *server) handleAIAgentCreate(w http.ResponseWriter, r *http.Request) {
	u := s.authUser(r)
	if u == nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Não autenticado."})
		return
	}

	var p aiAgentPayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON: " + err.Error()})
		return
	}

	if strings.TrimSpace(p.Name) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "name is required"})
		return
	}
	if p.Provider == "" {
		p.Provider = "openrouter"
	}
	if p.Model == "" {
		p.Model = "meta-llama/llama-3.3-70b-instruct"
	}
	if p.Voice == "" {
		p.Voice = "alloy"
	}
	delay := p.AutoAnswerDelaySec
	if delay <= 0 {
		delay = 1
	}
	autoAnswer := true
	if p.AutoAnswer != nil {
		autoAnswer = *p.AutoAnswer
	}
	enableHangup := true
	if p.EnableHangup != nil {
		enableHangup = *p.EnableHangup
	}
	hangupDelay := p.HangupDelaySec
	if hangupDelay <= 0 {
		hangupDelay = 1.5
	}
	enableWA := true
	if p.EnableWhatsAppMessage != nil {
		enableWA = *p.EnableWhatsAppMessage
	}
	isActive := true
	if p.IsActive != nil {
		isActive = *p.IsActive
	}
	assigned := p.AssignedSessions
	if assigned == nil {
		assigned = []string{"all"}
	}

	a := AIAgent{
		UserID:                u.ID,
		Name:                  strings.TrimSpace(p.Name),
		Description:           p.Description,
		Provider:              p.Provider,
		Model:                 p.Model,
		Voice:                 p.Voice,
		SystemPrompt:          p.SystemPrompt,
		FirstMessage:          p.FirstMessage,
		AutoAnswer:            autoAnswer,
		AutoAnswerDelaySec:    delay,
		AssignedSessions:      assigned,
		CallWebhookURL:        p.CallWebhookURL,
		EnableHangup:          enableHangup,
		HangupDelaySec:        hangupDelay,
		EnableWhatsAppMessage: enableWA,
		WhatsAppMessageRules:  p.WhatsAppMessageRules,
		IsActive:              isActive,
	}

	if err := s.agents.CreateAgent(r.Context(), &a); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusCreated, a)
}

func (s *server) handleAIAgentUpdate(w http.ResponseWriter, r *http.Request) {
	u := s.authUser(r)
	if u == nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Não autenticado."})
		return
	}

	id := r.PathValue("id")
	if id == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "id is required"})
		return
	}

	existing, err := s.agents.GetAgent(r.Context(), id)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Agente não encontrado."})
		return
	}

	if u.Role != RoleAdmin {
		if (existing.UserID != "" && existing.UserID != u.ID) || existing.UserID == "" {
			writeJSON(w, http.StatusForbidden, map[string]string{"error": "Sem permissão para alterar este assistente padrão ou de outro usuário."})
			return
		}
	}

	var p aiAgentPayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON: " + err.Error()})
		return
	}

	if strings.TrimSpace(p.Name) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "name is required"})
		return
	}

	existing.Name = strings.TrimSpace(p.Name)
	existing.Description = p.Description
	if p.Provider != "" {
		existing.Provider = p.Provider
	}
	if p.Model != "" {
		existing.Model = p.Model
	}
	if p.Voice != "" {
		existing.Voice = p.Voice
	}
	if p.SystemPrompt != "" {
		existing.SystemPrompt = p.SystemPrompt
	}
	existing.FirstMessage = p.FirstMessage
	if p.AutoAnswer != nil {
		existing.AutoAnswer = *p.AutoAnswer
	}
	if p.AutoAnswerDelaySec > 0 {
		existing.AutoAnswerDelaySec = p.AutoAnswerDelaySec
	}
	if p.AssignedSessions != nil {
		existing.AssignedSessions = p.AssignedSessions
	}
	existing.CallWebhookURL = p.CallWebhookURL
	if p.EnableHangup != nil {
		existing.EnableHangup = *p.EnableHangup
	}
	if p.HangupDelaySec > 0 {
		existing.HangupDelaySec = p.HangupDelaySec
	}
	if p.EnableWhatsAppMessage != nil {
		existing.EnableWhatsAppMessage = *p.EnableWhatsAppMessage
	}
	existing.WhatsAppMessageRules = p.WhatsAppMessageRules
	if p.IsActive != nil {
		existing.IsActive = *p.IsActive
	}

	if err := s.agents.UpdateAgent(r.Context(), existing); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, existing)
}

func (s *server) handleAIAgentDelete(w http.ResponseWriter, r *http.Request) {
	u := s.authUser(r)
	if u == nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Não autenticado."})
		return
	}

	id := r.PathValue("id")
	if id == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "id is required"})
		return
	}

	if u.Role != RoleAdmin {
		existing, err := s.agents.GetAgent(r.Context(), id)
		if err != nil || (existing.UserID != "" && existing.UserID != u.ID) || existing.UserID == "" {
			writeJSON(w, http.StatusForbidden, map[string]string{"error": "Sem permissão para excluir este assistente padrão ou de outro usuário."})
			return
		}
	}

	if err := s.agents.DeleteAgent(r.Context(), id); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"message": "agent deleted successfully"})
}
