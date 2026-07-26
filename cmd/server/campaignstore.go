package main

import (
	"context"
	"database/sql"
	"fmt"
	"sync"
	"time"
)

type CampaignStatus string

const (
	CampaignStatusPending   CampaignStatus = "pending"
	CampaignStatusRunning   CampaignStatus = "running"
	CampaignStatusPaused    CampaignStatus = "paused"
	CampaignStatusCompleted CampaignStatus = "completed"
)

type CampaignItemStatus string

const (
	CampaignItemPending  CampaignItemStatus = "pending"
	CampaignItemCalling  CampaignItemStatus = "calling"
	CampaignItemAnswered CampaignItemStatus = "answered"
	CampaignItemRejected CampaignItemStatus = "rejected"
	CampaignItemNoAnswer CampaignItemStatus = "no_answer"
	CampaignItemFailed   CampaignItemStatus = "failed"
)

type CampaignItem struct {
	ID         string             `json:"id"`
	CampaignID string             `json:"campaignId"`
	ContactID  string             `json:"contactId"`
	Name       string             `json:"name"`
	Phone      string             `json:"phone"`
	PictureURL string             `json:"pictureUrl"`
	Status     CampaignItemStatus `json:"status"`
	StartedAt  *int64             `json:"startedAt,omitempty"`
	EndedAt    *int64             `json:"endedAt,omitempty"`
	EndReason  string             `json:"endReason,omitempty"`
	Notes      string             `json:"notes,omitempty"`
}

type Campaign struct {
	ID           string         `json:"id"`
	Name         string         `json:"name"`
	SessionID    string         `json:"sessionId"`
	SessionName  string         `json:"sessionName,omitempty"`
	SessionPhone string         `json:"sessionPhone,omitempty"`
	Playbook     string         `json:"playbook"`
	DelaySeconds int            `json:"delaySeconds"`
	Status       CampaignStatus `json:"status"`
	TotalItems   int            `json:"totalItems"`
	DoneItems    int            `json:"doneItems"`
	Items        []CampaignItem `json:"items,omitempty"`
	CreatedAt    int64          `json:"createdAt"`
	UpdatedAt    int64          `json:"updatedAt"`
}

type campaignStore struct {
	db *sql.DB
	mu sync.RWMutex
}

func newCampaignStore(ctx context.Context, db *sql.DB) (*campaignStore, error) {
	query := `
	CREATE TABLE IF NOT EXISTS campaigns (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		session_id TEXT NOT NULL,
		playbook TEXT DEFAULT '',
		delay_seconds INTEGER DEFAULT 5,
		status TEXT NOT NULL DEFAULT 'pending',
		created_at INTEGER NOT NULL,
		updated_at INTEGER NOT NULL
	);

	CREATE TABLE IF NOT EXISTS campaign_items (
		id TEXT PRIMARY KEY,
		campaign_id TEXT NOT NULL,
		contact_id TEXT DEFAULT '',
		name TEXT NOT NULL,
		phone TEXT NOT NULL,
		picture_url TEXT DEFAULT '',
		status TEXT NOT NULL DEFAULT 'pending',
		started_at INTEGER,
		ended_at INTEGER,
		end_reason TEXT DEFAULT '',
		notes TEXT DEFAULT '',
		FOREIGN KEY(campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
	);

	CREATE INDEX IF NOT EXISTS idx_campaign_items_camp ON campaign_items(campaign_id);
	`
	_, err := db.ExecContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to create campaigns tables: %w", err)
	}

	return &campaignStore{db: db}, nil
}

func (cs *campaignStore) Create(ctx context.Context, c Campaign, items []CampaignItem) (*Campaign, error) {
	cs.mu.Lock()
	defer cs.mu.Unlock()

	now := time.Now().UnixMilli()
	if c.ID == "" {
		c.ID = fmt.Sprintf("cmp_%d", now)
	}
	if c.DelaySeconds <= 0 {
		c.DelaySeconds = 5
	}
	c.Status = CampaignStatusPending
	c.CreatedAt = now
	c.UpdatedAt = now

	tx, err := cs.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	queryCmp := `INSERT INTO campaigns (id, name, session_id, playbook, delay_seconds, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
	_, err = tx.ExecContext(ctx, queryCmp, c.ID, c.Name, c.SessionID, c.Playbook, c.DelaySeconds, c.Status, c.CreatedAt, c.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("failed to create campaign: %w", err)
	}

	queryItem := `INSERT INTO campaign_items (id, campaign_id, contact_id, name, phone, picture_url, status) VALUES (?, ?, ?, ?, ?, ?, 'pending')`
	for idx, item := range items {
		itemID := fmt.Sprintf("%s_item_%d", c.ID, idx+1)
		_, err := tx.ExecContext(ctx, queryItem, itemID, c.ID, item.ContactID, item.Name, item.Phone, item.PictureURL)
		if err != nil {
			return nil, fmt.Errorf("failed to insert campaign item: %w", err)
		}
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}

	return cs.getByIDUnlocked(ctx, c.ID)
}

func (cs *campaignStore) getByIDUnlocked(ctx context.Context, id string) (*Campaign, error) {
	var c Campaign
	queryCmp := `SELECT id, name, session_id, playbook, delay_seconds, status, created_at, updated_at FROM campaigns WHERE id = ?`
	err := cs.db.QueryRowContext(ctx, queryCmp, id).Scan(
		&c.ID, &c.Name, &c.SessionID, &c.Playbook, &c.DelaySeconds, &c.Status, &c.CreatedAt, &c.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}

	rows, err := cs.db.QueryContext(ctx, `SELECT id, campaign_id, contact_id, name, phone, picture_url, status, started_at, ended_at, end_reason, notes FROM campaign_items WHERE campaign_id = ? ORDER BY id ASC`, id)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var item CampaignItem
			var stAt, endAt sql.NullInt64
			if err := rows.Scan(&item.ID, &item.CampaignID, &item.ContactID, &item.Name, &item.Phone, &item.PictureURL, &item.Status, &stAt, &endAt, &item.EndReason, &item.Notes); err == nil {
				if stAt.Valid {
					v := stAt.Int64
					item.StartedAt = &v
				}
				if endAt.Valid {
					v := endAt.Int64
					item.EndedAt = &v
				}
				c.Items = append(c.Items, item)
			}
		}
	}

	c.TotalItems = len(c.Items)
	doneCount := 0
	for _, item := range c.Items {
		if item.Status != CampaignItemPending && item.Status != CampaignItemCalling {
			doneCount++
		}
	}
	c.DoneItems = doneCount

	return &c, nil
}

func (cs *campaignStore) GetByID(ctx context.Context, id string) (*Campaign, error) {
	cs.mu.RLock()
	defer cs.mu.RUnlock()
	return cs.getByIDUnlocked(ctx, id)
}

func (cs *campaignStore) List(ctx context.Context) ([]Campaign, error) {
	cs.mu.RLock()
	defer cs.mu.RUnlock()

	query := `
	SELECT 
		c.id, c.name, c.session_id, c.playbook, c.delay_seconds, c.status, c.created_at, c.updated_at,
		COUNT(i.id) AS total_items,
		COALESCE(SUM(CASE WHEN i.status IS NOT NULL AND i.status != 'pending' AND i.status != 'calling' THEN 1 ELSE 0 END), 0) AS done_items
	FROM campaigns c
	LEFT JOIN campaign_items i ON i.campaign_id = c.id
	GROUP BY c.id
	ORDER BY c.created_at DESC
	`
	rows, err := cs.db.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	list := make([]Campaign, 0)
	for rows.Next() {
		var c Campaign
		if err := rows.Scan(&c.ID, &c.Name, &c.SessionID, &c.Playbook, &c.DelaySeconds, &c.Status, &c.CreatedAt, &c.UpdatedAt, &c.TotalItems, &c.DoneItems); err == nil {
			list = append(list, c)
		}
	}

	return list, nil
}

func (cs *campaignStore) UpdateStatus(ctx context.Context, id string, status CampaignStatus) error {
	cs.mu.Lock()
	defer cs.mu.Unlock()

	now := time.Now().UnixMilli()
	_, err := cs.db.ExecContext(ctx, `UPDATE campaigns SET status = ?, updated_at = ? WHERE id = ?`, status, now, id)
	return err
}

func (cs *campaignStore) UpdateItem(ctx context.Context, itemID string, status CampaignItemStatus, endReason, notes string) error {
	cs.mu.Lock()
	defer cs.mu.Unlock()

	now := time.Now().UnixMilli()
	query := `UPDATE campaign_items SET status = ?, ended_at = ?, end_reason = ?, notes = ? WHERE id = ?`
	_, err := cs.db.ExecContext(ctx, query, status, now, endReason, notes, itemID)
	return err
}

func (cs *campaignStore) Delete(ctx context.Context, id string) error {
	cs.mu.Lock()
	defer cs.mu.Unlock()

	_, err := cs.db.ExecContext(ctx, `DELETE FROM campaigns WHERE id = ?`, id)
	return err
}
