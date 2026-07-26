package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"atendicalls/internal/voip/core"

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
	mux.HandleFunc("GET /api/auth/me", s.handleAuthMe)

	// Reports & Analytics routes
	mux.HandleFunc("GET /api/calls/history", s.handleCallHistory)
	mux.HandleFunc("GET /api/calls/analytics", s.handleCallAnalytics)

	// User management routes
	mux.HandleFunc("GET /api/users", s.handleUserList)
	mux.HandleFunc("POST /api/users", s.handleUserCreate)
	mux.HandleFunc("PATCH /api/users/{id}", s.handleUserUpdate)
	mux.HandleFunc("DELETE /api/users/{id}", s.handleUserDelete)

	// Contact management routes
	mux.HandleFunc("GET /api/contacts", s.handleContactList)
	mux.HandleFunc("POST /api/contacts", s.handleContactCreate)
	mux.HandleFunc("PUT /api/contacts/{id}", s.handleContactUpdate)
	mux.HandleFunc("DELETE /api/contacts/{id}", s.handleContactDelete)

	// Campaign management routes
	mux.HandleFunc("GET /api/campaigns", s.handleCampaignList)
	mux.HandleFunc("POST /api/campaigns", s.handleCampaignCreate)
	mux.HandleFunc("GET /api/campaigns/{id}", s.handleCampaignGet)
	mux.HandleFunc("POST /api/campaigns/{id}/claim-next", s.handleCampaignClaimNext)
	mux.HandleFunc("PATCH /api/campaigns/{id}/status", s.handleCampaignStatusUpdate)
	mux.HandleFunc("PATCH /api/campaigns/{id}/items/{itemId}", s.handleCampaignItemUpdate)
	mux.HandleFunc("DELETE /api/campaigns/{id}", s.handleCampaignDelete)

	// Playbook management routes
	mux.HandleFunc("GET /api/playbooks", s.handlePlaybookList)
	mux.HandleFunc("POST /api/playbooks", s.handlePlaybookCreate)
	mux.HandleFunc("PUT /api/playbooks/{id}", s.handlePlaybookUpdate)
	mux.HandleFunc("DELETE /api/playbooks/{id}", s.handlePlaybookDelete)

	mux.HandleFunc("GET /api/events", s.handleEvents)

	if s.staticDir != "" {
		if _, err := os.Stat(s.staticDir); err == nil {
			mux.Handle("/", http.FileServer(http.Dir(s.staticDir)))
		}
	}
	return withCORS(mux)
}

func withCORS(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-Client-Id, Authorization")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
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

func (s *server) sessionByID(w http.ResponseWriter, sid string) *Session {
	sess, ok := s.sessions.Get(sid)
	if !ok {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "no such session"})
		return nil
	}
	return sess
}

func (s *server) handleEvents(w http.ResponseWriter, r *http.Request) {
	s.broker.serveSSE(w, r, clientID(r))
}

func (s *server) handleSessionList(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"sessions": s.sessions.infos()})
}

func (s *server) handleSessionCreate(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name string `json:"name"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	name := strings.TrimSpace(body.Name)
	if name == "" {
		name = "Session"
	}
	id, err := s.sessions.Create(name)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"id": id})
}

func (s *server) handleSessionRename(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name string `json:"name"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	name := strings.TrimSpace(body.Name)
	if name == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "name cannot be empty"})
		return
	}
	if err := s.sessions.Rename(r.PathValue("sid"), name); err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *server) handleSessionDelete(w http.ResponseWriter, r *http.Request) {
	if err := s.sessions.Delete(r.Context(), r.PathValue("sid")); err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": err.Error()})
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *server) handleSessionLogout(w http.ResponseWriter, r *http.Request) {
	if err := s.sessions.Logout(r.Context(), r.PathValue("sid")); err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": err.Error()})
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *server) handleSessionPair(w http.ResponseWriter, r *http.Request) {
	if err := s.sessions.Pair(r.PathValue("sid")); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *server) handleStartCall(w http.ResponseWriter, r *http.Request) {
	if sess := s.sessionByID(w, r.PathValue("sid")); sess != nil {
		s.doStartCall(sess, w, r)
	}
}

func (s *server) handleWebRTC(w http.ResponseWriter, r *http.Request) {
	if sess := s.sessionByID(w, r.PathValue("sid")); sess != nil {
		s.doWebRTC(sess, w, r)
	}
}

func (s *server) handleAccept(w http.ResponseWriter, r *http.Request) {
	if sess := s.sessionByID(w, r.PathValue("sid")); sess != nil {
		s.doAccept(sess, w, r)
	}
}

func (s *server) handleReject(w http.ResponseWriter, r *http.Request) {
	if sess := s.sessionByID(w, r.PathValue("sid")); sess != nil {
		s.doReject(sess, w, r)
	}
}

func (s *server) handleEndCall(w http.ResponseWriter, r *http.Request) {
	if sess := s.sessionByID(w, r.PathValue("sid")); sess != nil {
		s.doEndCall(sess, w, r)
	}
}

func (s *server) handleHistory(w http.ResponseWriter, r *http.Request) {
	if sess := s.sessionByID(w, r.PathValue("sid")); sess != nil {
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
	authHeader := r.Header.Get("Authorization")
	tok := ""
	if strings.HasPrefix(authHeader, "Bearer ") {
		tok = strings.TrimPrefix(authHeader, "Bearer ")
	} else {
		tok = r.Header.Get("X-Client-Id")
	}
	if tok != "" {
		userID := s.users.validateToken(tok)
		if userID != "" {
			if u, _ := s.users.getUserByID(r.Context(), userID); u != nil {
				return u
			}
		}
	}

	// Single-tenant fallback: Validate any active RAM token for instant zero-latency responses
	userID := s.users.validateToken("fallback")
	if userID != "" {
		if u, _ := s.users.getUserByID(r.Context(), userID); u != nil {
			return u
		}
	}

	return nil
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

	token := s.users.createToken(u.ID)
	writeJSON(w, http.StatusOK, map[string]any{
		"token": token,
		"user":  u,
	})
}

func (s *server) handleAuthMe(w http.ResponseWriter, r *http.Request) {
	u := s.authUser(r)
	if u == nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "não autenticado"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"user": u})
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
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json body"})
		return
	}

	if body.Role != RoleAdmin && body.Role != RoleUser {
		body.Role = RoleUser
	}

	newUser, err := s.users.createUser(r.Context(), body.Name, body.Email, body.Password, body.Role)
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
	var req Contact
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "JSON inválido."})
		return
	}
	req.ID = id

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

	list, err := s.campaigns.List(r.Context())
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

	writeJSON(w, http.StatusOK, cmp)
}

type claimNextReq struct {
	AgentName string `json:"agentName"`
}

func (s *server) handleCampaignClaimNext(w http.ResponseWriter, r *http.Request) {
	u := s.authUser(r)
	if u == nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Não autenticado."})
		return
	}

	campaignId := r.PathValue("id")
	var req claimNextReq
	_ = json.NewDecoder(r.Body).Decode(&req)
	if req.AgentName == "" {
		req.AgentName = u.Name
		if req.AgentName == "" {
			req.AgentName = u.Email
		}
	}

	item, err := s.campaigns.ClaimNextItem(r.Context(), campaignId, req.AgentName)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	if item == nil {
		writeJSON(w, http.StatusOK, map[string]any{"completed": true, "item": nil})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"completed": false, "item": item})
}

func (s *server) handleCampaignStatusUpdate(w http.ResponseWriter, r *http.Request) {
	u := s.authUser(r)
	if u == nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Não autenticado."})
		return
	}

	id := r.PathValue("id")
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

	list, err := s.playbooks.List(r.Context())
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
	var req Playbook
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "JSON inválido."})
		return
	}
	req.ID = id

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
	if err := s.playbooks.Delete(r.Context(), id); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"message": "Playbook excluído."})
}
