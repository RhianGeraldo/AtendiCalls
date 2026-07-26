package main

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"sync"
	"time"
)

type Playbook struct {
	ID        string `json:"id"`
	Title     string `json:"title"`
	Content   string `json:"content"`
	Category  string `json:"category"`
	CreatedAt int64  `json:"createdAt"`
	UpdatedAt int64  `json:"updatedAt"`
}

type playbookStore struct {
	db *sql.DB
	mu sync.RWMutex
}

func newPlaybookStore(ctx context.Context, db *sql.DB) (*playbookStore, error) {
	query := `
	CREATE TABLE IF NOT EXISTS playbooks (
		id TEXT PRIMARY KEY,
		title TEXT NOT NULL,
		content TEXT NOT NULL,
		category TEXT DEFAULT '',
		created_at INTEGER NOT NULL,
		updated_at INTEGER NOT NULL
	);
	CREATE INDEX IF NOT EXISTS idx_playbooks_title ON playbooks(title);
	`
	_, err := db.ExecContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to create playbooks table: %w", err)
	}

	return &playbookStore{db: db}, nil
}

func (ps *playbookStore) Create(ctx context.Context, p Playbook) (*Playbook, error) {
	ps.mu.Lock()
	defer ps.mu.Unlock()

	now := time.Now().UnixMilli()
	if p.ID == "" {
		p.ID = fmt.Sprintf("pb_%d", now)
	}
	if p.CreatedAt == 0 {
		p.CreatedAt = now
	}
	p.UpdatedAt = now

	p.Title = strings.TrimSpace(p.Title)

	query := `INSERT INTO playbooks (id, title, content, category, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`
	_, err := ps.db.ExecContext(ctx, query, p.ID, p.Title, p.Content, p.Category, p.CreatedAt, p.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("failed to save playbook: %w", err)
	}

	return &p, nil
}

func (ps *playbookStore) Update(ctx context.Context, p Playbook) (*Playbook, error) {
	ps.mu.Lock()
	defer ps.mu.Unlock()

	now := time.Now().UnixMilli()
	p.UpdatedAt = now

	query := `UPDATE playbooks SET title = ?, content = ?, category = ?, updated_at = ? WHERE id = ?`
	res, err := ps.db.ExecContext(ctx, query, p.Title, p.Content, p.Category, p.UpdatedAt, p.ID)
	if err != nil {
		return nil, fmt.Errorf("failed to update playbook: %w", err)
	}

	rows, _ := res.RowsAffected()
	if rows == 0 {
		return nil, fmt.Errorf("playbook not found")
	}

	return &p, nil
}

func (ps *playbookStore) Delete(ctx context.Context, id string) error {
	ps.mu.Lock()
	defer ps.mu.Unlock()

	_, err := ps.db.ExecContext(ctx, "DELETE FROM playbooks WHERE id = ?", id)
	return err
}

func (ps *playbookStore) List(ctx context.Context) ([]Playbook, error) {
	ps.mu.RLock()
	defer ps.mu.RUnlock()

	query := `SELECT id, title, content, category, created_at, updated_at FROM playbooks ORDER BY title ASC`
	rows, err := ps.db.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	list := make([]Playbook, 0)
	for rows.Next() {
		var p Playbook
		if err := rows.Scan(&p.ID, &p.Title, &p.Content, &p.Category, &p.CreatedAt, &p.UpdatedAt); err == nil {
			list = append(list, p)
		}
	}

	return list, nil
}
