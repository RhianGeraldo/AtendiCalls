package main

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"sync"
	"time"
)

type Contact struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Phone      string `json:"phone"`
	Company    string `json:"company"`
	Notes      string `json:"notes"`
	PictureURL string `json:"pictureUrl"`
	CreatedAt  int64  `json:"createdAt"`
	UpdatedAt  int64  `json:"updatedAt"`
}

type ContactFilter struct {
	Search string `json:"search"`
	Page   int    `json:"page"`
	Limit  int    `json:"limit"`
}

type ContactListResponse struct {
	Contacts []Contact `json:"contacts"`
	Total    int       `json:"total"`
	Page     int       `json:"page"`
	Limit    int       `json:"limit"`
}

type contactStore struct {
	db *sql.DB
	mu sync.RWMutex
}

func newContactStore(ctx context.Context, db *sql.DB) (*contactStore, error) {
	query := `CREATE TABLE IF NOT EXISTS contacts (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		phone TEXT NOT NULL UNIQUE,
		company TEXT DEFAULT '',
		notes TEXT DEFAULT '',
		picture_url TEXT DEFAULT '',
		created_at INTEGER NOT NULL,
		updated_at INTEGER NOT NULL
	);
	CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone);
	CREATE INDEX IF NOT EXISTS idx_contacts_name ON contacts(name);
	`
	_, err := db.ExecContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to create contacts table: %w", err)
	}

	return &contactStore{db: db}, nil
}

func (cs *contactStore) Create(ctx context.Context, c Contact) (*Contact, error) {
	cs.mu.Lock()
	defer cs.mu.Unlock()

	now := time.Now().UnixMilli()
	if c.ID == "" {
		c.ID = fmt.Sprintf("ct_%d", now)
	}
	if c.CreatedAt == 0 {
		c.CreatedAt = now
	}
	c.UpdatedAt = now

	// Clean phone number (strip whitespace and non-digit characters except leading +)
	c.Phone = strings.TrimSpace(c.Phone)

	query := `
	INSERT INTO contacts (id, name, phone, company, notes, picture_url, created_at, updated_at)
	VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	ON CONFLICT(phone) DO UPDATE SET
		name = excluded.name,
		company = excluded.company,
		notes = excluded.notes,
		picture_url = CASE WHEN excluded.picture_url != '' THEN excluded.picture_url ELSE contacts.picture_url END,
		updated_at = excluded.updated_at
	`
	_, err := cs.db.ExecContext(ctx, query, c.ID, c.Name, c.Phone, c.Company, c.Notes, c.PictureURL, c.CreatedAt, c.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("failed to save contact: %w", err)
	}

	return &c, nil
}

func (cs *contactStore) Update(ctx context.Context, c Contact) (*Contact, error) {
	cs.mu.Lock()
	defer cs.mu.Unlock()

	now := time.Now().UnixMilli()
	c.UpdatedAt = now

	query := `
	UPDATE contacts
	SET name = ?, phone = ?, company = ?, notes = ?, picture_url = ?, updated_at = ?
	WHERE id = ?
	`
	res, err := cs.db.ExecContext(ctx, query, c.Name, c.Phone, c.Company, c.Notes, c.PictureURL, c.UpdatedAt, c.ID)
	if err != nil {
		return nil, fmt.Errorf("failed to update contact: %w", err)
	}

	rows, _ := res.RowsAffected()
	if rows == 0 {
		return nil, fmt.Errorf("contact not found")
	}

	return &c, nil
}

func (cs *contactStore) Delete(ctx context.Context, id string) error {
	cs.mu.Lock()
	defer cs.mu.Unlock()

	_, err := cs.db.ExecContext(ctx, "DELETE FROM contacts WHERE id = ?", id)
	return err
}

func (cs *contactStore) GetByID(ctx context.Context, id string) (*Contact, error) {
	cs.mu.RLock()
	defer cs.mu.RUnlock()

	var c Contact
	query := `SELECT id, name, phone, company, notes, picture_url, created_at, updated_at FROM contacts WHERE id = ?`
	err := cs.db.QueryRowContext(ctx, query, id).Scan(
		&c.ID, &c.Name, &c.Phone, &c.Company, &c.Notes, &c.PictureURL, &c.CreatedAt, &c.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &c, nil
}

func (cs *contactStore) List(ctx context.Context, filter ContactFilter) (*ContactListResponse, error) {
	cs.mu.RLock()
	defer cs.mu.RUnlock()

	whereClause := []string{"1=1"}
	args := []any{}

	if filter.Search != "" {
		whereClause = append(whereClause, "(name LIKE ? OR phone LIKE ? OR company LIKE ? OR notes LIKE ?)")
		term := "%" + filter.Search + "%"
		args = append(args, term, term, term, term)
	}

	whereStmt := strings.Join(whereClause, " AND ")

	var total int
	countQuery := "SELECT COUNT(*) FROM contacts WHERE " + whereStmt
	err := cs.db.QueryRowContext(ctx, countQuery, args...).Scan(&total)
	if err != nil {
		return nil, err
	}

	page := filter.Page
	if page < 1 {
		page = 1
	}
	limit := filter.Limit
	if limit < 1 || limit > 500 {
		limit = 50
	}
	offset := (page - 1) * limit

	query := fmt.Sprintf(`
		SELECT id, name, phone, company, notes, picture_url, created_at, updated_at
		FROM contacts
		WHERE %s
		ORDER BY name ASC
		LIMIT ? OFFSET ?
	`, whereStmt)

	queryArgs := append(args, limit, offset)
	rows, err := cs.db.QueryContext(ctx, query, queryArgs...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	contacts := make([]Contact, 0)
	for rows.Next() {
		var c Contact
		if err := rows.Scan(&c.ID, &c.Name, &c.Phone, &c.Company, &c.Notes, &c.PictureURL, &c.CreatedAt, &c.UpdatedAt); err == nil {
			contacts = append(contacts, c)
		}
	}

	return &ContactListResponse{
		Contacts: contacts,
		Total:    total,
		Page:     page,
		Limit:    limit,
	}, nil
}
