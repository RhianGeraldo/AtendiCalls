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
	SessionID         string     `json:"sessionId"`
	SessionName       string     `json:"sessionName,omitempty"`
	SessionPhone      string     `json:"sessionPhone,omitempty"`
	SessionPictureURL string     `json:"sessionPictureUrl,omitempty"`
	CallID            string     `json:"callId"`
	Owner             *string    `json:"owner"`
	Direction         string     `json:"direction"`
	Peer              string     `json:"peer"`
	Name              string     `json:"name,omitempty"`
	PictureURL        string     `json:"pictureUrl,omitempty"`
	StartedAt         int64      `json:"startedAt"`
	ConnectedAt       *int64     `json:"connectedAt,omitempty"`
	Status            CallStatus `json:"status"`
	EndedAt           *int64     `json:"endedAt,omitempty"`
	EndReason         string     `json:"endReason,omitempty"`

	RecordingPath       string `json:"recordingPath,omitempty"`
	TranscriptJSON      string `json:"transcriptJson,omitempty"`
	TranscriptSummary   string `json:"transcriptSummary,omitempty"`
	TranscriptionStatus string `json:"transcriptionStatus,omitempty"`
}

type AuthSnapshot struct {
	State  string `json:"state"`
	Paired bool   `json:"paired"`
	QR     string `json:"qr,omitempty"`
}

type SessionInfo struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	JID        string `json:"jid"`
	Phone      string `json:"phone,omitempty"`
	PushName   string `json:"pushName,omitempty"`
	PictureURL string `json:"pictureUrl,omitempty"`
	StatusText string `json:"statusText,omitempty"`
	State      string `json:"state"`
	Paired     bool   `json:"paired"`
}

type subscriber struct {
	clientID string
	ch       chan []byte
}

type Broker struct {
	mu        sync.RWMutex
	subs      map[*subscriber]struct{}
	calls     map[string]*CallRecord
	history   []CallRecord
	callStore *callStore

	SnapshotFn func() []any
}

func NewBroker() *Broker {
	return &Broker{
		subs:  map[*subscriber]struct{}{},
		calls: map[string]*CallRecord{},
	}
}

func (b *Broker) subscribe(clientID string) *subscriber {
	s := &subscriber{clientID: clientID, ch: make(chan []byte, 32)}
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
	b.broadcast(map[string]any{
		"type": "auth-state", "sessionId": sessionID,
		"paired": a.Paired, "state": a.State, "qr": a.QR,
	})
}

func (b *Broker) emitSessionList(sessions []SessionInfo) {
	b.broadcast(map[string]any{"type": "session-list", "sessions": sessions})
}

func (b *Broker) emitSessionQR(sessionID, qr string) {
	b.broadcast(map[string]any{"type": "session-qr", "sessionId": sessionID, "qr": qr})
}

func (b *Broker) upsertCall(r CallRecord) {
	b.mu.Lock()
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
	b.broadcast(map[string]any{
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
	b.broadcast(map[string]any{
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

	b.broadcast(map[string]any{
		"type": "call-ended", "sessionId": sessionID, "id": id, "owner": owner, "reason": reason, "endedAt": now,
	})
	b.broadcastCallList()
}

func (b *Broker) broadcastCallList() {
	b.mu.RLock()
	list := make([]CallRecord, 0, len(b.calls))
	for _, c := range b.calls {
		list = append(list, *c)
	}
	b.mu.RUnlock()
	b.broadcast(map[string]any{"type": "call-list", "calls": list})
}

func (b *Broker) emitIncoming(sessionID, id, peer, name, pictureUrl string) {
	b.broadcast(map[string]any{
		"type": "incoming", "sessionId": sessionID, "id": id, "peer": peer, "name": name, "pictureUrl": pictureUrl, "offeredAt": time.Now().UnixMilli(),
	})
}

func (b *Broker) emitIncomingClaimed(sessionID, id, owner string) {
	b.broadcast(map[string]any{"type": "incoming-claimed", "sessionId": sessionID, "id": id, "owner": owner})
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

func (b *Broker) serveSSE(w http.ResponseWriter, r *http.Request, clientID string) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming unsupported", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	sub := b.subscribe(clientID)
	defer b.unsubscribe(sub)

	if b.SnapshotFn != nil {
		for _, ev := range b.SnapshotFn() {
			writeSSE(w, flusher, ev)
		}
	}
	b.broadcastCallList()

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
