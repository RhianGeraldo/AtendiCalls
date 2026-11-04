package main

import (
	"context"
	"encoding/json"
	"net/http"
	"sync"
	"time"
)

type CallStatus string

const (
	StatusStarting   CallStatus = "starting"
	StatusRinging    CallStatus = "ringing"
	StatusConnecting CallStatus = "connecting"
	StatusConnected  CallStatus = "connected"
	StatusEnded      CallStatus = "ended"
)

type CallRecord struct {
	SessionID         string     `gorm:"column:session_id;index;not null" json:"sessionId"`
	SessionName       string     `gorm:"column:session_name;default:''" json:"sessionName,omitempty"`
	SessionPhone      string     `gorm:"column:session_phone;default:''" json:"sessionPhone,omitempty"`
	SessionPictureURL string     `gorm:"column:session_picture_url;default:''" json:"sessionPictureUrl,omitempty"`
	CallID            string     `gorm:"column:id;primaryKey" json:"callId"`
	UserID            string     `gorm:"column:user_id;index;default:''" json:"userId,omitempty"`
	Owner             *string    `gorm:"column:owner;index" json:"owner"`
	Direction         string     `gorm:"column:direction;not null" json:"direction"`
	Peer              string     `gorm:"column:peer;not null" json:"peer"`
	Name              string     `gorm:"column:peer_name;default:''" json:"name,omitempty"`
	PictureURL        string     `gorm:"column:picture_url;default:''" json:"pictureUrl,omitempty"`
	StartedAt         int64      `gorm:"column:started_at;index;not null" json:"startedAt"`
	ConnectedAt       *int64     `gorm:"column:connected_at" json:"connectedAt,omitempty"`
	Status            CallStatus `gorm:"column:status;not null" json:"status"`
	EndedAt           *int64     `gorm:"column:ended_at" json:"endedAt,omitempty"`
	EndReason         string     `gorm:"column:end_reason;default:''" json:"endReason,omitempty"`
	DurationSec       int        `gorm:"column:duration_seconds;default:0" json:"durationSeconds,omitempty"`

	RecordingPath       string `gorm:"column:recording_path;default:''" json:"recordingPath,omitempty"`
	TranscriptJSON      string `gorm:"column:transcript_json;type:text;default:''" json:"transcriptJson,omitempty"`
	TranscriptSummary   string `gorm:"column:transcript_summary;type:text;default:''" json:"transcriptSummary,omitempty"`
	TranscriptionStatus string `gorm:"column:transcription_status;default:''" json:"transcriptionStatus,omitempty"`
}

func (CallRecord) TableName() string {
	return "call_records"
}

type AuthSnapshot struct {
	State  string `json:"state"`
	Paired bool   `json:"paired"`
	QR     string `json:"qr,omitempty"`
}

type SessionInfo struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Token      string `json:"token,omitempty"`
	UserID     string `json:"userId,omitempty"`
	JID        string `json:"jid"`
	Phone      string `json:"phone,omitempty"`
	PushName   string `json:"pushName,omitempty"`
	PictureURL string `json:"pictureUrl,omitempty"`
	StatusText string `json:"statusText,omitempty"`
	State      string `json:"state"`
	Paired     bool   `json:"paired"`
	QR         string `json:"qr,omitempty"`
}

type subscriber struct {
	clientID string
	userID   string
	role     string
	ch       chan []byte
}

type Broker struct {
	mu        sync.RWMutex
	subs      map[*subscriber]struct{}
	calls     map[string]*CallRecord
	history   []CallRecord
	callStore *callStore

	SnapshotFn     func(userID, role string) []any
	SessionOwnerFn func(sessionID string) string
}

func NewBroker() *Broker {
	return &Broker{
		subs:  map[*subscriber]struct{}{},
		calls: map[string]*CallRecord{},
	}
}

func (b *Broker) subscribe(clientID, userID, role string) *subscriber {
	s := &subscriber{clientID: clientID, userID: userID, role: role, ch: make(chan []byte, 32)}
	b.mu.Lock()
	b.subs[s] = struct{}{}
	b.mu.Unlock()
	return s
}

func (b *Broker) unsubscribe(s *subscriber) {
	b.mu.Lock()
	delete(b.subs, s)
	b.mu.Unlock()
	close(s.ch)
}

func (b *Broker) sessionOwner(sessionID string) string {
	if b.SessionOwnerFn != nil && sessionID != "" {
		return b.SessionOwnerFn(sessionID)
	}
	return ""
}

func (b *Broker) broadcastSessionScoped(sessionID string, ev any) {
	data, err := json.Marshal(ev)
	if err != nil {
		return
	}
	ownerID := b.sessionOwner(sessionID)
	b.mu.RLock()
	defer b.mu.RUnlock()
	for s := range b.subs {
		if s.role == string(RoleAdmin) || (ownerID != "" && s.userID == ownerID) {
			select {
			case s.ch <- data:
			default:
			}
		}
	}
}

func (b *Broker) broadcast(ev any) {
	data, err := json.Marshal(ev)
	if err != nil {
		return
	}
	b.mu.RLock()
	defer b.mu.RUnlock()
	for s := range b.subs {
		select {
		case s.ch <- data:
		default:
		}
	}
}

func (b *Broker) emitAuthState(sessionID string, a AuthSnapshot) {
	b.broadcastSessionScoped(sessionID, map[string]any{
		"type": "auth-state", "sessionId": sessionID,
		"paired": a.Paired, "state": a.State, "qr": a.QR,
	})
}

func (b *Broker) emitSessionList(sessions []SessionInfo) {
	b.mu.RLock()
	defer b.mu.RUnlock()
	for s := range b.subs {
		var userSessions []SessionInfo
		if s.role == string(RoleAdmin) {
			userSessions = sessions
		} else {
			userSessions = make([]SessionInfo, 0)
			for _, sess := range sessions {
				if sess.UserID == s.userID {
					userSessions = append(userSessions, sess)
				}
			}
		}
		data, err := json.Marshal(map[string]any{"type": "session-list", "sessions": userSessions})
		if err == nil {
			select {
			case s.ch <- data:
			default:
			}
		}
	}
}

func (b *Broker) emitSessionQR(sessionID, qr string) {
	b.broadcastSessionScoped(sessionID, map[string]any{"type": "session-qr", "sessionId": sessionID, "qr": qr})
}

func (b *Broker) upsertCall(r CallRecord) {
	b.mu.Lock()
	if r.UserID == "" {
		r.UserID = b.sessionOwner(r.SessionID)
	}
	cp := r
	b.calls[r.CallID] = &cp
	cs := b.callStore
	b.mu.Unlock()

	if cs != nil {
		go func() {
			_ = cs.SaveOrUpdate(context.Background(), cp)
		}()
	}

	b.broadcastCallList()
	b.broadcastSessionScoped(r.SessionID, map[string]any{
		"type": "call-status", "sessionId": r.SessionID, "id": r.CallID, "owner": r.Owner,
		"status": r.Status, "peer": r.Peer, "startedAt": r.StartedAt, "connectedAt": r.ConnectedAt,
	})
}

func (b *Broker) getCall(id string) (*CallRecord, bool) {
	b.mu.RLock()
	defer b.mu.RUnlock()
	c, ok := b.calls[id]
	if !ok {
		return nil, false
	}
	cp := *c
	return &cp, true
}

func (b *Broker) setOwner(id, owner string) bool {
	b.mu.Lock()
	c, ok := b.calls[id]
	if !ok {
		b.mu.Unlock()
		return false
	}
	if c.Owner != nil && *c.Owner != owner {
		b.mu.Unlock()
		return false
	}
	c.Owner = &owner
	cp := *c
	cs := b.callStore
	b.mu.Unlock()

	if cs != nil {
		go func() {
			_ = cs.SaveOrUpdate(context.Background(), cp)
		}()
	}

	b.broadcastCallList()
	b.broadcastSessionScoped(c.SessionID, map[string]any{
		"type": "call-status", "sessionId": c.SessionID, "id": c.CallID, "owner": c.Owner,
		"status": c.Status, "peer": c.Peer, "startedAt": c.StartedAt, "connectedAt": c.ConnectedAt,
	})

	return true
}

func (b *Broker) ownerActiveCall(owner string) string {
	if owner == "" {
		return ""
	}
	b.mu.RLock()
	defer b.mu.RUnlock()
	for id, c := range b.calls {
		if c.Owner != nil && *c.Owner == owner && c.Status != StatusEnded {
			return id
		}
	}
	return ""
}

func (b *Broker) endCall(id, reason string) {
	b.mu.Lock()
	c, ok := b.calls[id]
	if !ok {
		b.mu.Unlock()
		return
	}
	now := time.Now().UnixMilli()
	c.Status = StatusEnded
	c.EndedAt = &now
	c.EndReason = reason
	ended := *c
	delete(b.calls, id)
	b.history = append(b.history, ended)
	owner := c.Owner
	sessionID := c.SessionID
	cs := b.callStore
	b.mu.Unlock()

	if cs != nil {
		go func() {
			_ = cs.SaveOrUpdate(context.Background(), ended)
		}()
	}

	b.broadcastSessionScoped(sessionID, map[string]any{
		"type": "call-ended", "sessionId": sessionID, "id": id, "owner": owner, "reason": reason, "endedAt": now,
	})
	b.broadcastCallList()
}

func (b *Broker) activeCalls() []CallRecord {
	b.mu.RLock()
	defer b.mu.RUnlock()
	list := make([]CallRecord, 0, len(b.calls))
	for _, c := range b.calls {
		list = append(list, *c)
	}
	return list
}

func (b *Broker) broadcastCallList() {
	b.mu.RLock()
	callsCopy := make([]CallRecord, 0, len(b.calls))
	for _, c := range b.calls {
		callsCopy = append(callsCopy, *c)
	}
	b.mu.RUnlock()

	b.mu.RLock()
	defer b.mu.RUnlock()
	for s := range b.subs {
		var userCalls []CallRecord
		if s.role == string(RoleAdmin) {
			userCalls = callsCopy
		} else {
			userCalls = make([]CallRecord, 0)
			for _, c := range callsCopy {
				owner := b.sessionOwner(c.SessionID)
				if c.UserID == s.userID || (owner != "" && owner == s.userID) {
					userCalls = append(userCalls, c)
				}
			}
		}
		data, err := json.Marshal(map[string]any{"type": "call-list", "calls": userCalls})
		if err == nil {
			select {
			case s.ch <- data:
			default:
			}
		}
	}
}

func (b *Broker) emitIncoming(sessionID, id, peer, name, pictureUrl string) {
	b.broadcastSessionScoped(sessionID, map[string]any{
		"type": "incoming", "sessionId": sessionID, "id": id, "peer": peer, "name": name, "pictureUrl": pictureUrl, "offeredAt": time.Now().UnixMilli(),
	})
}

func (b *Broker) emitIncomingClaimed(sessionID, id, owner string) {
	b.broadcastSessionScoped(sessionID, map[string]any{"type": "incoming-claimed", "sessionId": sessionID, "id": id, "owner": owner})
}

func (b *Broker) historyRows(sessionID string, limit int) []CallRecord {
	b.mu.RLock()
	cs := b.callStore
	b.mu.RUnlock()

	if cs != nil {
		recs, _, err := cs.ListHistory(context.Background(), CallFilter{
			SessionID: sessionID,
			Limit:     limit,
		})
		if err == nil {
			return recs
		}
	}

	b.mu.RLock()
	defer b.mu.RUnlock()
	rows := make([]CallRecord, 0, limit)
	for i := len(b.history) - 1; i >= 0 && len(rows) < limit; i-- {
		if sessionID == "" || b.history[i].SessionID == sessionID {
			rows = append(rows, b.history[i])
		}
	}
	return rows
}

func (b *Broker) serveSSE(w http.ResponseWriter, r *http.Request, clientID, userID, role string) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming unsupported", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	sub := b.subscribe(clientID, userID, role)
	defer b.unsubscribe(sub)

	if b.SnapshotFn != nil {
		for _, ev := range b.SnapshotFn(userID, role) {
			writeSSE(w, flusher, ev)
		}
	}

	// Send initial call-list tailored to this subscriber
	b.mu.RLock()
	callsCopy := make([]CallRecord, 0, len(b.calls))
	for _, c := range b.calls {
		callsCopy = append(callsCopy, *c)
	}
	b.mu.RUnlock()

	var userCalls []CallRecord
	if role == string(RoleAdmin) {
		userCalls = callsCopy
	} else {
		userCalls = make([]CallRecord, 0)
		for _, c := range callsCopy {
			owner := b.sessionOwner(c.SessionID)
			if c.UserID == userID || (owner != "" && owner == userID) {
				userCalls = append(userCalls, c)
			}
		}
	}
	writeSSE(w, flusher, map[string]any{"type": "call-list", "calls": userCalls})

	keepalive := time.NewTicker(20 * time.Second)
	defer keepalive.Stop()

	for {
		select {
		case <-r.Context().Done():
			return
		case data := <-sub.ch:
			if _, err := w.Write(append(append([]byte("data: "), data...), '\n', '\n')); err != nil {
				return
			}
			flusher.Flush()
		case <-keepalive.C:
			w.Write([]byte(": ping\n\n"))
			flusher.Flush()
		}
	}
}

func writeSSE(w http.ResponseWriter, f http.Flusher, ev any) {
	data, _ := json.Marshal(ev)
	w.Write(append(append([]byte("data: "), data...), '\n', '\n'))
	f.Flush()
}
