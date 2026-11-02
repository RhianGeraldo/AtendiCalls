package main

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
)

type sessionRow struct {
	ID     string
	Name   string
	JID    string
	Token  string
	UserID string
}

type sessionStore struct{ db *sql.DB }

func newSessionStore(ctx context.Context, db *sql.DB) (*sessionStore, error) {
	_, err := db.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS sessions (
		id      TEXT PRIMARY KEY,
		name    TEXT NOT NULL,
		jid     TEXT,
		token   TEXT,
		user_id TEXT
	)`)
	if err != nil {
		return nil, err
	}
	// Migrate existing database if columns don't exist
	_, _ = db.ExecContext(ctx, `ALTER TABLE sessions ADD COLUMN token TEXT`)
	_, _ = db.ExecContext(ctx, `ALTER TABLE sessions ADD COLUMN user_id TEXT`)
	_, _ = db.ExecContext(ctx, `CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)`)

	return &sessionStore{db: db}, nil
}

func newSessionID() string {
	b := make([]byte, 16)
	rand.Read(b)
	return hex.EncodeToString(b)
}

func newSessionToken() string {
	b := make([]byte, 16)
	rand.Read(b)
	return hex.EncodeToString(b)
}

func (s *sessionStore) list(ctx context.Context) ([]sessionRow, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id, name, COALESCE(jid, ''), COALESCE(token, ''), COALESCE(user_id, '') FROM sessions ORDER BY rowid`)
	if err != nil {
		return nil, err
	}
	var out []sessionRow
	for rows.Next() {
		var r sessionRow
		if err := rows.Scan(&r.ID, &r.Name, &r.JID, &r.Token, &r.UserID); err != nil {
			_ = rows.Close()
			return nil, err
		}
		out = append(out, r)
	}
	if err := rows.Err(); err != nil {
		_ = rows.Close()
		return nil, err
	}
	_ = rows.Close()

	// Update any missing tokens AFTER rows cursor is completely closed to avoid SQLite locks
	for i := range out {
		if out[i].Token == "" {
			out[i].Token = newSessionToken()
			_, _ = s.db.ExecContext(ctx, `UPDATE sessions SET token = ? WHERE id = ?`, out[i].Token, out[i].ID)
		}
	}

	return out, nil
}

func (s *sessionStore) insert(ctx context.Context, id, name, token, userID string) error {
	if token == "" {
		token = newSessionToken()
	}
	_, err := s.db.ExecContext(ctx, `INSERT INTO sessions (id, name, jid, token, user_id) VALUES (?, ?, NULL, ?, ?)`, id, name, token, userID)
	return err
}

func (s *sessionStore) countByUser(ctx context.Context, userID string) (int, error) {
	if userID == "" {
		return 0, nil
	}
	var count int
	err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM sessions WHERE user_id = ?`, userID).Scan(&count)
	return count, err
}

func (s *sessionStore) setJID(ctx context.Context, id, jid string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE sessions SET jid = ? WHERE id = ?`, jid, id)
	return err
}

func (s *sessionStore) setToken(ctx context.Context, id, token string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE sessions SET token = ? WHERE id = ?`, token, id)
	return err
}

func (s *sessionStore) delete(ctx context.Context, id string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM sessions WHERE id = ?`, id)
	return err
}

func (s *sessionStore) rename(ctx context.Context, id, name string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE sessions SET name = ? WHERE id = ?`, name, id)
	return err
}
