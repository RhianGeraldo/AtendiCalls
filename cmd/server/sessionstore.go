package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"

	"gorm.io/gorm"
)

type sessionRow struct {
	ID     string `gorm:"primaryKey" json:"id"`
	Name   string `gorm:"not null" json:"name"`
	JID    string `gorm:"column:jid" json:"jid"`
	Token  string `gorm:"index" json:"token"`
	UserID string `gorm:"index" json:"userId"`
}

func (sessionRow) TableName() string {
	return "sessions"
}

type sessionStore struct {
	db *gorm.DB
}

func newSessionStore(ctx context.Context, db *gorm.DB) (*sessionStore, error) {
	if err := db.WithContext(ctx).AutoMigrate(&sessionRow{}); err != nil {
		return nil, err
	}
	return &sessionStore{db: db}, nil
}

func newSessionID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func newSessionToken() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func (s *sessionStore) list(ctx context.Context) ([]sessionRow, error) {
	var out []sessionRow
	if err := s.db.WithContext(ctx).Order("name asc").Find(&out).Error; err != nil {
		return nil, err
	}

	for i := range out {
		if out[i].Token == "" {
			out[i].Token = newSessionToken()
			_ = s.db.WithContext(ctx).Model(&sessionRow{}).Where("id = ?", out[i].ID).Update("token", out[i].Token).Error
		}
	}
	return out, nil
}

func (s *sessionStore) insert(ctx context.Context, id, name, token, userID string) error {
	if token == "" {
		token = newSessionToken()
	}
	row := sessionRow{
		ID:     id,
		Name:   name,
		Token:  token,
		UserID: userID,
	}
	return s.db.WithContext(ctx).Create(&row).Error
}

func (s *sessionStore) countByUser(ctx context.Context, userID string) (int, error) {
	if userID == "" {
		return 0, nil
	}
	var count int64
	err := s.db.WithContext(ctx).Model(&sessionRow{}).Where("user_id = ?", userID).Count(&count).Error
	return int(count), err
}

func (s *sessionStore) setJID(ctx context.Context, id, jid string) error {
	return s.db.WithContext(ctx).Model(&sessionRow{}).Where("id = ?", id).Update("jid", jid).Error
}

func (s *sessionStore) setToken(ctx context.Context, id, token string) error {
	return s.db.WithContext(ctx).Model(&sessionRow{}).Where("id = ?", id).Update("token", token).Error
}

func (s *sessionStore) delete(ctx context.Context, id string) error {
	return s.db.WithContext(ctx).Where("id = ?", id).Delete(&sessionRow{}).Error
}

func (s *sessionStore) rename(ctx context.Context, id, name string) error {
	return s.db.WithContext(ctx).Model(&sessionRow{}).Where("id = ?", id).Update("name", name).Error
}
