package main

import (
	"context"
	"errors"
	"strings"
	"sync"
	"time"

	"gorm.io/gorm"
)

type Plan struct {
	ID                 string `gorm:"primaryKey" json:"id"`
	Name               string `gorm:"not null" json:"name"`
	Description        string `gorm:"type:text" json:"description"`
	PriceCents         int    `gorm:"default:0" json:"priceCents"`
	MaxInstances       int    `gorm:"not null;default:1" json:"maxInstances"`
	MaxConcurrentCalls int    `gorm:"not null;default:2" json:"maxConcurrentCalls"`
	TrialDays          int    `gorm:"default:0" json:"trialDays"`
	HasVoiceAI         bool   `gorm:"default:true" json:"hasVoiceAi"`
	HasAPIAccess       bool   `gorm:"default:true" json:"hasApiAccess"`
	HasCampaigns       bool   `gorm:"default:true" json:"hasCampaigns"`
	IsDefault          bool   `gorm:"default:false" json:"isDefault"`
	IsActive           bool   `gorm:"default:true" json:"isActive"`
	CreatedAt          int64  `gorm:"not null" json:"createdAt"`
}

func (Plan) TableName() string {
	return "plans"
}

type planStore struct {
	db *gorm.DB
	mu sync.RWMutex
}

func newPlanStore(ctx context.Context, db *gorm.DB) (*planStore, error) {
	if err := db.WithContext(ctx).AutoMigrate(&Plan{}); err != nil {
		return nil, err
	}

	store := &planStore{db: db}

	// Seed default plans if empty
	var count int64
	if err := db.WithContext(ctx).Model(&Plan{}).Count(&count).Error; err == nil && count == 0 {
		now := time.Now().UnixMilli()
		freePlan := Plan{
			ID:                 "plan_free",
			Name:               "Gratuito / Teste",
			Description:        "Plano inicial com 1 linha WhatsApp e agente de voz IA.",
			PriceCents:         0,
			MaxInstances:       1,
			MaxConcurrentCalls: 2,
			TrialDays:          0,
			HasVoiceAI:         true,
			HasAPIAccess:       true,
			HasCampaigns:       true,
			IsDefault:          true,
			IsActive:           true,
			CreatedAt:          now,
		}
		if err := db.WithContext(ctx).Create(&freePlan).Error; err != nil {
			return nil, err
		}

		proPlan := Plan{
			ID:                 "plan_pro",
			Name:               "Profissional",
			Description:        "Ideal para pequenas e médias equipes: 3 linhas simultâneas.",
			PriceCents:         9700,
			MaxInstances:       3,
			MaxConcurrentCalls: 5,
			TrialDays:          0,
			HasVoiceAI:         true,
			HasAPIAccess:       true,
			HasCampaigns:       true,
			IsDefault:          false,
			IsActive:           true,
			CreatedAt:          now,
		}
		if err := db.WithContext(ctx).Create(&proPlan).Error; err != nil {
			return nil, err
		}
	}

	return store, nil
}

func (s *planStore) listPlans(ctx context.Context, onlyActive bool) ([]Plan, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var plans []Plan
	query := s.db.WithContext(ctx).Order("price_cents asc, created_at asc")
	if onlyActive {
		query = query.Where("is_active = ?", true)
	}
	if err := query.Find(&plans).Error; err != nil {
		return nil, err
	}
	return plans, nil
}

func (s *planStore) getPlanByID(ctx context.Context, id string) (*Plan, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var p Plan
	err := s.db.WithContext(ctx).Where("id = ?", id).First(&p).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &p, nil
}

func (s *planStore) getDefaultPlan(ctx context.Context) (*Plan, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var p Plan
	err := s.db.WithContext(ctx).Where("is_default = ? AND is_active = ?", true, true).First(&p).Error
	if err == nil {
		return &p, nil
	}

	// Fallback to first active plan
	err = s.db.WithContext(ctx).Where("is_active = ?", true).Order("price_cents asc").First(&p).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &p, nil
}

func (s *planStore) createPlan(ctx context.Context, p Plan) (*Plan, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if p.ID == "" {
		p.ID = "plan_" + newSessionID()[:8]
	}
	p.Name = strings.TrimSpace(p.Name)
	if p.Name == "" {
		return nil, errors.New("nome do plano é obrigatório")
	}
	if p.MaxInstances < 1 {
		p.MaxInstances = 1
	}
	if p.MaxConcurrentCalls < 1 {
		p.MaxConcurrentCalls = 2
	}
	p.CreatedAt = time.Now().UnixMilli()

	if p.IsDefault {
		if err := s.db.WithContext(ctx).Model(&Plan{}).Where("1=1").Update("is_default", false).Error; err != nil {
			return nil, err
		}
	}

	if err := s.db.WithContext(ctx).Create(&p).Error; err != nil {
		return nil, err
	}
	return &p, nil
}

func (s *planStore) updatePlan(ctx context.Context, p Plan) (*Plan, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	existing, err := s.getPlanByID(ctx, p.ID)
	if err != nil || existing == nil {
		return nil, errors.New("plano não encontrado")
	}

	p.Name = strings.TrimSpace(p.Name)
	if p.Name == "" {
		p.Name = existing.Name
	}
	if p.MaxInstances < 1 {
		p.MaxInstances = 1
	}
	if p.MaxConcurrentCalls < 1 {
		p.MaxConcurrentCalls = 2
	}

	if p.IsDefault && !existing.IsDefault {
		if err := s.db.WithContext(ctx).Model(&Plan{}).Where("id != ?", p.ID).Update("is_default", false).Error; err != nil {
			return nil, err
		}
	}

	updates := map[string]any{
		"name":                 p.Name,
		"description":          p.Description,
		"price_cents":          p.PriceCents,
		"max_instances":        p.MaxInstances,
		"max_concurrent_calls": p.MaxConcurrentCalls,
		"trial_days":           p.TrialDays,
		"has_voice_ai":         p.HasVoiceAI,
		"has_api_access":       p.HasAPIAccess,
		"has_campaigns":        p.HasCampaigns,
		"is_default":           p.IsDefault,
		"is_active":            p.IsActive,
	}

	if err := s.db.WithContext(ctx).Model(&Plan{}).Where("id = ?", p.ID).Updates(updates).Error; err != nil {
		return nil, err
	}
	return &p, nil
}

func (s *planStore) deletePlan(ctx context.Context, id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Soft delete / disable
	return s.db.WithContext(ctx).Model(&Plan{}).Where("id = ?", id).Update("is_active", false).Error
}
