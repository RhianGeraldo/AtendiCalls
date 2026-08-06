package main

import (
	"context"
	"database/sql"
	"fmt"
	"sync"
)

type settingsStore struct {
	db *sql.DB
	mu sync.RWMutex
}

func newSettingsStore(ctx context.Context, db *sql.DB) (*settingsStore, error) {
	query := `CREATE TABLE IF NOT EXISTS system_settings (
		key TEXT PRIMARY KEY,
		value TEXT NOT NULL
	);`
	if _, err := db.ExecContext(ctx, query); err != nil {
		return nil, fmt.Errorf("failed to create system_settings table: %w", err)
	}
	return &settingsStore{db: db}, nil
}

func (s *settingsStore) Get(ctx context.Context, key string) (string, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var val string
	err := s.db.QueryRowContext(ctx, `SELECT value FROM system_settings WHERE key = ?`, key).Scan(&val)
	if err != nil {
		return "", err
	}
	return val, nil
}

func (s *settingsStore) Set(ctx context.Context, key, val string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	query := `INSERT INTO system_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`
	_, err := s.db.ExecContext(ctx, query, key, val)
	return err
}

func (s *settingsStore) GetAll(ctx context.Context) (map[string]string, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	rows, err := s.db.QueryContext(ctx, `SELECT key, value FROM system_settings`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	res := make(map[string]string)
	for rows.Next() {
		var k, v string
		if err := rows.Scan(&k, &v); err == nil {
			res[k] = v
		}
	}
	return res, nil
}
