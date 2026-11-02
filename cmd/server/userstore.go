package main

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"golang.org/x/crypto/bcrypt"
)

type UserRole string

const (
	RoleAdmin UserRole = "admin"
	RoleUser  UserRole = "user"
)

type User struct {
	ID                 string   `json:"id"`
	Name               string   `json:"name"`
	Email              string   `json:"email"`
	PasswordHash       string   `json:"-"`
	Role               UserRole `json:"role"`
	PlanID             string   `json:"planId"`
	PlanName           string   `json:"planName,omitempty"`
	CustomMaxInstances int      `json:"customMaxInstances"`
	MaxInstances       int      `json:"maxInstances"`
	CurrentInstances   int      `json:"currentInstances"`
	Status             string   `json:"status"`
	TrialEndsAt        int64    `json:"trialEndsAt"`
	CreatedAt          int64    `json:"createdAt"`
}

type userStore struct {
	db     *sql.DB
	mu     sync.RWMutex
	tokens map[string]string // token -> userID
}

func newUserStore(ctx context.Context, db *sql.DB) (*userStore, error) {
	_, err := db.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS users (
		id                   TEXT PRIMARY KEY,
		name                 TEXT NOT NULL,
		email                TEXT UNIQUE NOT NULL,
		password_hash        TEXT NOT NULL,
		role                 TEXT NOT NULL DEFAULT 'user',
		plan_id              TEXT DEFAULT 'plan_free',
		custom_max_instances INTEGER DEFAULT 0,
		status               TEXT NOT NULL DEFAULT 'active',
		trial_ends_at        INTEGER DEFAULT 0,
		created_at           INTEGER NOT NULL
	)`)
	if err != nil {
		return nil, fmt.Errorf("create users table: %w", err)
	}

	// Migrations for existing tables: safely add missing columns if they don't exist
	_, _ = db.ExecContext(ctx, `ALTER TABLE users ADD COLUMN plan_id TEXT DEFAULT 'plan_free'`)
	_, _ = db.ExecContext(ctx, `ALTER TABLE users ADD COLUMN custom_max_instances INTEGER DEFAULT 0`)
	_, _ = db.ExecContext(ctx, `ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'active'`)
	_, _ = db.ExecContext(ctx, `ALTER TABLE users ADD COLUMN trial_ends_at INTEGER DEFAULT 0`)

	_, err = db.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS user_tokens (
		token      TEXT PRIMARY KEY,
		user_id    TEXT NOT NULL,
		created_at INTEGER NOT NULL
	)`)
	if err != nil {
		return nil, fmt.Errorf("create user_tokens table: %w", err)
	}

	store := &userStore{
		db:     db,
		tokens: make(map[string]string),
	}

	// Load previously active tokens so user sessions persist across restarts
	tokenRows, err := db.QueryContext(ctx, `SELECT token, user_id FROM user_tokens`)
	if err == nil {
		for tokenRows.Next() {
			var tok, uid string
			if err := tokenRows.Scan(&tok, &uid); err == nil {
				store.tokens[tok] = uid
			}
		}
		tokenRows.Close()
	}

	// Seed default Admin user if database has no users
	var count int
	err = db.QueryRowContext(ctx, `SELECT COUNT(*) FROM users`).Scan(&count)
	if err == nil && count == 0 {
		hash, err := bcrypt.GenerateFromPassword([]byte("admin123"), bcrypt.DefaultCost)
		if err == nil {
			id := newSessionID()
			now := time.Now().UnixMilli()
			_, _ = db.ExecContext(ctx, `INSERT INTO users (
				id, name, email, password_hash, role, plan_id, custom_max_instances, status, trial_ends_at, created_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				id, "Administrador", "admin@admin.com", string(hash), string(RoleAdmin), "plan_pro", 10, "active", 0, now)
		}
	}

	return store, nil
}

func (s *userStore) listUsers(ctx context.Context) ([]User, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	query := `SELECT 
		u.id, u.name, u.email, u.password_hash, u.role,
		COALESCE(u.plan_id, 'plan_free'),
		COALESCE(p.name, 'Gratuito / Teste'),
		COALESCE(u.custom_max_instances, 0),
		CASE WHEN COALESCE(u.custom_max_instances, 0) > 0 THEN u.custom_max_instances ELSE COALESCE(p.max_instances, 1) END,
		(SELECT COUNT(*) FROM sessions WHERE user_id = u.id),
		COALESCE(u.status, 'active'),
		COALESCE(u.trial_ends_at, 0),
		u.created_at
	FROM users u
	LEFT JOIN plans p ON u.plan_id = p.id
	ORDER BY u.created_at ASC`

	rows, err := s.db.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []User
	for rows.Next() {
		var u User
		var roleStr string
		if err := rows.Scan(
			&u.ID, &u.Name, &u.Email, &u.PasswordHash, &roleStr,
			&u.PlanID, &u.PlanName, &u.CustomMaxInstances, &u.MaxInstances,
			&u.CurrentInstances, &u.Status, &u.TrialEndsAt, &u.CreatedAt,
		); err != nil {
			return nil, err
		}
		u.Role = UserRole(roleStr)
		users = append(users, u)
	}
	return users, rows.Err()
}

func (s *userStore) getUserByEmail(ctx context.Context, email string) (*User, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	s.mu.RLock()
	defer s.mu.RUnlock()

	query := `SELECT 
		u.id, u.name, u.email, u.password_hash, u.role,
		COALESCE(u.plan_id, 'plan_free'),
		COALESCE(p.name, 'Gratuito / Teste'),
		COALESCE(u.custom_max_instances, 0),
		CASE WHEN COALESCE(u.custom_max_instances, 0) > 0 THEN u.custom_max_instances ELSE COALESCE(p.max_instances, 1) END,
		(SELECT COUNT(*) FROM sessions WHERE user_id = u.id),
		COALESCE(u.status, 'active'),
		COALESCE(u.trial_ends_at, 0),
		u.created_at
	FROM users u
	LEFT JOIN plans p ON u.plan_id = p.id
	WHERE LOWER(u.email) = ?`

	var u User
	var roleStr string
	err := s.db.QueryRowContext(ctx, query, email).Scan(
		&u.ID, &u.Name, &u.Email, &u.PasswordHash, &roleStr,
		&u.PlanID, &u.PlanName, &u.CustomMaxInstances, &u.MaxInstances,
		&u.CurrentInstances, &u.Status, &u.TrialEndsAt, &u.CreatedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	u.Role = UserRole(roleStr)
	return &u, nil
}

func (s *userStore) getUserByID(ctx context.Context, id string) (*User, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	query := `SELECT 
		u.id, u.name, u.email, u.password_hash, u.role,
		COALESCE(u.plan_id, 'plan_free'),
		COALESCE(p.name, 'Gratuito / Teste'),
		COALESCE(u.custom_max_instances, 0),
		CASE WHEN COALESCE(u.custom_max_instances, 0) > 0 THEN u.custom_max_instances ELSE COALESCE(p.max_instances, 1) END,
		(SELECT COUNT(*) FROM sessions WHERE user_id = u.id),
		COALESCE(u.status, 'active'),
		COALESCE(u.trial_ends_at, 0),
		u.created_at
	FROM users u
	LEFT JOIN plans p ON u.plan_id = p.id
	WHERE u.id = ?`

	var u User
	var roleStr string
	err := s.db.QueryRowContext(ctx, query, id).Scan(
		&u.ID, &u.Name, &u.Email, &u.PasswordHash, &roleStr,
		&u.PlanID, &u.PlanName, &u.CustomMaxInstances, &u.MaxInstances,
		&u.CurrentInstances, &u.Status, &u.TrialEndsAt, &u.CreatedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	u.Role = UserRole(roleStr)
	return &u, nil
}

func (s *userStore) createUser(ctx context.Context, name, email, password string, role UserRole, planID string, trialDays int) (*User, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	if name == "" || email == "" || password == "" {
		return nil, errors.New("nome, e-mail e senha são obrigatórios")
	}

	existing, err := s.getUserByEmail(ctx, email)
	if err != nil {
		return nil, err
	}
	if existing != nil {
		return nil, errors.New("já existe um usuário cadastrado com este e-mail")
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("hash password: %w", err)
	}

	id := newSessionID()
	now := time.Now().UnixMilli()

	if planID == "" {
		planID = "plan_free"
	}
	var trialEndsAt int64 = 0
	if trialDays > 0 {
		trialEndsAt = now + int64(trialDays*24*60*60*1000)
	}

	_, err = s.db.ExecContext(ctx, `INSERT INTO users (
		id, name, email, password_hash, role, plan_id, custom_max_instances, status, trial_ends_at, created_at
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		id, name, email, string(hash), string(role), planID, 0, "active", trialEndsAt, now)
	if err != nil {
		return nil, err
	}

	return s.getUserByID(ctx, id)
}

func (s *userStore) updateUser(ctx context.Context, id, name, email, password string, role UserRole) (*User, error) {
	u, err := s.getUserByID(ctx, id)
	if err != nil || u == nil {
		return nil, errors.New("usuário não encontrado")
	}

	if name != "" {
		u.Name = strings.TrimSpace(name)
	}
	if email != "" {
		u.Email = strings.ToLower(strings.TrimSpace(email))
	}
	if role != "" {
		u.Role = role
	}

	if password != "" {
		hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
		if err != nil {
			return nil, err
		}
		u.PasswordHash = string(hash)
	}

	_, err = s.db.ExecContext(ctx, `UPDATE users SET name = ?, email = ?, password_hash = ?, role = ? WHERE id = ?`,
		u.Name, u.Email, u.PasswordHash, string(u.Role), id)
	if err != nil {
		return nil, err
	}

	return s.getUserByID(ctx, id)
}

func (s *userStore) updateUserPlan(ctx context.Context, id, planID string, customMaxInstances int) (*User, error) {
	_, err := s.db.ExecContext(ctx, `UPDATE users SET plan_id = ?, custom_max_instances = ? WHERE id = ?`,
		planID, customMaxInstances, id)
	if err != nil {
		return nil, err
	}
	return s.getUserByID(ctx, id)
}

func (s *userStore) updateUserStatus(ctx context.Context, id, status string) (*User, error) {
	_, err := s.db.ExecContext(ctx, `UPDATE users SET status = ? WHERE id = ?`, status, id)
	if err != nil {
		return nil, err
	}
	return s.getUserByID(ctx, id)
}

func (s *userStore) countUserSessions(ctx context.Context, userID string) (int, error) {
	var count int
	err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM sessions WHERE user_id = ?`, userID).Scan(&count)
	return count, err
}

func (s *userStore) deleteUser(ctx context.Context, id string) error {
	s.mu.Lock()
	for tok, uid := range s.tokens {
		if uid == id {
			delete(s.tokens, tok)
		}
	}
	s.mu.Unlock()

	_, _ = s.db.ExecContext(ctx, `DELETE FROM user_tokens WHERE user_id = ?`, id)
	_, err := s.db.ExecContext(ctx, `DELETE FROM users WHERE id = ?`, id)
	return err
}

func (s *userStore) createToken(ctx context.Context, userID string) string {
	b := make([]byte, 24)
	rand.Read(b)
	tok := hex.EncodeToString(b)
	now := time.Now().UnixMilli()

	s.mu.Lock()
	s.tokens[tok] = userID
	s.mu.Unlock()

	if ctx != nil {
		_, _ = s.db.ExecContext(ctx, `INSERT OR REPLACE INTO user_tokens (token, user_id, created_at) VALUES (?, ?, ?)`, tok, userID, now)
	} else {
		_, _ = s.db.Exec(`INSERT OR REPLACE INTO user_tokens (token, user_id, created_at) VALUES (?, ?, ?)`, tok, userID, now)
	}

	return tok
}

func (s *userStore) revokeToken(ctx context.Context, tok string) {
	if tok == "" {
		return
	}
	s.mu.Lock()
	delete(s.tokens, tok)
	s.mu.Unlock()

	if ctx != nil {
		_, _ = s.db.ExecContext(ctx, `DELETE FROM user_tokens WHERE token = ?`, tok)
	} else {
		_, _ = s.db.Exec(`DELETE FROM user_tokens WHERE token = ?`, tok)
	}
}

func (s *userStore) validateToken(tok string) string {
	if tok == "" {
		return ""
	}
	s.mu.RLock()
	userID := s.tokens[tok]
	s.mu.RUnlock()
	return userID
}
