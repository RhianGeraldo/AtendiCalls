package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"atendicalls/internal/voip/core"

	"go.mau.fi/whatsmeow"
	"golang.org/x/crypto/bcrypt"
)

func (s *server) routes() http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /api/sessions", s.handleSessionList)
	mux.HandleFunc("POST /api/sessions", s.handleSessionCreate)
	mux.HandleFunc("PATCH /api/sessions/{sid}", s.handleSessionRename)
	mux.HandleFunc("DELETE /api/sessions/{sid}", s.handleSessionDelete)
	mux.HandleFunc("POST /api/sessions/{sid}/logout", s.handleSessionLogout)
	mux.HandleFunc("POST /api/sessions/{sid}/pair", s.handleSessionPair)
	mux.HandleFunc("POST /api/sessions/{sid}/calls", s.handleStartCall)
	mux.HandleFunc("POST /api/sessions/{sid}/calls/{id}/webrtc", s.handleWebRTC)
	mux.HandleFunc("POST /api/sessions/{sid}/calls/{id}/accept", s.handleAccept)
	mux.HandleFunc("POST /api/sessions/{sid}/calls/{id}/reject", s.handleReject)
	mux.HandleFunc("DELETE /api/sessions/{sid}/calls/{id}", s.handleEndCall)
	mux.HandleFunc("GET /api/sessions/{sid}/history", s.handleHistory)

	// Auth routes
	mux.HandleFunc("POST /api/auth/login", s.handleAuthLogin)
	mux.HandleFunc("POST /api/auth/register", s.handleAuthRegister)
	mux.HandleFunc("POST /api/auth/logout", s.handleAuthLogout)
	mux.HandleFunc("GET /api/auth/me", s.handleAuthMe)

	// Plan routes
	mux.HandleFunc("GET /api/plans", s.handlePlanList)
	mux.HandleFunc("POST /api/plans", s.handlePlanCreate)
	mux.HandleFunc("PUT /api/plans/{id}", s.handlePlanUpdate)
	mux.HandleFunc("DELETE /api/plans/{id}", s.handlePlanDelete)

	// User management routes
	mux.HandleFunc("GET /api/users", s.handleUserList)
	mux.HandleFunc("POST /api/users", s.handleUserCreate)
	mux.HandleFunc("PATCH /api/users/{id}", s.handleUserUpdate)
	mux.HandleFunc("PATCH /api/users/{id}/plan", s.handleUserPlanUpdate)
	mux.HandleFunc("PATCH /api/users/{id}/status", s.handleUserStatusUpdate)
	mux.HandleFunc("DELETE /api/users/{id}", s.handleUserDelete)

	// Reports & Analytics routes
	mux.HandleFunc("GET /api/calls/history", s.handleCallHistory)
	mux.HandleFunc("GET /api/calls/analytics", s.handleCallAnalytics)

	// Call audio recording & transcription routes
	mux.HandleFunc("GET /api/calls/{id}/audio", s.handleCallAudio)
	mux.HandleFunc("GET /api/calls/{id}/transcript", s.handleCallTranscript)
	mux.HandleFunc("POST /api/calls/{id}/transcribe", s.handleCallTranscribe)

	// Contact management routes
	mux.HandleFunc("GET /api/contacts", s.handleContactList)
	mux.HandleFunc("POST /api/contacts", s.handleContactCreate)
	mux.HandleFunc("PUT /api/contacts/{id}", s.handleContactUpdate)
	mux.HandleFunc("DELETE /api/contacts/{id}", s.handleContactDelete)

	// Campaign management routes
	mux.HandleFunc("GET /api/campaigns", s.handleCampaignList)
	mux.HandleFunc("POST /api/campaigns", s.handleCampaignCreate)
	mux.HandleFunc("GET /api/campaigns/{id}", s.handleCampaignGet)
	mux.HandleFunc("PATCH /api/campaigns/{id}/status", s.handleCampaignStatusUpdate)
	mux.HandleFunc("PATCH /api/campaigns/{id}/items/{itemId}", s.handleCampaignItemUpdate)
	mux.HandleFunc("DELETE /api/campaigns/{id}", s.handleCampaignDelete)

	// Playbook management routes
	mux.HandleFunc("GET /api/playbooks", s.handlePlaybookList)
	mux.HandleFunc("POST /api/playbooks", s.handlePlaybookCreate)
	mux.HandleFunc("PUT /api/playbooks/{id}", s.handlePlaybookUpdate)
	// System Settings routes (AI Transcriber & Voice Agent API Keys)
	mux.HandleFunc("GET /api/settings", s.handleGetSettings)
	mux.HandleFunc("POST /api/settings", s.handleUpdateSettings)

	// AI Agents Management routes (Multi-Agent profiles)
	mux.HandleFunc("GET /api/ai/agents", s.handleAIAgentList)
	mux.HandleFunc("POST /api/ai/agents", s.handleAIAgentCreate)
	mux.HandleFunc("GET /api/ai/agents/{id}", s.handleAIAgentGet)
	mux.HandleFunc("PUT /api/ai/agents/{id}", s.handleAIAgentUpdate)
	mux.HandleFunc("DELETE /api/ai/agents/{id}", s.handleAIAgentDelete)

	// Public Voice AI API (External integrations / CRMs / automations)
	mux.HandleFunc("POST /api/v1/voice/calls", s.handleVoiceAPICreateCall)
	mux.HandleFunc("GET /api/v1/voice/calls", s.handleVoiceAPIListCalls)
	mux.HandleFunc("GET /api/v1/voice/calls/{id}", s.handleVoiceAPIGetCall)
	mux.HandleFunc("GET /api/v1/voice/calls/{id}/audio", s.handleV1CallAudio)
	mux.HandleFunc("POST /api/v1/voice/calls/{id}/hangup", s.handleVoiceAPITerminateCall)
	mux.HandleFunc("POST /api/v1/voice/calls/{id}/terminate", s.handleVoiceAPITerminateCall)
	mux.HandleFunc("DELETE /api/v1/voice/calls/{id}", s.handleVoiceAPITerminateCall)
	mux.HandleFunc("POST /api/v1/voice/calls/{id}/speak", s.handleVoiceAPISpeak)
	mux.HandleFunc("POST /api/v1/voice/calls/{id}/interrupt", s.handleVoiceAPIInterrupt)
	mux.HandleFunc("POST /api/v1/voice/calls/{id}/transfer", s.handleVoiceAPITransfer)

	// Public WhatsApp Sessions & Messaging API (Headless Engine)
	mux.HandleFunc("GET /api/v1/sessions", s.handleV1SessionList)
	mux.HandleFunc("POST /api/v1/sessions", s.handleV1SessionCreate)
	mux.HandleFunc("GET /api/v1/sessions/{sid}", s.handleV1SessionGet)
	mux.HandleFunc("GET /api/v1/sessions/{sid}/qr", s.handleV1SessionQR)
	mux.HandleFunc("GET /api/v1/sessions/qr", s.handleV1SessionQR)
	mux.HandleFunc("POST /api/v1/sessions/{sid}/pair", s.handleV1SessionPair)
	mux.HandleFunc("POST /api/v1/sessions/{sid}/pair-phone", s.handleV1SessionPairPhone)
	mux.HandleFunc("POST /api/v1/sessions/{sid}/logout", s.handleV1SessionLogout)
	mux.HandleFunc("DELETE /api/v1/sessions/{sid}", s.handleV1SessionDelete)

	// Instance API Aliases (Standard for multi-tenant integrations)
	mux.HandleFunc("POST /api/v1/instance/create", s.handleV1SessionCreate)
	mux.HandleFunc("GET /api/v1/instance/connect", s.handleV1SessionQR)
	mux.HandleFunc("GET /api/v1/instance/connect/{sid}", s.handleV1SessionQR)
	mux.HandleFunc("GET /api/v1/instance/qr", s.handleV1SessionQR)
	mux.HandleFunc("GET /api/v1/instance/status", s.handleV1SessionGet)
	mux.HandleFunc("GET /api/v1/instance/status/{sid}", s.handleV1SessionGet)
	mux.HandleFunc("POST /api/v1/instance/logout", s.handleV1SessionLogout)
	mux.HandleFunc("POST /api/v1/instance/logout/{sid}", s.handleV1SessionLogout)
	mux.HandleFunc("DELETE /api/v1/instance/delete/{sid}", s.handleV1SessionDelete)

	mux.HandleFunc("POST /api/v1/messages/send-text", s.handleSendMessageText)
	mux.HandleFunc("POST /api/v1/messages/send-buttons", s.handleSendMessageButtons)
	mux.HandleFunc("POST /api/v1/messages/send-audio", s.handleSendMessageAudio)
	mux.HandleFunc("POST /api/v1/messages/send-media", s.handleSendMessageMedia)

	mux.HandleFunc("GET /api/events", s.handleEvents)

	if s.staticDir != "" {
		if _, err := os.Stat(s.staticDir); err == nil {
			fs := http.Dir(s.staticDir)
			fileServer := http.FileServer(fs)
			mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
				cleaned := filepath.Clean(r.URL.Path)
				fPath := filepath.Join(s.staticDir, cleaned)
				if fi, err := os.Stat(fPath); err == nil && !fi.IsDir() {
					fileServer.ServeHTTP(w, r)
					return
				}
				indexPath := filepath.Join(s.staticDir, "index.html")
				http.ServeFile(w, r, indexPath)
			})
		}
	}
	return withCORS(s.rateLimitMiddleware(mux))
}

func withCORS(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-Client-Id, Authorization, X-API-Key, apikey, Instance-Token")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		h.ServeHTTP(w, r)
	})
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func clientID(r *http.Request) string {
	if id := r.Header.Get("X-Client-Id"); id != "" {
		return id
	}
	return r.URL.Query().Get("clientId")
}

func (s *server) getOwnerName(r *http.Request) string {
	if u := s.authUser(r); u != nil && u.Name != "" {
		return u.Name
	}
	return clientID(r)
}

func (s *server) sessionByID(w http.ResponseWriter, r *http.Request, sid string) *Session {
	sess, ok := s.sessions.Get(sid)
	if !ok {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "no such session"})
		return nil
	}
	if u := s.authUser(r); u != nil && u.Role != RoleAdmin && sess.userID != "" && sess.userID != u.ID {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "Acesso não autorizado a esta instância."})
		return nil
	}
	return sess
}

func (s *server) handleEvents(w http.ResponseWriter, r *http.Request) {
	u := s.authUser(r)
	userID := ""
	role := "anonymous"
	if u != nil {
		userID = u.ID
		role = string(u.Role)
	}
	s.broker.serveSSE(w, r, clientID(r), userID, role)
}

func (s *server) checkInstanceQuota(r *http.Request) (string, error) {
	u := s.authUser(r)
	if u == nil {
		return "", nil
	}
	if u.Status == "suspended" {
		return "", errors.New("Sua conta está suspensa. Entre em contato com o suporte.")
	}
	if u.TrialEndsAt > 0 && u.TrialEndsAt < time.Now().UnixMilli() {
		return "", errors.New("Seu período de teste expirou. Faça upgrade do seu plano para continuar utilizando o sistema.")
	}
	if u.Role != RoleAdmin {
		currentCount, _ := s.sessions.store.countByUser(r.Context(), u.ID)
		maxInstances := u.MaxInstances
		if maxInstances <= 0 {
			maxInstances = 1
		}
		if currentCount >= maxInstances {
			return "", fmt.Errorf("Limite de instâncias atingido (%d/%d). Faça upgrade do seu plano para adicionar mais linhas.", currentCount, maxInstances)
		}
	}
	return u.ID, nil
}

func (s *server) handleSessionList(w http.ResponseWriter, r *http.Request) {
	u := s.authUser(r)
	if u != nil && u.Role != RoleAdmin {
		writeJSON(w, http.StatusOK, map[string]any{"sessions": s.sessions.infos(u.ID)})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"sessions": s.sessions.infos()})
}

func (s *server) handleV1SessionList(w http.ResponseWriter, r *http.Request) {
	if !s.checkVoiceAuth(r) {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized: invalid API key"})
		return
	}
	u := s.authUser(r)
	if u != nil && u.Role != RoleAdmin {
		writeJSON(w, http.StatusOK, map[string]any{"sessions": s.sessions.infos(u.ID)})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"sessions": s.sessions.infos()})
}

func (s *server) handleV1SessionCreate(w http.ResponseWriter, r *http.Request) {
	if !s.checkVoiceAuth(r) {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized: invalid API key"})
		return
	}
	userID, err := s.checkInstanceQuota(r)
	if err != nil {
		writeJSON(w, http.StatusForbidden, map[string]any{"error": err.Error(), "code": "QUOTA_EXCEEDED"})
		return
	}
	var body struct {
		Name         string `json:"name"`
		InstanceName string `json:"instanceName"`
		Token        string `json:"token"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	name := strings.TrimSpace(body.Name)
	if name == "" {
		name = strings.TrimSpace(body.InstanceName)
	}
	if name == "" {
		name = "Session"
	}
	id, token, err := s.sessions.CreateForUser(name, userID, body.Token)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	sess, _ := s.sessions.Get(id)
	var qrCode, qrB64 string
	if sess != nil {
		// Wait up to 2.5 seconds for QR code from WhatsApp websocket
		qrCode, qrB64, _ = sess.getQRCode(r.Context(), 2500*time.Millisecond)
	}

	info := SessionInfo{
		ID:     id,
		Name:   name,
		Token:  token,
		State:  "connecting",
		Paired: false,
	}
	if sess != nil {
		info = sess.info()
	}

	resp := map[string]any{
		"status": "created",
		"instance": map[string]any{
			"id":     id,
			"name":   name,
			"token":  token,
			"state":  info.State,
			"paired": info.Paired,
		},
	}
	if qrCode != "" {
		resp["qrcode"] = map[string]any{
			"code":   qrCode,
			"base64": qrB64,
		}
	}
	writeJSON(w, http.StatusOK, resp)
}

func (s *server) handleV1SessionGet(w http.ResponseWriter, r *http.Request) {
	auth, isMaster, authSess := s.authenticateRequest(r)
	if !auth {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	sid := strings.TrimSpace(r.PathValue("sid"))
	var sess *Session
	if sid != "" {
		sess, _ = s.sessions.GetByIDOrName(sid)
	} else if !isMaster && authSess != nil {
		sess = authSess
	}

	if sess == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Instance not found"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"instance": sess.info()})
}

func (s *server) handleV1SessionQR(w http.ResponseWriter, r *http.Request) {
	auth, isMaster, authSess := s.authenticateRequest(r)
	if !auth {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized: invalid API key or instance token"})
		return
	}

	sid := strings.TrimSpace(r.PathValue("sid"))
	var sess *Session
	if sid != "" {
		sess, _ = s.sessions.GetByIDOrName(sid)
	} else if !isMaster && authSess != nil {
		sess = authSess
	} else {
		// If sid empty and master, look for first unpaired session, or first session
		for _, sID := range s.sessions.order {
			if cand, ok := s.sessions.Get(sID); ok && cand != nil && !cand.auth.Paired {
				sess = cand
				break
			}
		}
	}

	if sess == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Instance not found"})
		return
	}

	info := sess.info()
	if info.Paired {
		writeJSON(w, http.StatusOK, map[string]any{
			"status":   "connected",
			"message":  "Instância já está conectada.",
			"instance": info,
		})
		return
	}

	code, b64, err := sess.getQRCode(r.Context(), 3*time.Second)
	if err != nil && code == "" {
		writeJSON(w, http.StatusOK, map[string]any{
			"status":   "generating_qr",
			"message":  "QR Code sendo gerado pelo WhatsApp, tente novamente em 1 segundo.",
			"instance": info,
		})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"status": "scan_qr_code",
		"instance": map[string]any{
			"id":    sess.id,
			"name":  sess.name,
			"token": sess.token,
		},
		"qrcode": map[string]any{
			"code":   code,
			"base64": b64,
		},
	})
}

func (s *server) handleV1SessionPairPhone(w http.ResponseWriter, r *http.Request) {
	auth, isMaster, authSess := s.authenticateRequest(r)
	if !auth {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	sid := strings.TrimSpace(r.PathValue("sid"))
	var sess *Session
	if sid != "" {
		sess, _ = s.sessions.GetByIDOrName(sid)
	} else if !isMaster && authSess != nil {
		sess = authSess
	}

	if sess == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Instance not found"})
		return
	}

	var body struct {
		Phone string `json:"phone"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	phone := phoneDigitsRegex.ReplaceAllString(body.Phone, "")
	if phone == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing phone number"})
		return
	}
	if len(phone) == 10 || len(phone) == 11 {
		phone = "55" + phone
	}

	_ = sess.client.Connect()
	time.Sleep(500 * time.Millisecond)

	pairingCode, err := sess.client.PairPhone(r.Context(), phone, true, whatsmeow.PairClientChrome, "Chrome (Linux)")
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"status":      "pairing_code_generated",
		"phone":       phone,
		"pairingCode": pairingCode,
	})
}

func (s *server) handleV1SessionPair(w http.ResponseWriter, r *http.Request) {
	if !s.checkVoiceAuth(r) {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized: invalid API key"})
		return
	}
	s.handleSessionPair(w, r)
}

func (s *server) handleV1SessionLogout(w http.ResponseWriter, r *http.Request) {
	if !s.checkVoiceAuth(r) {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized: invalid API key"})
		return
	}
	s.handleSessionLogout(w, r)
}

func (s *server) handleV1SessionDelete(w http.ResponseWriter, r *http.Request) {
	if !s.checkVoiceAuth(r) {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized: invalid API key"})
		return
	}
	s.handleSessionDelete(w, r)
}

func (s *server) handleSessionCreate(w http.ResponseWriter, r *http.Request) {
	userID, err := s.checkInstanceQuota(r)
	if err != nil {
		writeJSON(w, http.StatusForbidden, map[string]any{"error": err.Error(), "code": "QUOTA_EXCEEDED"})
		return
	}
	var body struct {
		Name         string `json:"name"`
		InstanceName string `json:"instanceName"`
		Token        string `json:"token"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	name := strings.TrimSpace(body.Name)
	if name == "" {
		name = strings.TrimSpace(body.InstanceName)
	}
	if name == "" {
		name = "Session"
	}
	id, token, err := s.sessions.CreateForUser(name, userID, body.Token)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"id": id, "token": token})
}

func (s *server) handleSessionRename(w http.ResponseWriter, r *http.Request) {
	sid := r.PathValue("sid")
	sess, ok := s.sessions.Get(sid)
	if !ok {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "no such session"})
		return
	}
	if u := s.authUser(r); u != nil && u.Role != RoleAdmin && sess.userID != "" && sess.userID != u.ID {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "Acesso não autorizado a esta instância."})
		return
	}

	var body struct {
		Name string `json:"name"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	name := strings.TrimSpace(body.Name)
	if name == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "name cannot be empty"})
		return
	}
	if err := s.sessions.Rename(sid, name); err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *server) handleSessionDelete(w http.ResponseWriter, r *http.Request) {
	sid := r.PathValue("sid")
	sess, ok := s.sessions.Get(sid)
	if ok && sess != nil {
		if u := s.authUser(r); u != nil && u.Role != RoleAdmin && sess.userID != "" && sess.userID != u.ID {
			writeJSON(w, http.StatusForbidden, map[string]string{"error": "Acesso não autorizado a esta instância."})
			return
		}
	}

	if err := s.sessions.Delete(r.Context(), sid); err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": err.Error()})
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *server) handleSessionLogout(w http.ResponseWriter, r *http.Request) {
	sid := r.PathValue("sid")
	sess, ok := s.sessions.Get(sid)
	if ok && sess != nil {
		if u := s.authUser(r); u != nil && u.Role != RoleAdmin && sess.userID != "" && sess.userID != u.ID {
			writeJSON(w, http.StatusForbidden, map[string]string{"error": "Acesso não autorizado a esta instância."})
			return
		}
	}
	if err := s.sessions.Logout(r.Context(), sid); err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": err.Error()})
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *server) handleSessionPair(w http.ResponseWriter, r *http.Request) {
	sid := r.PathValue("sid")
	sess, ok := s.sessions.Get(sid)
	if ok && sess != nil {
		if u := s.authUser(r); u != nil && u.Role != RoleAdmin && sess.userID != "" && sess.userID != u.ID {
			writeJSON(w, http.StatusForbidden, map[string]string{"error": "Acesso não autorizado a esta instância."})
			return
		}
	}
	if err := s.sessions.Pair(sid); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *server) handleStartCall(w http.ResponseWriter, r *http.Request) {
	if sess := s.sessionByID(w, r, r.PathValue("sid")); sess != nil {
		s.doStartCall(sess, w, r)
	}
}

func (s *server) handleWebRTC(w http.ResponseWriter, r *http.Request) {
	if sess := s.sessionByID(w, r, r.PathValue("sid")); sess != nil {
		s.doWebRTC(sess, w, r)
	}
}

func (s *server) handleAccept(w http.ResponseWriter, r *http.Request) {
	if sess := s.sessionByID(w, r, r.PathValue("sid")); sess != nil {
		s.doAccept(sess, w, r)
	}
}

func (s *server) handleReject(w http.ResponseWriter, r *http.Request) {
	if sess := s.sessionByID(w, r, r.PathValue("sid")); sess != nil {
		s.doReject(sess, w, r)
	}
}

func (s *server) handleEndCall(w http.ResponseWriter, r *http.Request) {
	if sess := s.sessionByID(w, r, r.PathValue("sid")); sess != nil {
		s.doEndCall(sess, w, r)
	}
}

func (s *server) handleHistory(w http.ResponseWriter, r *http.Request) {
	if sess := s.sessionByID(w, r, r.PathValue("sid")); sess != nil {
		writeJSON(w, http.StatusOK, map[string]any{"rows": s.broker.historyRows(sess.id, 50)})
	}
}

func (s *server) doStartCall(sess *Session, w http.ResponseWriter, r *http.Request) {
	if sess.client.Store.ID == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "not paired"})
		return
	}
	var body struct {
		Phone      string `json:"phone"`
		DurationMs int    `json:"duration_ms"`
		Record     bool   `json:"record"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || strings.TrimSpace(body.Phone) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "phone required"})
		return
	}
	owner := s.getOwnerName(r)
	if other := s.broker.ownerActiveCall(owner); other != "" {
		writeJSON(w, http.StatusConflict, map[string]string{"error": "operator already on a call"})
		return
	}
	if max := s.sessions.maxCalls; max > 0 && sess.reg.count() >= max {
		writeJSON(w, http.StatusTooManyRequests, map[string]string{"error": "max concurrent calls"})
		return
	}
	phone := normalizePhone(body.Phone)
	resp, err := sess.client.IsOnWhatsApp(r.Context(), []string{phone})
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to check whatsapp user: " + err.Error()})
		return
	}
	if len(resp) == 0 || !resp[0].IsIn {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "number is not registered on WhatsApp"})
		return
	}
	peer := resp[0].JID
	name, pictureURL := sess.resolveContactInfo(r.Context(), peer)
	s.log.Info("resolved target JID for call", "input", body.Phone, "resolved_jid", peer.String(), "name", name, "picture_url", pictureURL)

	callID, err := sess.startOutgoing(r.Context(), peer, false)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	s.broker.upsertCall(CallRecord{
		SessionID: sess.id, SessionName: sess.name, SessionPhone: sess.getOwnPhone(), SessionPictureURL: sess.getOwnPictureURL(),
		CallID: callID, Owner: &owner, Direction: "outbound", Peer: peer.ToNonAD().String(),
		Name: name, PictureURL: pictureURL, StartedAt: time.Now().UnixMilli(), Status: StatusRinging,
	})
	writeJSON(w, http.StatusOK, map[string]any{"call": map[string]string{"callId": callID, "peer": peer.String(), "name": name, "pictureUrl": pictureURL}})
}

func (s *server) doWebRTC(sess *Session, w http.ResponseWriter, r *http.Request) {
	callID := r.PathValue("id")
	ac, ok := sess.reg.get(callID)
	if !ok {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "no such call"})
		return
	}
	var body struct {
		SDPOffer string `json:"sdp_offer"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.SDPOffer == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "sdp_offer required"})
		return
	}
	bridge, answer, err := NewBridge(body.SDPOffer, s.log)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	bridge.OnBrowserPCM = func(pcm []float32) {
		ac.cm.FeedCapturedPCM(pcm)
	}
	bridge.OnTerminalICE = func() {
		go sess.terminateCall(callID, core.EndCallReasonUserEnded)
	}
	sess.setBridge(callID, bridge)
	writeJSON(w, http.StatusOK, map[string]string{"sdp_answer": answer})
}

func (s *server) doAccept(sess *Session, w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	ac, ok := sess.reg.get(id)
	if !ok {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "no such call"})
		return
	}
	owner := s.getOwnerName(r)
	if other := s.broker.ownerActiveCall(owner); other != "" && other != id {
		writeJSON(w, http.StatusConflict, map[string]string{"error": "operator already on a call"})
		return
	}
	if !s.broker.setOwner(id, owner) {
		writeJSON(w, http.StatusConflict, map[string]string{"error": "claimed by another client"})
		return
	}
	s.broker.emitIncomingClaimed(sess.id, id, owner)
	if err := ac.cm.AcceptCall(r.Context(), id); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"call": map[string]string{"callId": id}})
}

func (s *server) doReject(sess *Session, w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if ac, ok := sess.reg.get(id); ok {
		_ = ac.cm.RejectCall(r.Context(), id, core.EndCallReasonDeclined)
	}
	sess.removeCall(id)
	s.broker.endCall(id, string(core.EndCallReasonDeclined))
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *server) doEndCall(sess *Session, w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if ac, ok := sess.reg.get(id); ok {
		_ = ac.cm.EndCall(r.Context(), core.EndCallReasonUserEnded)
	}
	sess.removeCall(id)
	s.broker.endCall(id, string(core.EndCallReasonUserEnded))
	w.WriteHeader(http.StatusNoContent)
}

func normalizePhone(p string) string {
	p = strings.TrimSpace(p)
	p = strings.TrimPrefix(p, "+")
	var b strings.Builder
	for _, c := range p {
		if c >= '0' && c <= '9' {
			b.WriteRune(c)
		}
	}
	return b.String()
}

func (s *server) authUser(r *http.Request) *User {
	authHeader := strings.TrimSpace(r.Header.Get("Authorization"))
	tok := ""
	if strings.HasPrefix(strings.ToLower(authHeader), "bearer ") {
		tok = strings.TrimSpace(authHeader[7:])
	} else if authHeader != "" && !strings.Contains(authHeader, " ") {
		tok = authHeader
	} else {
		tok = strings.TrimSpace(r.Header.Get("X-Client-Id"))
	}
	if tok == "" {
		tok = strings.TrimSpace(r.URL.Query().Get("token"))
	}
	if tok == "" {
		return nil
	}
	userID := s.users.validateToken(tok)
	if userID == "" {
		return nil
	}
	u, _ := s.users.getUserByID(r.Context(), userID)
	return u
}

func (s *server) handleAuthLogin(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json body"})
		return
	}

	u, err := s.users.getUserByEmail(r.Context(), body.Email)
	if err != nil || u == nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "E-mail ou senha incorretos."})
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(body.Password)); err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "E-mail ou senha incorretos."})
		return
	}

	if u.Status == "suspended" {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "Sua conta está suspensa. Entre em contato com o administrador."})
		return
	}

	token := s.users.createToken(r.Context(), u.ID)
	writeJSON(w, http.StatusOK, map[string]any{
		"token": token,
		"user":  u,
	})
}

func (s *server) handleAuthRegister(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name     string `json:"name"`
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Dados inválidos."})
		return
	}

	body.Name = strings.TrimSpace(body.Name)
	body.Email = strings.ToLower(strings.TrimSpace(body.Email))
	if body.Name == "" || body.Email == "" || len(body.Password) < 6 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Nome, e-mail válido e senha de no mínimo 6 caracteres são obrigatórios."})
		return
	}

	plan, err := s.plans.getDefaultPlan(r.Context())
	planID := "plan_free"
	trialDays := 0
	if err == nil && plan != nil {
		planID = plan.ID
		trialDays = plan.TrialDays
	}

	u, err := s.users.createUser(r.Context(), body.Name, body.Email, body.Password, RoleUser, planID, trialDays)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	token := s.users.createToken(r.Context(), u.ID)
	writeJSON(w, http.StatusCreated, map[string]any{
		"token": token,
		"user":  u,
	})
}

func (s *server) handleAuthLogout(w http.ResponseWriter, r *http.Request) {
	authHeader := r.Header.Get("Authorization")
	tok := ""
	if strings.HasPrefix(authHeader, "Bearer ") {
		tok = strings.TrimPrefix(authHeader, "Bearer ")
	} else {
		tok = r.Header.Get("X-Client-Id")
	}
	if tok != "" {
		s.users.revokeToken(r.Context(), tok)
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "logged_out"})
}

func (s *server) handleAuthMe(w http.ResponseWriter, r *http.Request) {
	u := s.authUser(r)
	if u == nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "não autenticado"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"user": u})
}

// Plan Handlers
func (s *server) handlePlanList(w http.ResponseWriter, r *http.Request) {
	u := s.authUser(r)
	onlyActive := true
	if u != nil && u.Role == RoleAdmin {
		onlyActive = false
	}
	plans, err := s.plans.listPlans(r.Context(), onlyActive)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"plans": plans})
}

func (s *server) handlePlanCreate(w http.ResponseWriter, r *http.Request) {
	u := s.authUser(r)
	if u == nil || u.Role != RoleAdmin {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "Acesso restrito a administradores."})
		return
	}
	var p Plan
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Dados inválidos."})
		return
	}
	created, err := s.plans.createPlan(r.Context(), p)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"plan": created})
}

func (s *server) handlePlanUpdate(w http.ResponseWriter, r *http.Request) {
	u := s.authUser(r)
	if u == nil || u.Role != RoleAdmin {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "Acesso restrito a administradores."})
		return
	}
	id := r.PathValue("id")
	var p Plan
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Dados inválidos."})
		return
	}
	p.ID = id
	updated, err := s.plans.updatePlan(r.Context(), p)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"plan": updated})
}

func (s *server) handlePlanDelete(w http.ResponseWriter, r *http.Request) {
	u := s.authUser(r)
	if u == nil || u.Role != RoleAdmin {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "Acesso restrito a administradores."})
		return
	}
	id := r.PathValue("id")
	if err := s.plans.deletePlan(r.Context(), id); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

func (s *server) handleUserList(w http.ResponseWriter, r *http.Request) {
	u := s.authUser(r)
	if u == nil || u.Role != RoleAdmin {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "Acesso restrito a administradores."})
		return
	}

	users, err := s.users.listUsers(r.Context())
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"users": users})
}

func (s *server) handleUserCreate(w http.ResponseWriter, r *http.Request) {
	u := s.authUser(r)
	if u == nil || u.Role != RoleAdmin {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "Acesso restrito a administradores."})
		return
	}

	var body struct {
		Name     string   `json:"name"`
		Email    string   `json:"email"`
		Password string   `json:"password"`
		Role     UserRole `json:"role"`
		PlanID   string   `json:"planId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json body"})
		return
	}

	if body.Role != RoleAdmin && body.Role != RoleUser {
		body.Role = RoleUser
	}
	if body.PlanID == "" {
		body.PlanID = "plan_free"
	}

	newUser, err := s.users.createUser(r.Context(), body.Name, body.Email, body.Password, body.Role, body.PlanID, 0)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"user": newUser})
}

func (s *server) handleUserUpdate(w http.ResponseWriter, r *http.Request) {
	u := s.authUser(r)
	if u == nil || u.Role != RoleAdmin {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "Acesso restrito a administradores."})
		return
	}

	targetID := r.PathValue("id")
	var body struct {
		Name     string   `json:"name"`
		Email    string   `json:"email"`
		Password string   `json:"password"`
		Role     UserRole `json:"role"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)

	updatedUser, err := s.users.updateUser(r.Context(), targetID, body.Name, body.Email, body.Password, body.Role)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"user": updatedUser})
}

func (s *server) handleUserPlanUpdate(w http.ResponseWriter, r *http.Request) {
	u := s.authUser(r)
	if u == nil || u.Role != RoleAdmin {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "Acesso restrito a administradores."})
		return
	}

	targetID := r.PathValue("id")
	var body struct {
		PlanID             string `json:"planId"`
		CustomMaxInstances int    `json:"customMaxInstances"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Dados inválidos."})
		return
	}

	updatedUser, err := s.users.updateUserPlan(r.Context(), targetID, body.PlanID, body.CustomMaxInstances)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"user": updatedUser})
}

func (s *server) handleUserStatusUpdate(w http.ResponseWriter, r *http.Request) {
	u := s.authUser(r)
	if u == nil || u.Role != RoleAdmin {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "Acesso restrito a administradores."})
		return
	}

	targetID := r.PathValue("id")
	var body struct {
		Status string `json:"status"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Dados inválidos."})
		return
	}
	if body.Status != "active" && body.Status != "suspended" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Status inválido."})
		return
	}

	updatedUser, err := s.users.updateUserStatus(r.Context(), targetID, body.Status)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"user": updatedUser})
}

func (s *server) handleUserDelete(w http.ResponseWriter, r *http.Request) {
	u := s.authUser(r)
	if u == nil || u.Role != RoleAdmin {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "Acesso restrito a administradores."})
		return
	}

	targetID := r.PathValue("id")
	if u.ID == targetID {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Você não pode excluir sua própria conta de administrador."})
		return
	}

	if err := s.users.deleteUser(r.Context(), targetID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (s *server) handleCallHistory(w http.ResponseWriter, r *http.Request) {
	u := s.authUser(r)
	if u == nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Não autenticado."})
		return
	}

	q := r.URL.Query()
	page := 1
	if p := q.Get("page"); p != "" {
		fmt.Sscanf(p, "%d", &page)
	}
	limit := 20
	if l := q.Get("limit"); l != "" {
		fmt.Sscanf(l, "%d", &limit)
	}
	var startDt, endDt int64
	if st := q.Get("startDate"); st != "" {
		fmt.Sscanf(st, "%d", &startDt)
	}
	if et := q.Get("endDate"); et != "" {
		fmt.Sscanf(et, "%d", &endDt)
	}

	filter := CallFilter{
		SessionID: q.Get("sessionId"),
		Owner:     q.Get("owner"),
		Direction: q.Get("direction"),
		Status:    q.Get("status"),
		Search:    q.Get("search"),
		StartDate: startDt,
		EndDate:   endDt,
		Page:      page,
		Limit:     limit,
	}
	if u.Role != RoleAdmin {
		filter.UserID = u.ID
	}

	records, total, err := s.calls.ListHistory(r.Context(), filter)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"records": records,
		"total":   total,
		"page":    page,
		"limit":   limit,
	})
}

func (s *server) handleCallAnalytics(w http.ResponseWriter, r *http.Request) {
	u := s.authUser(r)
	if u == nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Não autenticado."})
		return
	}

	q := r.URL.Query()
	var startDt, endDt int64
	if st := q.Get("startDate"); st != "" {
		fmt.Sscanf(st, "%d", &startDt)
	}
	if et := q.Get("endDate"); et != "" {
		fmt.Sscanf(et, "%d", &endDt)
	}

	filter := CallFilter{
		SessionID: q.Get("sessionId"),
		Owner:     q.Get("owner"),
		StartDate: startDt,
		EndDate:   endDt,
	}
	if u.Role != RoleAdmin {
		filter.UserID = u.ID
	}

	if s.broker != nil && s.calls != nil {
		s.broker.mu.RLock()
		for _, c := range s.broker.calls {
			if c != nil {
				_ = s.calls.SaveOrUpdate(r.Context(), *c)
			}
		}
		s.broker.mu.RUnlock()
	}

	analytics, err := s.calls.GetAnalytics(r.Context(), filter)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, analytics)
}

// Contacts handlers
func (s *server) handleContactList(w http.ResponseWriter, r *http.Request) {
	u := s.authUser(r)
	if u == nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Não autenticado."})
		return
	}

	q := r.URL.Query()
	page := 1
	limit := 50
	if p := q.Get("page"); p != "" {
		fmt.Sscanf(p, "%d", &page)
	}
	if l := q.Get("limit"); l != "" {
		fmt.Sscanf(l, "%d", &limit)
	}

	filter := ContactFilter{
		Search: q.Get("search"),
		Page:   page,
		Limit:  limit,
	}
	if u.Role != RoleAdmin {
		filter.UserID = u.ID
	}

	resp, err := s.contacts.List(r.Context(), filter)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, resp)
}

func (s *server) handleContactCreate(w http.ResponseWriter, r *http.Request) {
	u := s.authUser(r)
	if u == nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Não autenticado."})
		return
	}

	var req Contact
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "JSON inválido."})
		return
	}

	if req.Name == "" || req.Phone == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Nome e Telefone são obrigatórios."})
		return
	}
	req.UserID = u.ID

	c, err := s.contacts.Create(r.Context(), req)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusCreated, c)
}

func (s *server) handleContactUpdate(w http.ResponseWriter, r *http.Request) {
	u := s.authUser(r)
	if u == nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Não autenticado."})
		return
	}

	id := r.PathValue("id")
	if u.Role != RoleAdmin {
		existing, err := s.contacts.GetByID(r.Context(), id)
		if err != nil || (existing.UserID != "" && existing.UserID != u.ID) {
			writeJSON(w, http.StatusForbidden, map[string]string{"error": "Sem permissão para alterar este contato."})
			return
		}
	}

	var req Contact
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "JSON inválido."})
		return
	}
	req.ID = id
	req.UserID = u.ID

	c, err := s.contacts.Update(r.Context(), req)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, c)
}

func (s *server) handleContactDelete(w http.ResponseWriter, r *http.Request) {
	u := s.authUser(r)
	if u == nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Não autenticado."})
		return
	}

	id := r.PathValue("id")
	if u.Role != RoleAdmin {
		existing, err := s.contacts.GetByID(r.Context(), id)
		if err != nil || (existing.UserID != "" && existing.UserID != u.ID) {
			writeJSON(w, http.StatusForbidden, map[string]string{"error": "Sem permissão para excluir este contato."})
			return
		}
	}

	if err := s.contacts.Delete(r.Context(), id); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"message": "Contato excluído."})
}

// Campaign handlers
func (s *server) handleCampaignList(w http.ResponseWriter, r *http.Request) {
	u := s.authUser(r)
	if u == nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Não autenticado."})
		return
	}

	userID := ""
	if u.Role != RoleAdmin {
		userID = u.ID
	}

	list, err := s.campaigns.List(r.Context(), userID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, list)
}

type createCampaignReq struct {
	Name         string         `json:"name"`
	SessionID    string         `json:"sessionId"`
	Playbook     string         `json:"playbook"`
	DelaySeconds int            `json:"delaySeconds"`
	Items        []CampaignItem `json:"items"`
}

func (s *server) handleCampaignCreate(w http.ResponseWriter, r *http.Request) {
	u := s.authUser(r)
	if u == nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Não autenticado."})
		return
	}

	var req createCampaignReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "JSON inválido."})
		return
	}

	if req.Name == "" || req.SessionID == "" || len(req.Items) == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Nome da campanha, Conta WhatsApp e Lista de Contatos são obrigatórios."})
		return
	}

	cmp := Campaign{
		UserID:       u.ID,
		Name:         req.Name,
		SessionID:    req.SessionID,
		Playbook:     req.Playbook,
		DelaySeconds: req.DelaySeconds,
	}

	created, err := s.campaigns.Create(r.Context(), cmp, req.Items)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusCreated, created)
}

func (s *server) handleCampaignGet(w http.ResponseWriter, r *http.Request) {
	u := s.authUser(r)
	if u == nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Não autenticado."})
		return
	}

	id := r.PathValue("id")
	cmp, err := s.campaigns.GetByID(r.Context(), id)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Campanha não encontrada."})
		return
	}

	if u.Role != RoleAdmin && cmp.UserID != "" && cmp.UserID != u.ID {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "Sem permissão para acessar esta campanha."})
		return
	}

	writeJSON(w, http.StatusOK, cmp)
}

func (s *server) handleCampaignStatusUpdate(w http.ResponseWriter, r *http.Request) {
	u := s.authUser(r)
	if u == nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Não autenticado."})
		return
	}

	id := r.PathValue("id")
	if u.Role != RoleAdmin {
		cmp, err := s.campaigns.GetByID(r.Context(), id)
		if err != nil || (cmp.UserID != "" && cmp.UserID != u.ID) {
			writeJSON(w, http.StatusForbidden, map[string]string{"error": "Sem permissão para alterar esta campanha."})
			return
		}
	}

	var req struct {
		Status CampaignStatus `json:"status"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "JSON inválido."})
		return
	}

	if err := s.campaigns.UpdateStatus(r.Context(), id, req.Status); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"message": "Status da campanha atualizado."})
}

func (s *server) handleCampaignItemUpdate(w http.ResponseWriter, r *http.Request) {
	u := s.authUser(r)
	if u == nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Não autenticado."})
		return
	}

	itemId := r.PathValue("itemId")
	var req struct {
		Status    CampaignItemStatus `json:"status"`
		EndReason string             `json:"endReason"`
		Notes     string             `json:"notes"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "JSON inválido."})
		return
	}

	if err := s.campaigns.UpdateItem(r.Context(), itemId, req.Status, req.EndReason, req.Notes); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"message": "Item da campanha atualizado."})
}

func (s *server) handleCampaignDelete(w http.ResponseWriter, r *http.Request) {
	u := s.authUser(r)
	if u == nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Não autenticado."})
		return
	}

	id := r.PathValue("id")
	if u.Role != RoleAdmin {
		cmp, err := s.campaigns.GetByID(r.Context(), id)
		if err != nil || (cmp.UserID != "" && cmp.UserID != u.ID) {
			writeJSON(w, http.StatusForbidden, map[string]string{"error": "Sem permissão para excluir esta campanha."})
			return
		}
	}

	if err := s.campaigns.Delete(r.Context(), id); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"message": "Campanha excluída."})
}

// Playbook handlers
func (s *server) handlePlaybookList(w http.ResponseWriter, r *http.Request) {
	u := s.authUser(r)
	if u == nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Não autenticado."})
		return
	}

	userID := ""
	if u.Role != RoleAdmin {
		userID = u.ID
	}

	list, err := s.playbooks.List(r.Context(), userID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, list)
}

func (s *server) handlePlaybookCreate(w http.ResponseWriter, r *http.Request) {
	u := s.authUser(r)
	if u == nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Não autenticado."})
		return
	}

	var req Playbook
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "JSON inválido."})
		return
	}

	if req.Title == "" || req.Content == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Título e Conteúdo do Playbook são obrigatórios."})
		return
	}
	req.UserID = u.ID

	pb, err := s.playbooks.Create(r.Context(), req)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusCreated, pb)
}

func (s *server) handlePlaybookUpdate(w http.ResponseWriter, r *http.Request) {
	u := s.authUser(r)
	if u == nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Não autenticado."})
		return
	}

	id := r.PathValue("id")
	if u.Role != RoleAdmin {
		existing, err := s.playbooks.GetByID(r.Context(), id)
		if err != nil || (existing.UserID != "" && existing.UserID != u.ID) || existing.UserID == "" {
			writeJSON(w, http.StatusForbidden, map[string]string{"error": "Sem permissão para alterar este playbook padrão ou de outro usuário."})
			return
		}
	}

	var req Playbook
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "JSON inválido."})
		return
	}
	req.ID = id
	req.UserID = u.ID

	pb, err := s.playbooks.Update(r.Context(), req)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, pb)
}

func (s *server) handlePlaybookDelete(w http.ResponseWriter, r *http.Request) {
	u := s.authUser(r)
	if u == nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Não autenticado."})
		return
	}

	id := r.PathValue("id")
	if u.Role != RoleAdmin {
		existing, err := s.playbooks.GetByID(r.Context(), id)
		if err != nil || (existing.UserID != "" && existing.UserID != u.ID) || existing.UserID == "" {
			writeJSON(w, http.StatusForbidden, map[string]string{"error": "Sem permissão para excluir este playbook padrão ou de outro usuário."})
			return
		}
	}

	if err := s.playbooks.Delete(r.Context(), id); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"message": "Playbook excluído."})
}

func (s *server) handleCallAudio(w http.ResponseWriter, r *http.Request) {
	callID := r.PathValue("id")
	if callID == "" {
		http.Error(w, "missing call id", http.StatusBadRequest)
		return
	}
	rec, _ := s.calls.GetCallRecord(r.Context(), callID)
	if u := s.authUser(r); u != nil && u.Role != RoleAdmin {
		if rec != nil && rec.UserID != "" && rec.UserID != u.ID {
			http.Error(w, "recording not found", http.StatusNotFound)
			return
		}
	}
	recPath := ""
	if rec != nil {
		recPath = rec.RecordingPath
	}
	if recPath == "" || func() bool { _, err := os.Stat(recPath); return err != nil }() {
		fallback := filepath.Join("recordings", fmt.Sprintf("%s.wav", callID))
		if _, err := os.Stat(fallback); err == nil {
			recPath = fallback
			_ = s.calls.SaveRecordingPath(r.Context(), callID, fallback)
		}
	}
	if recPath == "" {
		http.Error(w, "recording not found", http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "audio/wav")
	http.ServeFile(w, r, recPath)
}

func (s *server) handleV1CallAudio(w http.ResponseWriter, r *http.Request) {
	if !s.checkVoiceAuth(r) {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized: invalid API key"})
		return
	}
	s.handleCallAudio(w, r)
}

func (s *server) handleCallTranscript(w http.ResponseWriter, r *http.Request) {
	callID := r.PathValue("id")
	if callID == "" {
		http.Error(w, "missing call id", http.StatusBadRequest)
		return
	}
	rec, err := s.calls.GetCallRecord(r.Context(), callID)
	if err != nil || rec == nil {
		http.Error(w, "call not found", http.StatusNotFound)
		return
	}
	if u := s.authUser(r); u != nil && u.Role != RoleAdmin {
		if rec.UserID != "" && rec.UserID != u.ID {
			http.Error(w, "call not found", http.StatusNotFound)
			return
		}
	}
	recPath := rec.RecordingPath
	if recPath == "" {
		fallback := filepath.Join("recordings", fmt.Sprintf("%s.wav", callID))
		if _, err := os.Stat(fallback); err == nil {
			recPath = fallback
			_ = s.calls.SaveRecordingPath(r.Context(), callID, fallback)
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"callId":              callID,
		"recordingPath":       recPath,
		"transcriptJson":      rec.TranscriptJSON,
		"transcriptSummary":   rec.TranscriptSummary,
		"transcriptionStatus": rec.TranscriptionStatus,
	})
}

func (s *server) handleCallTranscribe(w http.ResponseWriter, r *http.Request) {
	callID := r.PathValue("id")
	if callID == "" {
		http.Error(w, "missing call id", http.StatusBadRequest)
		return
	}
	rec, err := s.calls.GetCallRecord(r.Context(), callID)
	if u := s.authUser(r); u != nil && u.Role != RoleAdmin {
		if rec != nil && rec.UserID != "" && rec.UserID != u.ID {
			http.Error(w, "call or recording not found", http.StatusNotFound)
			return
		}
	}
	recPath := ""
	if rec != nil {
		recPath = rec.RecordingPath
	}
	if recPath == "" {
		fallback := filepath.Join("recordings", fmt.Sprintf("%s.wav", callID))
		if _, err := os.Stat(fallback); err == nil {
			recPath = fallback
			_ = s.calls.SaveRecordingPath(r.Context(), callID, fallback)
		}
	}
	if recPath == "" {
		http.Error(w, "call or recording not found", http.StatusNotFound)
		return
	}
	res, err := s.transcriber.TranscribeAudio(r.Context(), recPath)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	utterancesJSON, _ := json.Marshal(res.Utterances)
	_ = s.calls.SaveTranscript(r.Context(), callID, string(utterancesJSON), res.Summary, "completed")

	writeJSON(w, http.StatusOK, map[string]any{
		"callId":            callID,
		"transcriptJson":    string(utterancesJSON),
		"transcriptSummary": res.Summary,
		"status":            "completed",
	})
}

func (s *server) handleGetSettings(w http.ResponseWriter, r *http.Request) {
	settings, err := s.settings.GetAll(r.Context())
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{
		"groqApiKey":          settings["groq_api_key"],
		"openaiApiKey":        settings["openai_api_key"],
		"whisperModel":        settings["whisper_model"],
		"openrouterApiKey":    settings["openrouter_api_key"],
		"googleApiKey":        settings["google_api_key"],
		"systemApiKey":        settings["system_api_key"],
		"defaultProvider":     settings["default_ai_provider"],
		"defaultModel":        settings["default_ai_model"],
		"defaultVoice":        settings["default_ai_voice"],
		"defaultPrompt":       settings["default_ai_prompt"],
		"defaultFirstMessage": settings["default_ai_first_message"],
		"agentName":           settings["ai_agent_name"],
		"aiSessionId":         settings["ai_default_session_id"],
		"autoAnswerAi":        settings["auto_answer_ai"],
		"autoAnswerDelaySec":  settings["auto_answer_delay_sec"],
		"messageWebhookUrl":   settings["message_webhook_url"],
		"callWebhookUrl":      settings["call_webhook_url"],
	})
}

func (s *server) handleUpdateSettings(w http.ResponseWriter, r *http.Request) {
	var body struct {
		GroqAPIKey          string `json:"groqApiKey"`
		OpenAIAPIKey        string `json:"openaiApiKey"`
		WhisperModel        string `json:"whisperModel"`
		OpenRouterAPIKey    string `json:"openrouterApiKey"`
		GoogleAPIKey        string `json:"googleApiKey"`
		SystemAPIKey        string `json:"systemApiKey"`
		DefaultProvider     string `json:"defaultProvider"`
		DefaultModel        string `json:"defaultModel"`
		DefaultVoice        string `json:"defaultVoice"`
		DefaultPrompt       string `json:"defaultPrompt"`
		DefaultFirstMessage string `json:"defaultFirstMessage"`
		AgentName           string `json:"agentName"`
		AISessionID         string `json:"aiSessionId"`
		AutoAnswerAI        string `json:"autoAnswerAi"`
		AutoAnswerDelaySec  string `json:"autoAnswerDelaySec"`
		MessageWebhookURL   string `json:"messageWebhookUrl"`
		CallWebhookURL      string `json:"callWebhookUrl"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "JSON inválido."})
		return
	}

	_ = s.settings.Set(r.Context(), "groq_api_key", body.GroqAPIKey)
	_ = s.settings.Set(r.Context(), "openai_api_key", body.OpenAIAPIKey)
	_ = s.settings.Set(r.Context(), "openrouter_api_key", body.OpenRouterAPIKey)
	_ = s.settings.Set(r.Context(), "google_api_key", body.GoogleAPIKey)
	_ = s.settings.Set(r.Context(), "system_api_key", body.SystemAPIKey)
	_ = s.settings.Set(r.Context(), "default_ai_provider", body.DefaultProvider)
	_ = s.settings.Set(r.Context(), "default_ai_model", body.DefaultModel)
	_ = s.settings.Set(r.Context(), "default_ai_voice", body.DefaultVoice)
	_ = s.settings.Set(r.Context(), "default_ai_prompt", body.DefaultPrompt)
	_ = s.settings.Set(r.Context(), "default_ai_first_message", body.DefaultFirstMessage)
	_ = s.settings.Set(r.Context(), "ai_agent_name", body.AgentName)
	_ = s.settings.Set(r.Context(), "ai_default_session_id", body.AISessionID)
	_ = s.settings.Set(r.Context(), "auto_answer_ai", body.AutoAnswerAI)
	_ = s.settings.Set(r.Context(), "auto_answer_delay_sec", body.AutoAnswerDelaySec)
	_ = s.settings.Set(r.Context(), "message_webhook_url", body.MessageWebhookURL)
	_ = s.settings.Set(r.Context(), "call_webhook_url", body.CallWebhookURL)

	if body.WhisperModel != "" {
		_ = s.settings.Set(r.Context(), "whisper_model", body.WhisperModel)
	}

	writeJSON(w, http.StatusOK, map[string]string{"message": "Configurações de IA salvas com sucesso!"})
}
