package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type UserRole string

const (
	RoleAdmin UserRole = "admin"
	RoleUser  UserRole = "user"
)

type User struct {
	ID                 string   `gorm:"primaryKey" json:"id"`
	Name               string   `gorm:"not null" json:"name"`
	Email              string   `gorm:"uniqueIndex;not null" json:"email"`
	PasswordHash       string   `gorm:"not null" json:"-"`
	Role               UserRole `gorm:"default:'user'" json:"role"`
	PlanID             string   `gorm:"default:'plan_free'" json:"planId"`
	PlanName           string   `gorm:"-" json:"planName,omitempty"`
	CustomMaxInstances int      `gorm:"default:0" json:"customMaxInstances"`
	MaxInstances       int      `gorm:"-" json:"maxInstances"`
	CurrentInstances   int      `gorm:"-" json:"currentInstances"`
	Status             string   `gorm:"default:'active'" json:"status"`
	TrialEndsAt        int64    `gorm:"default:0" json:"trialEndsAt"`
	CreatedAt          int64    `gorm:"not null" json:"createdAt"`
}

func (User) TableName() string {
	return "users"
}

type UserToken struct {
	Token     string `gorm:"primaryKey" json:"token"`
	UserID    string `gorm:"index;not null" json:"userId"`
	CreatedAt int64  `gorm:"not null" json:"createdAt"`
}

func (UserToken) TableName() string {
	return "user_tokens"
}

type userStore struct {
	db     *gorm.DB
	mu     sync.RWMutex
	tokens map[string]string // token -> userID
}

func newUserStore(ctx context.Context, db *gorm.DB) (*userStore, error) {
	if err := db.WithContext(ctx).AutoMigrate(&User{}, &UserToken{}); err != nil {
		return nil, fmt.Errorf("auto migrate users: %w", err)
	}

	store := &userStore{
		db:     db,
		tokens: make(map[string]string),
	}

	// Load previously active tokens so user sessions persist across restarts
	var activeTokens []UserToken
	if err := db.WithContext(ctx).Find(&activeTokens).Error; err == nil {
		for _, t := range activeTokens {
			store.tokens[t.Token] = t.UserID
		}
	}

	// Seed default Admin user if database has no users
	var count int64
	if err := db.WithContext(ctx).Model(&User{}).Count(&count).Error; err == nil && count == 0 {
		hash, err := bcrypt.GenerateFromPassword([]byte("admin123"), bcrypt.DefaultCost)
		if err == nil {
			id := newSessionID()
			now := time.Now().UnixMilli()
			admin := User{
				ID:                 id,
				Name:               "Administrador",
				Email:              "admin@admin.com",
				PasswordHash:       string(hash),
				Role:               RoleAdmin,
				PlanID:             "plan_pro",
				CustomMaxInstances: 10,
				Status:             "active",
				TrialEndsAt:        0,
				CreatedAt:          now,
			}
			if err := db.WithContext(ctx).Create(&admin).Error; err != nil {
				return nil, fmt.Errorf("seed admin: %w", err)
			}
		}
	}

	return store, nil
}

func (s *userStore) fillUserExtra(ctx context.Context, u *User) {
	if u == nil {
		return
	}
	var plan Plan
	if err := s.db.WithContext(ctx).Where("id = ?", u.PlanID).First(&plan).Error; err == nil {
		u.PlanName = plan.Name
		if u.CustomMaxInstances > 0 {
			u.MaxInstances = u.CustomMaxInstances
		} else {
			u.MaxInstances = plan.MaxInstances
		}
	} else {
		u.PlanName = "Gratuito / Teste"
		if u.CustomMaxInstances > 0 {
			u.MaxInstances = u.CustomMaxInstances
		} else {
			u.MaxInstances = 1
		}
	}

	var count int64
	_ = s.db.WithContext(ctx).Model(&sessionRow{}).Where("user_id = ?", u.ID).Count(&count).Error
	u.CurrentInstances = int(count)
}

func (s *userStore) listUsers(ctx context.Context) ([]User, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var users []User
	if err := s.db.WithContext(ctx).Order("created_at asc").Find(&users).Error; err != nil {
		return nil, err
	}

	for i := range users {
		s.fillUserExtra(ctx, &users[i])
	}
	return users, nil
}

func (s *userStore) getUserByEmail(ctx context.Context, email string) (*User, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	s.mu.RLock()
	defer s.mu.RUnlock()

	var u User
	err := s.db.WithContext(ctx).Where("LOWER(email) = ?", email).First(&u).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	s.fillUserExtra(ctx, &u)
	return &u, nil
}

func (s *userStore) getUserByID(ctx context.Context, id string) (*User, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var u User
	err := s.db.WithContext(ctx).Where("id = ?", id).First(&u).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	s.fillUserExtra(ctx, &u)
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

	newUser := User{
		ID:                 id,
		Name:               name,
		Email:              email,
		PasswordHash:       string(hash),
		Role:               role,
		PlanID:             planID,
		CustomMaxInstances: 0,
		Status:             "active",
		TrialEndsAt:        trialEndsAt,
		CreatedAt:          now,
	}

	if err := s.db.WithContext(ctx).Create(&newUser).Error; err != nil {
		return nil, err
	}

	return s.getUserByID(ctx, id)
}

func (s *userStore) updateUser(ctx context.Context, id, name, email, password string, role UserRole) (*User, error) {
	u, err := s.getUserByID(ctx, id)
	if err != nil || u == nil {
		return nil, errors.New("usuário não encontrado")
	}

	updates := map[string]any{}
	if name != "" {
		updates["name"] = strings.TrimSpace(name)
	}
	if email != "" {
		updates["email"] = strings.ToLower(strings.TrimSpace(email))
	}
	if role != "" {
		updates["role"] = role
	}
	if password != "" {
		hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
		if err != nil {
			return nil, err
		}
		updates["password_hash"] = string(hash)
	}

	if len(updates) > 0 {
		if err := s.db.WithContext(ctx).Model(&User{}).Where("id = ?", id).Updates(updates).Error; err != nil {
			return nil, err
		}
	}

	return s.getUserByID(ctx, id)
}

func (s *userStore) updateUserPlan(ctx context.Context, id, planID string, customMaxInstances int) (*User, error) {
	updates := map[string]any{
		"plan_id":              planID,
		"custom_max_instances": customMaxInstances,
	}
	if err := s.db.WithContext(ctx).Model(&User{}).Where("id = ?", id).Updates(updates).Error; err != nil {
		return nil, err
	}
	return s.getUserByID(ctx, id)
}

func (s *userStore) updateUserStatus(ctx context.Context, id, status string) (*User, error) {
	if err := s.db.WithContext(ctx).Model(&User{}).Where("id = ?", id).Update("status", status).Error; err != nil {
		return nil, err
	}
	return s.getUserByID(ctx, id)
}

func (s *userStore) countUserSessions(ctx context.Context, userID string) (int, error) {
	var count int64
	err := s.db.WithContext(ctx).Model(&sessionRow{}).Where("user_id = ?", userID).Count(&count).Error
	return int(count), err
}

func (s *userStore) deleteUser(ctx context.Context, id string) error {
	s.mu.Lock()
	for tok, uid := range s.tokens {
		if uid == id {
			delete(s.tokens, tok)
		}
	}
	s.mu.Unlock()

	_ = s.db.WithContext(ctx).Where("user_id = ?", id).Delete(&UserToken{}).Error
	return s.db.WithContext(ctx).Where("id = ?", id).Delete(&User{}).Error
}

func (s *userStore) createToken(ctx context.Context, userID string) string {
	b := make([]byte, 24)
	_, _ = rand.Read(b)
	tok := hex.EncodeToString(b)
	now := time.Now().UnixMilli()

	s.mu.Lock()
	s.tokens[tok] = userID
	s.mu.Unlock()

	userTok := UserToken{
		Token:     tok,
		UserID:    userID,
		CreatedAt: now,
	}

	if ctx != nil {
		_ = s.db.WithContext(ctx).Clauses(clause.OnConflict{UpdateAll: true}).Create(&userTok).Error
	} else {
		_ = s.db.Clauses(clause.OnConflict{UpdateAll: true}).Create(&userTok).Error
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
		_ = s.db.WithContext(ctx).Where("token = ?", tok).Delete(&UserToken{}).Error
	} else {
		_ = s.db.Where("token = ?", tok).Delete(&UserToken{}).Error
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
