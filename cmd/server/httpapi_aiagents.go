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

func (s *server) handleAIAgentCreate(w http.ResponseWriter, r *http.Request) {
	u := s.authUser(r)
	if u == nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Não autenticado."})
		return
	}

	var a AIAgent
	if err := json.NewDecoder(r.Body).Decode(&a); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON: " + err.Error()})
		return
	}

	if strings.TrimSpace(a.Name) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "name is required"})
		return
	}
	if a.Provider == "" {
		a.Provider = "openrouter"
	}
	if a.Model == "" {
		a.Model = "meta-llama/llama-3.3-70b-instruct"
	}
	if a.Voice == "" {
		a.Voice = "alloy"
	}
	if a.AutoAnswerDelaySec <= 0 {
		a.AutoAnswerDelaySec = 1
	}
	a.UserID = u.ID

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

	if u.Role != RoleAdmin {
		existing, err := s.agents.GetAgent(r.Context(), id)
		if err != nil || (existing.UserID != "" && existing.UserID != u.ID) || existing.UserID == "" {
			writeJSON(w, http.StatusForbidden, map[string]string{"error": "Sem permissão para alterar este assistente padrão ou de outro usuário."})
			return
		}
	}

	var a AIAgent
	if err := json.NewDecoder(r.Body).Decode(&a); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON: " + err.Error()})
		return
	}
	a.ID = id
	a.UserID = u.ID

	if strings.TrimSpace(a.Name) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "name is required"})
		return
	}
	if a.AutoAnswerDelaySec <= 0 {
		a.AutoAnswerDelaySec = 1
	}

	if err := s.agents.UpdateAgent(r.Context(), &a); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, a)
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
