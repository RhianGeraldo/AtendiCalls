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
	ID           string   `json:"id"`
	Name         string   `json:"name"`
	Email        string   `json:"email"`
	PasswordHash string   `json:"-"`
	Role         UserRole `json:"role"`
	CreatedAt    int64    `json:"createdAt"`
}

type userStore struct {
	db     *sql.DB
	mu     sync.RWMutex
	tokens map[string]string // token -> userID
}

func newUserStore(ctx context.Context, db *sql.DB) (*userStore, error) {
	_, err := db.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS users (
		id            TEXT PRIMARY KEY,
		name          TEXT NOT NULL,
		email         TEXT UNIQUE NOT NULL,
		password_hash TEXT NOT NULL,
		role          TEXT NOT NULL DEFAULT 'user',
		created_at    INTEGER NOT NULL
	)`)
	if err != nil {
		return nil, fmt.Errorf("create users table: %w", err)
	}

	store := &userStore{
		db:     db,
		tokens: make(map[string]string),
	}

	// Seed default Admin user if database has no users
	var count int
	err = db.QueryRowContext(ctx, `SELECT COUNT(*) FROM users`).Scan(&count)
	if err == nil && count == 0 {
		hash, err := bcrypt.GenerateFromPassword([]byte("admin123"), bcrypt.DefaultCost)
		if err == nil {
			id := newSessionID()
			now := time.Now().UnixMilli()
			_, _ = db.ExecContext(ctx, `INSERT INTO users (id, name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
				id, "Administrador", "admin@wacalls.com", string(hash), string(RoleAdmin), now)
		}
	}

	return store, nil
}

func (s *userStore) listUsers(ctx context.Context) ([]User, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id, name, email, password_hash, role, created_at FROM users ORDER BY created_at ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []User
	for rows.Next() {
		var u User
		var roleStr string
		if err := rows.Scan(&u.ID, &u.Name, &u.Email, &u.PasswordHash, &roleStr, &u.CreatedAt); err != nil {
			return nil, err
		}
		u.Role = UserRole(roleStr)
		users = append(users, u)
	}
	return users, rows.Err()
}

func (s *userStore) getUserByEmail(ctx context.Context, email string) (*User, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	var u User
	var roleStr string
	err := s.db.QueryRowContext(ctx, `SELECT id, name, email, password_hash, role, created_at FROM users WHERE LOWER(email) = ?`, email).
		Scan(&u.ID, &u.Name, &u.Email, &u.PasswordHash, &roleStr, &u.CreatedAt)
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
	var u User
	var roleStr string
	err := s.db.QueryRowContext(ctx, `SELECT id, name, email, password_hash, role, created_at FROM users WHERE id = ?`, id).
		Scan(&u.ID, &u.Name, &u.Email, &u.PasswordHash, &roleStr, &u.CreatedAt)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	u.Role = UserRole(roleStr)
	return &u, nil
}

func (s *userStore) createUser(ctx context.Context, name, email, password string, role UserRole) (*User, error) {
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

	_, err = s.db.ExecContext(ctx, `INSERT INTO users (id, name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
		id, name, email, string(hash), string(role), now)
	if err != nil {
		return nil, err
	}

	return &User{
		ID:        id,
		Name:      name,
		Email:     email,
		Role:      role,
		CreatedAt: now,
	}, nil
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

	return u, nil
}

func (s *userStore) deleteUser(ctx context.Context, id string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM users WHERE id = ?`, id)
	return err
}

func (s *userStore) createToken(userID string) string {
	b := make([]byte, 24)
	rand.Read(b)
	tok := hex.EncodeToString(b)

	s.mu.Lock()
	s.tokens[tok] = userID
	s.mu.Unlock()

	return tok
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
