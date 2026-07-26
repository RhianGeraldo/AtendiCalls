package main

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"sync"
)

type CallFilter struct {
	SessionID string `json:"sessionId"`
	Owner     string `json:"owner"`
	Direction string `json:"direction"`
	Status    string `json:"status"`
	Search    string `json:"search"`
	StartDate int64  `json:"startDate"`
	EndDate   int64  `json:"endDate"`
	Page      int    `json:"page"`
	Limit     int    `json:"limit"`
}

type CallAnalyticsSummary struct {
	TotalCalls       int     `json:"totalCalls"`
	CompletedCalls   int     `json:"completedCalls"`
	MissedCalls      int     `json:"missedCalls"`
	RejectedCalls    int     `json:"rejectedCalls"`
	InboundCount     int     `json:"inboundCount"`
	OutboundCount    int     `json:"outboundCount"`
	TotalDurationSec int64   `json:"totalDurationSec"`
	AvgDurationSec   int64   `json:"avgDurationSec"`
	AvgWaitSec       int64   `json:"avgWaitSec"`
	AnswerRate       float64 `json:"answerRate"`
}

type AgentMetric struct {
	Owner          string  `json:"owner"`
	TotalCalls     int     `json:"totalCalls"`
	CompletedCalls int     `json:"completedCalls"`
	TotalDuration  int64   `json:"totalDurationSec"`
	AvgDuration    int64   `json:"avgDurationSec"`
	AnswerRate     float64 `json:"answerRate"`
}

type SessionMetric struct {
	SessionID  string `json:"sessionId"`
	TotalCalls int    `json:"totalCalls"`
	Completed  int    `json:"completedCalls"`
	Missed     int    `json:"missedCalls"`
}

type CallAnalyticsResponse struct {
	Summary   CallAnalyticsSummary `json:"summary"`
	ByAgent   []AgentMetric        `json:"byAgent"`
	BySession []SessionMetric      `json:"bySession"`
}

type callStore struct {
	db *sql.DB
	mu sync.RWMutex
}

func newCallStore(ctx context.Context, db *sql.DB) (*callStore, error) {
	query := `CREATE TABLE IF NOT EXISTS call_records (
		id TEXT PRIMARY KEY,
		session_id TEXT NOT NULL,
		direction TEXT NOT NULL,
		peer TEXT NOT NULL,
		peer_name TEXT DEFAULT '',
		picture_url TEXT DEFAULT '',
		owner TEXT DEFAULT '',
		status TEXT NOT NULL,
		started_at INTEGER NOT NULL,
		connected_at INTEGER,
		ended_at INTEGER,
		duration_seconds INTEGER DEFAULT 0,
		end_reason TEXT DEFAULT ''
	);
	CREATE INDEX IF NOT EXISTS idx_call_records_session ON call_records(session_id);
	CREATE INDEX IF NOT EXISTS idx_call_records_owner ON call_records(owner);
	CREATE INDEX IF NOT EXISTS idx_call_records_started ON call_records(started_at);
	`
	_, err := db.ExecContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to create call_records table: %w", err)
	}

	return &callStore{db: db}, nil
}

func (cs *callStore) SaveOrUpdate(ctx context.Context, rec CallRecord) error {
	cs.mu.Lock()
	defer cs.mu.Unlock()

	ownerStr := ""
	if rec.Owner != nil {
		ownerStr = *rec.Owner
	}

	var connectedAt *int64 = rec.ConnectedAt
	var endedAt *int64 = rec.EndedAt
	var durationSec int64 = 0

	if connectedAt != nil && endedAt != nil && *endedAt >= *connectedAt {
		durationSec = (*endedAt - *connectedAt) / 1000
	}

	query := `
	INSERT INTO call_records (
		id, session_id, direction, peer, peer_name, picture_url, owner, status, started_at, connected_at, ended_at, duration_seconds, end_reason
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	ON CONFLICT(id) DO UPDATE SET
		session_id = excluded.session_id,
		direction = excluded.direction,
		peer = excluded.peer,
		peer_name = CASE WHEN excluded.peer_name != '' THEN excluded.peer_name ELSE call_records.peer_name END,
		picture_url = CASE WHEN excluded.picture_url != '' THEN excluded.picture_url ELSE call_records.picture_url END,
		owner = CASE WHEN excluded.owner != '' THEN excluded.owner ELSE call_records.owner END,
		status = excluded.status,
		started_at = excluded.started_at,
		connected_at = COALESCE(excluded.connected_at, call_records.connected_at),
		ended_at = COALESCE(excluded.ended_at, call_records.ended_at),
		duration_seconds = excluded.duration_seconds,
		end_reason = CASE WHEN excluded.end_reason != '' THEN excluded.end_reason ELSE call_records.end_reason END
	`

	_, err := cs.db.ExecContext(ctx, query,
		rec.CallID, rec.SessionID, rec.Direction, rec.Peer, rec.Name, rec.PictureURL,
		ownerStr, string(rec.Status), rec.StartedAt, connectedAt, endedAt, durationSec, rec.EndReason,
	)
	return err
}

func (cs *callStore) ListHistory(ctx context.Context, filter CallFilter) ([]CallRecord, int, error) {
	cs.mu.RLock()
	defer cs.mu.RUnlock()

	whereClause := []string{"1=1"}
	args := []any{}

	if filter.SessionID != "" {
		whereClause = append(whereClause, "session_id = ?")
		args = append(args, filter.SessionID)
	}
	if filter.Owner != "" {
		whereClause = append(whereClause, "owner = ?")
		args = append(args, filter.Owner)
	}
	if filter.Direction != "" {
		whereClause = append(whereClause, "direction = ?")
		args = append(args, filter.Direction)
	}
	if filter.Status != "" {
		whereClause = append(whereClause, "status = ?")
		args = append(args, filter.Status)
	}
	if filter.StartDate > 0 {
		whereClause = append(whereClause, "started_at >= ?")
		args = append(args, filter.StartDate)
	}
	if filter.EndDate > 0 {
		whereClause = append(whereClause, "started_at <= ?")
		args = append(args, filter.EndDate)
	}
	if filter.Search != "" {
		whereClause = append(whereClause, "(peer LIKE ? OR peer_name LIKE ?)")
		searchTerm := "%" + filter.Search + "%"
		args = append(args, searchTerm, searchTerm)
	}

	whereStmt := strings.Join(whereClause, " AND ")

	var total int
	countQuery := "SELECT COUNT(*) FROM call_records WHERE " + whereStmt
	err := cs.db.QueryRowContext(ctx, countQuery, args...).Scan(&total)
	if err != nil {
		return nil, 0, err
	}

	page := filter.Page
	if page < 1 {
		page = 1
	}
	limit := filter.Limit
	if limit < 1 || limit > 100 {
		limit = 20
	}
	offset := (page - 1) * limit

	query := fmt.Sprintf(`
		SELECT id, session_id, direction, peer, peer_name, picture_url, owner, status, started_at, connected_at, ended_at, duration_seconds, end_reason
		FROM call_records
		WHERE %s
		ORDER BY started_at DESC
		LIMIT ? OFFSET ?
	`, whereStmt)

	queryArgs := append(args, limit, offset)
	rows, err := cs.db.QueryContext(ctx, query, queryArgs...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	records := make([]CallRecord, 0)
	for rows.Next() {
		var r CallRecord
		var ownerStr string
		var statusStr string
		var connAt, endAt sql.NullInt64

		err := rows.Scan(
			&r.CallID, &r.SessionID, &r.Direction, &r.Peer, &r.Name, &r.PictureURL,
			&ownerStr, &statusStr, &r.StartedAt, &connAt, &endAt, new(int64), &r.EndReason,
		)
		if err != nil {
			return nil, 0, err
		}

		if ownerStr != "" {
			r.Owner = &ownerStr
		}
		r.Status = CallStatus(statusStr)
		if connAt.Valid {
			v := connAt.Int64
			r.ConnectedAt = &v
		}
		if endAt.Valid {
			v := endAt.Int64
			r.EndedAt = &v
		}
		records = append(records, r)
	}

	return records, total, nil
}

func (cs *callStore) GetAnalytics(ctx context.Context, filter CallFilter) (*CallAnalyticsResponse, error) {
	cs.mu.RLock()
	defer cs.mu.RUnlock()

	whereClause := []string{"1=1"}
	args := []any{}

	if filter.SessionID != "" {
		whereClause = append(whereClause, "session_id = ?")
		args = append(args, filter.SessionID)
	}
	if filter.Owner != "" {
		whereClause = append(whereClause, "owner = ?")
		args = append(args, filter.Owner)
	}
	if filter.StartDate > 0 {
		whereClause = append(whereClause, "started_at >= ?")
		args = append(args, filter.StartDate)
	}
	if filter.EndDate > 0 {
		whereClause = append(whereClause, "started_at <= ?")
		args = append(args, filter.EndDate)
	}

	whereStmt := strings.Join(whereClause, " AND ")

	summaryQuery := fmt.Sprintf(`
		SELECT 
			COUNT(*),
			COALESCE(SUM(CASE WHEN status = 'connected' OR (status = 'ended' AND connected_at IS NOT NULL) THEN 1 ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN status = 'ended' AND connected_at IS NULL AND direction = 'inbound' THEN 1 ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN status = 'rejected' OR end_reason LIKE '%%declined%%' THEN 1 ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN direction = 'inbound' THEN 1 ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN direction = 'outbound' THEN 1 ELSE 0 END), 0),
			COALESCE(SUM(duration_seconds), 0),
			COALESCE(AVG(CASE WHEN connected_at IS NOT NULL THEN duration_seconds END), 0),
			COALESCE(AVG(CASE WHEN connected_at IS NOT NULL THEN (connected_at - started_at) / 1000 END), 0)
		FROM call_records
		WHERE %s
	`, whereStmt)

	var res CallAnalyticsResponse
	var totalCalls, completed, missed, rejected, inbound, outbound int
	var totalDur, avgDur, avgWait float64

	err := cs.db.QueryRowContext(ctx, summaryQuery, args...).Scan(
		&totalCalls, &completed, &missed, &rejected, &inbound, &outbound, &totalDur, &avgDur, &avgWait,
	)
	if err != nil && err != sql.ErrNoRows {
		return nil, err
	}

	res.Summary.TotalCalls = totalCalls
	res.Summary.CompletedCalls = completed
	res.Summary.MissedCalls = missed
	res.Summary.RejectedCalls = rejected
	res.Summary.InboundCount = inbound
	res.Summary.OutboundCount = outbound
	res.Summary.TotalDurationSec = int64(totalDur)
	res.Summary.AvgDurationSec = int64(avgDur)
	res.Summary.AvgWaitSec = int64(avgWait)
	if totalCalls > 0 {
		res.Summary.AnswerRate = float64(completed) / float64(totalCalls) * 100.0
	}

	// By Agent
	agentQuery := fmt.Sprintf(`
		SELECT 
			COALESCE(NULLIF(owner, ''), 'Sem Agente') as agent,
			COUNT(*),
			COALESCE(SUM(CASE WHEN connected_at IS NOT NULL THEN 1 ELSE 0 END), 0),
			COALESCE(SUM(duration_seconds), 0),
			COALESCE(AVG(CASE WHEN connected_at IS NOT NULL THEN duration_seconds END), 0)
		FROM call_records
		WHERE %s
		GROUP BY agent
		ORDER BY COUNT(*) DESC
	`, whereStmt)

	agentRows, err := cs.db.QueryContext(ctx, agentQuery, args...)
	if err == nil {
		defer agentRows.Close()
		for agentRows.Next() {
			var am AgentMetric
			var tot, comp int
			var totD, avgD float64
			if err := agentRows.Scan(&am.Owner, &tot, &comp, &totD, &avgD); err == nil {
				am.TotalCalls = tot
				am.CompletedCalls = comp
				am.TotalDuration = int64(totD)
				am.AvgDuration = int64(avgD)
				if tot > 0 {
					am.AnswerRate = float64(comp) / float64(tot) * 100.0
				}
				res.ByAgent = append(res.ByAgent, am)
			}
		}
	}

	// By Session
	sessionQuery := fmt.Sprintf(`
		SELECT 
			session_id,
			COUNT(*),
			COALESCE(SUM(CASE WHEN connected_at IS NOT NULL THEN 1 ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN connected_at IS NULL THEN 1 ELSE 0 END), 0)
		FROM call_records
		WHERE %s
		GROUP BY session_id
		ORDER BY COUNT(*) DESC
	`, whereStmt)

	sessionRows, err := cs.db.QueryContext(ctx, sessionQuery, args...)
	if err == nil {
		defer sessionRows.Close()
		for sessionRows.Next() {
			var sm SessionMetric
			if err := sessionRows.Scan(&sm.SessionID, &sm.TotalCalls, &sm.Completed, &sm.Missed); err == nil {
				res.BySession = append(res.BySession, sm)
			}
		}
	}

	if res.ByAgent == nil {
		res.ByAgent = []AgentMetric{}
	}
	if res.BySession == nil {
		res.BySession = []SessionMetric{}
	}

	return &res, nil
}
