package main

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"

	"gorm.io/gorm"
)

type Contact struct {
	ID         string `gorm:"primaryKey" json:"id"`
	UserID     string `gorm:"index" json:"userId,omitempty"`
	Name       string `gorm:"index;not null" json:"name"`
	Phone      string `gorm:"index;not null" json:"phone"`
	Company    string `gorm:"default:''" json:"company"`
	Notes      string `gorm:"type:text;default:''" json:"notes"`
	PictureURL string `gorm:"default:''" json:"pictureUrl"`
	CreatedAt  int64  `gorm:"not null" json:"createdAt"`
	UpdatedAt  int64  `gorm:"not null" json:"updatedAt"`
}

func (Contact) TableName() string {
	return "contacts"
}

type ContactFilter struct {
	UserID string `json:"userId,omitempty"`
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
	db *gorm.DB
	mu sync.RWMutex
}

func newContactStore(ctx context.Context, db *gorm.DB) (*contactStore, error) {
	if err := db.WithContext(ctx).AutoMigrate(&Contact{}); err != nil {
		return nil, fmt.Errorf("auto migrate contacts: %w", err)
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
	c.Phone = strings.TrimSpace(c.Phone)

	var existing Contact
	query := cs.db.WithContext(ctx).Where("phone = ?", c.Phone)
	if c.UserID != "" {
		query = query.Where("user_id = ?", c.UserID)
	}
	err := query.First(&existing).Error

	if err == nil {
		// Existing contact found, update it
		updates := map[string]any{
			"name":       c.Name,
			"company":    c.Company,
			"notes":      c.Notes,
			"updated_at": c.UpdatedAt,
		}
		if c.PictureURL != "" {
			updates["picture_url"] = c.PictureURL
		}
		if err := cs.db.WithContext(ctx).Model(&Contact{}).Where("id = ?", existing.ID).Updates(updates).Error; err != nil {
			return nil, fmt.Errorf("update existing contact: %w", err)
		}
		c.ID = existing.ID
		return &c, nil
	}

	if err := cs.db.WithContext(ctx).Create(&c).Error; err != nil {
		return nil, err
	}
	return &c, nil
}

func (cs *contactStore) Update(ctx context.Context, c Contact) (*Contact, error) {
	cs.mu.Lock()
	defer cs.mu.Unlock()

	now := time.Now().UnixMilli()
	c.UpdatedAt = now

	updates := map[string]any{
		"name":        c.Name,
		"phone":       c.Phone,
		"company":     c.Company,
		"notes":       c.Notes,
		"picture_url": c.PictureURL,
		"updated_at":  c.UpdatedAt,
	}

	res := cs.db.WithContext(ctx).Model(&Contact{}).Where("id = ?", c.ID).Updates(updates)
	if res.Error != nil {
		return nil, fmt.Errorf("update contact: %w", res.Error)
	}
	if res.RowsAffected == 0 {
		return nil, fmt.Errorf("contact not found")
	}

	return &c, nil
}

func (cs *contactStore) Delete(ctx context.Context, id string) error {
	cs.mu.Lock()
	defer cs.mu.Unlock()

	return cs.db.WithContext(ctx).Where("id = ?", id).Delete(&Contact{}).Error
}

func (cs *contactStore) GetByID(ctx context.Context, id string) (*Contact, error) {
	cs.mu.RLock()
	defer cs.mu.RUnlock()

	var c Contact
	err := cs.db.WithContext(ctx).Where("id = ?", id).First(&c).Error
	if err != nil {
		return nil, err
	}
	return &c, nil
}

func (cs *contactStore) List(ctx context.Context, filter ContactFilter) (*ContactListResponse, error) {
	cs.mu.RLock()
	defer cs.mu.RUnlock()

	query := cs.db.WithContext(ctx).Model(&Contact{})

	if filter.UserID != "" {
		query = query.Where("user_id = ?", filter.UserID)
	}

	if filter.Search != "" {
		term := "%" + strings.ToLower(filter.Search) + "%"
		query = query.Where("LOWER(name) LIKE ? OR phone LIKE ? OR LOWER(company) LIKE ? OR LOWER(notes) LIKE ?", term, term, term, term)
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
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

	var contacts []Contact
	if err := query.Order("name asc").Limit(limit).Offset(offset).Find(&contacts).Error; err != nil {
		return nil, err
	}

	return &ContactListResponse{
		Contacts: contacts,
		Total:    int(total),
		Page:     page,
		Limit:    limit,
	}, nil
}
