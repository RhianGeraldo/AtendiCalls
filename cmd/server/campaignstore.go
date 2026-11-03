package main

import (
	"context"
	"fmt"
	"sync"
	"time"

	"gorm.io/gorm"
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
	ID         string             `gorm:"primaryKey" json:"id"`
	CampaignID string             `gorm:"index;not null" json:"campaignId"`
	ContactID  string             `gorm:"default:''" json:"contactId"`
	Name       string             `gorm:"not null" json:"name"`
	Phone      string             `gorm:"not null" json:"phone"`
	PictureURL string             `gorm:"default:''" json:"pictureUrl"`
	Status     CampaignItemStatus `gorm:"default:'pending'" json:"status"`
	StartedAt  *int64             `json:"startedAt,omitempty"`
	EndedAt    *int64             `json:"endedAt,omitempty"`
	EndReason  string             `gorm:"default:''" json:"endReason,omitempty"`
	Notes      string             `gorm:"type:text;default:''" json:"notes,omitempty"`
}

func (CampaignItem) TableName() string {
	return "campaign_items"
}

type Campaign struct {
	ID           string         `gorm:"primaryKey" json:"id"`
	UserID       string         `gorm:"index;default:''" json:"userId,omitempty"`
	Name         string         `gorm:"not null" json:"name"`
	SessionID    string         `gorm:"index;not null" json:"sessionId"`
	SessionName  string         `gorm:"-" json:"sessionName,omitempty"`
	SessionPhone string         `gorm:"-" json:"sessionPhone,omitempty"`
	Playbook     string         `gorm:"type:text;default:''" json:"playbook"`
	DelaySeconds int            `gorm:"default:5" json:"delaySeconds"`
	Status       CampaignStatus `gorm:"default:'pending'" json:"status"`
	TotalItems   int            `gorm:"-" json:"totalItems"`
	DoneItems    int            `gorm:"-" json:"doneItems"`
	Items        []CampaignItem `gorm:"foreignKey:CampaignID;constraint:OnDelete:CASCADE" json:"items,omitempty"`
	CreatedAt    int64          `gorm:"not null" json:"createdAt"`
	UpdatedAt    int64          `gorm:"not null" json:"updatedAt"`
}

func (Campaign) TableName() string {
	return "campaigns"
}

type campaignStore struct {
	db *gorm.DB
	mu sync.RWMutex
}

func newCampaignStore(ctx context.Context, db *gorm.DB) (*campaignStore, error) {
	if !db.Migrator().HasTable(&Campaign{}) {
		if err := db.WithContext(ctx).AutoMigrate(&Campaign{}); err != nil {
			return nil, fmt.Errorf("auto migrate campaigns: %w", err)
		}
	}
	if !db.Migrator().HasTable(&CampaignItem{}) {
		if err := db.WithContext(ctx).AutoMigrate(&CampaignItem{}); err != nil {
			return nil, fmt.Errorf("auto migrate campaign_items: %w", err)
		}
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

	for i := range items {
		if items[i].ID == "" {
			items[i].ID = fmt.Sprintf("%s_item_%d", c.ID, i+1)
		}
		items[i].CampaignID = c.ID
		if items[i].Status == "" {
			items[i].Status = CampaignItemPending
		}
	}
	c.Items = items

	err := cs.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		return tx.Create(&c).Error
	})
	if err != nil {
		return nil, err
	}

	return cs.getByIDUnlocked(ctx, c.ID)
}

func (cs *campaignStore) getByIDUnlocked(ctx context.Context, id string) (*Campaign, error) {
	var c Campaign
	if err := cs.db.WithContext(ctx).Where("id = ?", id).Preload("Items").First(&c).Error; err != nil {
		return nil, err
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

func (cs *campaignStore) List(ctx context.Context, userID string) ([]Campaign, error) {
	cs.mu.RLock()
	defer cs.mu.RUnlock()

	var list []Campaign
	query := cs.db.WithContext(ctx).Model(&Campaign{}).Order("created_at desc")
	if userID != "" {
		subQuery := cs.db.Model(&sessionRow{}).Select("id").Where("user_id = ?", userID)
		query = query.Where("user_id = ? OR session_id IN (?)", userID, subQuery)
	}

	if err := query.Find(&list).Error; err != nil {
		return nil, err
	}

	for i := range list {
		var total int64
		var done int64
		_ = cs.db.WithContext(ctx).Model(&CampaignItem{}).Where("campaign_id = ?", list[i].ID).Count(&total).Error
		_ = cs.db.WithContext(ctx).Model(&CampaignItem{}).Where("campaign_id = ? AND status NOT IN ('pending', 'calling')", list[i].ID).Count(&done).Error
		list[i].TotalItems = int(total)
		list[i].DoneItems = int(done)
	}

	return list, nil
}

func (cs *campaignStore) UpdateStatus(ctx context.Context, id string, status CampaignStatus) error {
	cs.mu.Lock()
	defer cs.mu.Unlock()

	now := time.Now().UnixMilli()
	return cs.db.WithContext(ctx).Model(&Campaign{}).Where("id = ?", id).Updates(map[string]any{
		"status":     status,
		"updated_at": now,
	}).Error
}

func (cs *campaignStore) UpdateItem(ctx context.Context, itemID string, status CampaignItemStatus, endReason, notes string) error {
	cs.mu.Lock()
	defer cs.mu.Unlock()

	now := time.Now().UnixMilli()
	updates := map[string]any{
		"status":     status,
		"ended_at":   now,
		"end_reason": endReason,
		"notes":      notes,
	}
	return cs.db.WithContext(ctx).Model(&CampaignItem{}).Where("id = ?", itemID).Updates(updates).Error
}

func (cs *campaignStore) Delete(ctx context.Context, id string) error {
	cs.mu.Lock()
	defer cs.mu.Unlock()

	return cs.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("campaign_id = ?", id).Delete(&CampaignItem{}).Error; err != nil {
			return err
		}
		return tx.Where("id = ?", id).Delete(&Campaign{}).Error
	})
}
