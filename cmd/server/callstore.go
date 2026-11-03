package main

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"

	"gorm.io/gorm"
)

type CallFilter struct {
	SessionID string `json:"sessionId"`
	UserID    string `json:"userId,omitempty"`
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
	SessionID         string  `json:"sessionId"`
	SessionName       string  `json:"sessionName"`
	SessionPhone      string  `json:"sessionPhone"`
	SessionPictureURL string  `json:"sessionPictureUrl"`
	TotalCalls        int     `json:"totalCalls"`
	Completed         int     `json:"completedCalls"`
	Missed            int     `json:"missedCalls"`
	AvgDuration       int64   `json:"avgDurationSec"`
	AnswerRate        float64 `json:"answerRate"`
}

type DailyMetric struct {
	Date           string `json:"date"`
	TotalCalls     int    `json:"totalCalls"`
	CompletedCalls int    `json:"completedCalls"`
	InboundCount   int    `json:"inboundCount"`
	OutboundCount  int    `json:"outboundCount"`
	AvgDuration    int64  `json:"avgDurationSec"`
}

type CallAnalyticsResponse struct {
	Summary   CallAnalyticsSummary `json:"summary"`
	ByAgent   []AgentMetric        `json:"byAgent"`
	BySession []SessionMetric      `json:"bySession"`
	ByDaily   []DailyMetric        `json:"byDaily"`
}

type callStore struct {
	db      *gorm.DB
	dialect string
	mu      sync.RWMutex
}

func newCallStore(ctx context.Context, db *gorm.DB, dialect string) (*callStore, error) {
	if err := db.WithContext(ctx).AutoMigrate(&CallRecord{}); err != nil {
		return nil, fmt.Errorf("auto migrate call_records: %w", err)
	}
	return &callStore{
		db:      db,
		dialect: dialect,
	}, nil
}

func (cs *callStore) SaveCall(ctx context.Context, rec CallRecord) error {
	cs.mu.Lock()
	defer cs.mu.Unlock()

	var existing CallRecord
	err := cs.db.WithContext(ctx).Where("id = ?", rec.CallID).First(&existing).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		if rec.UserID == "" && rec.SessionID != "" {
			var sess sessionRow
			if err := cs.db.WithContext(ctx).Where("id = ?", rec.SessionID).First(&sess).Error; err == nil {
				rec.UserID = sess.UserID
			}
		}
		if rec.ConnectedAt != nil && rec.EndedAt != nil && *rec.EndedAt > *rec.ConnectedAt {
			rec.DurationSec = int((*rec.EndedAt - *rec.ConnectedAt) / 1000)
		}
		return cs.db.WithContext(ctx).Create(&rec).Error
	} else if err != nil {
		return err
	}

	updates := map[string]any{
		"session_id": rec.SessionID,
		"direction":  rec.Direction,
		"peer":       rec.Peer,
		"status":     rec.Status,
		"started_at": rec.StartedAt,
	}
	if rec.UserID != "" {
		updates["user_id"] = rec.UserID
	}
	if rec.SessionName != "" {
		updates["session_name"] = rec.SessionName
	}
	if rec.SessionPhone != "" {
		updates["session_phone"] = rec.SessionPhone
	}
	if rec.SessionPictureURL != "" {
		updates["session_picture_url"] = rec.SessionPictureURL
	}
	if rec.Name != "" {
		updates["peer_name"] = rec.Name
	}
	if rec.PictureURL != "" {
		updates["picture_url"] = rec.PictureURL
	}
	if rec.Owner != nil && *rec.Owner != "" {
		updates["owner"] = *rec.Owner
	}
	if rec.ConnectedAt != nil {
		updates["connected_at"] = *rec.ConnectedAt
	}
	if rec.EndedAt != nil {
		updates["ended_at"] = *rec.EndedAt
	}
	if rec.EndReason != "" {
		updates["end_reason"] = rec.EndReason
	}
	if rec.ConnectedAt != nil && rec.EndedAt != nil && *rec.EndedAt > *rec.ConnectedAt {
		updates["duration_seconds"] = int((*rec.EndedAt - *rec.ConnectedAt) / 1000)
	}

	return cs.db.WithContext(ctx).Model(&CallRecord{}).Where("id = ?", rec.CallID).Updates(updates).Error
}

func (cs *callStore) SaveOrUpdate(ctx context.Context, rec CallRecord) error {
	return cs.SaveCall(ctx, rec)
}

func (cs *callStore) ListHistory(ctx context.Context, filter CallFilter) ([]CallRecord, int, error) {
	cs.mu.RLock()
	defer cs.mu.RUnlock()

	q := cs.db.WithContext(ctx).Model(&CallRecord{})

	if filter.SessionID != "" {
		q = q.Where("session_id = ?", filter.SessionID)
	}
	if filter.UserID != "" {
		subQuery := cs.db.Model(&sessionRow{}).Select("id").Where("user_id = ?", filter.UserID)
		q = q.Where("user_id = ? OR session_id IN (?)", filter.UserID, subQuery)
	}
	if filter.Owner != "" {
		q = q.Where("owner = ?", filter.Owner)
	}
	if filter.Direction != "" {
		q = q.Where("direction = ?", filter.Direction)
	}
	if filter.Status != "" {
		q = q.Where("status = ?", filter.Status)
	}
	if filter.StartDate > 0 {
		q = q.Where("started_at >= ?", filter.StartDate)
	}
	if filter.EndDate > 0 {
		q = q.Where("started_at <= ?", filter.EndDate)
	}
	if filter.Search != "" {
		term := "%" + strings.ToLower(filter.Search) + "%"
		q = q.Where("LOWER(peer) LIKE ? OR LOWER(peer_name) LIKE ? OR LOWER(session_name) LIKE ? OR session_phone LIKE ?", term, term, term, term)
	}

	var total int64
	if err := q.Count(&total).Error; err != nil {
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

	var records []CallRecord
	if err := q.Order("started_at desc").Limit(limit).Offset(offset).Find(&records).Error; err != nil {
		return nil, 0, err
	}

	return records, int(total), nil
}

func (cs *callStore) SaveRecordingPath(ctx context.Context, callID, path string) error {
	cs.mu.Lock()
	defer cs.mu.Unlock()
	return cs.db.WithContext(ctx).Model(&CallRecord{}).Where("id = ?", callID).Updates(map[string]any{
		"recording_path":       path,
		"transcription_status": "pending",
	}).Error
}

func (cs *callStore) SaveTranscript(ctx context.Context, callID, transcriptJSON, summary, status string) error {
	cs.mu.Lock()
	defer cs.mu.Unlock()
	return cs.db.WithContext(ctx).Model(&CallRecord{}).Where("id = ?", callID).Updates(map[string]any{
		"transcript_json":      transcriptJSON,
		"transcript_summary":   summary,
		"transcription_status": status,
	}).Error
}

func (cs *callStore) GetCallRecord(ctx context.Context, callID string) (*CallRecord, error) {
	cs.mu.RLock()
	defer cs.mu.RUnlock()
	var r CallRecord
	if err := cs.db.WithContext(ctx).Where("id = ?", callID).First(&r).Error; err != nil {
		return nil, err
	}
	return &r, nil
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
	if filter.UserID != "" {
		whereClause = append(whereClause, "(user_id = ? OR session_id IN (SELECT id FROM sessions WHERE user_id = ?))")
		args = append(args, filter.UserID, filter.UserID)
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

	if err := cs.db.WithContext(ctx).Raw(summaryQuery, args...).Row().Scan(
		&totalCalls, &completed, &missed, &rejected, &inbound, &outbound, &totalDur, &avgDur, &avgWait,
	); err != nil {
		return nil, fmt.Errorf("analytics summary: %w", err)
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
			COALESCE(owner, 'Desconhecido') as agent_name,
			COUNT(*),
			COALESCE(SUM(CASE WHEN connected_at IS NOT NULL THEN 1 ELSE 0 END), 0),
			COALESCE(SUM(duration_seconds), 0),
			COALESCE(AVG(CASE WHEN connected_at IS NOT NULL THEN duration_seconds END), 0)
		FROM call_records
		WHERE %s AND owner IS NOT NULL AND owner != ''
		GROUP BY owner
		ORDER BY COUNT(*) DESC
	`, whereStmt)

	agentRows, err := cs.db.WithContext(ctx).Raw(agentQuery, args...).Rows()
	if err != nil {
		return nil, fmt.Errorf("analytics query: %w", err)
	}
	defer agentRows.Close()
	for agentRows.Next() {
		var am AgentMetric
		var avgD float64
		if err := agentRows.Scan(&am.Owner, &am.TotalCalls, &am.CompletedCalls, &am.TotalDuration, &avgD); err == nil {
			am.AvgDuration = int64(avgD)
			if am.TotalCalls > 0 {
				am.AnswerRate = float64(am.CompletedCalls) / float64(am.TotalCalls) * 100.0
			}
			res.ByAgent = append(res.ByAgent, am)
		}
	}

	// By Session
	sessionQuery := fmt.Sprintf(`
		SELECT 
			session_id,
			COALESCE(session_name, ''),
			COALESCE(session_phone, ''),
			COALESCE(session_picture_url, ''),
			COUNT(*),
			COALESCE(SUM(CASE WHEN connected_at IS NOT NULL THEN 1 ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN status = 'ended' AND connected_at IS NULL AND direction = 'inbound' THEN 1 ELSE 0 END), 0),
			COALESCE(AVG(CASE WHEN connected_at IS NOT NULL THEN duration_seconds END), 0)
		FROM call_records
		WHERE %s
		GROUP BY session_id, session_name, session_phone, session_picture_url
		ORDER BY COUNT(*) DESC
	`, whereStmt)

	sessRows, err := cs.db.WithContext(ctx).Raw(sessionQuery, args...).Rows()
	if err != nil {
		return nil, fmt.Errorf("analytics query: %w", err)
	}
	defer sessRows.Close()
	for sessRows.Next() {
		var sm SessionMetric
		var avgD float64
		if err := sessRows.Scan(&sm.SessionID, &sm.SessionName, &sm.SessionPhone, &sm.SessionPictureURL, &sm.TotalCalls, &sm.Completed, &sm.Missed, &avgD); err == nil {
			sm.AvgDuration = int64(avgD)
			if sm.TotalCalls > 0 {
				sm.AnswerRate = float64(sm.Completed) / float64(sm.TotalCalls) * 100.0
			}
			res.BySession = append(res.BySession, sm)
		}
	}

	// By Daily - dialect compatible
	dateExpr := "strftime('%Y-%m-%d', datetime(started_at / 1000, 'unixepoch', 'localtime'))"
	if cs.dialect == "postgres" {
		dateExpr = "to_char(to_timestamp(started_at / 1000), 'YYYY-MM-DD')"
	} else if cs.dialect == "mysql" {
		dateExpr = "FROM_UNIXTIME(started_at / 1000, '%Y-%m-%d')"
	}

	dailyQuery := fmt.Sprintf(`
		SELECT 
			%s as call_date,
			COUNT(*),
			COALESCE(SUM(CASE WHEN connected_at IS NOT NULL THEN 1 ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN direction = 'inbound' THEN 1 ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN direction = 'outbound' THEN 1 ELSE 0 END), 0),
			COALESCE(AVG(CASE WHEN connected_at IS NOT NULL THEN duration_seconds END), 0)
		FROM call_records
		WHERE %s
		GROUP BY %s
		ORDER BY call_date DESC
		LIMIT 30
	`, dateExpr, whereStmt, dateExpr)

	dRows, err := cs.db.WithContext(ctx).Raw(dailyQuery, args...).Rows()
	if err != nil {
		return nil, fmt.Errorf("analytics query: %w", err)
	}
	defer dRows.Close()
	for dRows.Next() {
		var dm DailyMetric
		var avgD float64
		if err := dRows.Scan(&dm.Date, &dm.TotalCalls, &dm.CompletedCalls, &dm.InboundCount, &dm.OutboundCount, &avgD); err == nil {
			dm.AvgDuration = int64(avgD)
			res.ByDaily = append(res.ByDaily, dm)
		}
	}

	if res.ByAgent == nil {
		res.ByAgent = []AgentMetric{}
	}
	if res.BySession == nil {
		res.BySession = []SessionMetric{}
	}
	if res.ByDaily == nil {
		res.ByDaily = []DailyMetric{}
	}

	return &res, nil
}
