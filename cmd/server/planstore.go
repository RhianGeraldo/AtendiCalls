package main

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"
)

type Plan struct {
	ID                 string `json:"id"`
	Name               string `json:"name"`
	Description        string `json:"description"`
	PriceCents         int    `json:"priceCents"`
	MaxInstances       int    `json:"maxInstances"`
	MaxConcurrentCalls int    `json:"maxConcurrentCalls"`
	TrialDays          int    `json:"trialDays"`
	HasVoiceAI         bool   `json:"hasVoiceAi"`
	HasAPIAccess       bool   `json:"hasApiAccess"`
	HasCampaigns       bool   `json:"hasCampaigns"`
	IsDefault          bool   `json:"isDefault"`
	IsActive           bool   `json:"isActive"`
	CreatedAt          int64  `json:"createdAt"`
}

type planStore struct {
	db *sql.DB
	mu sync.RWMutex
}

func newPlanStore(ctx context.Context, db *sql.DB) (*planStore, error) {
	query := `CREATE TABLE IF NOT EXISTS plans (
		id                    TEXT PRIMARY KEY,
		name                  TEXT NOT NULL,
		description           TEXT DEFAULT '',
		price_cents           INTEGER DEFAULT 0,
		max_instances         INTEGER NOT NULL DEFAULT 1,
		max_concurrent_calls  INTEGER NOT NULL DEFAULT 2,
		trial_days            INTEGER DEFAULT 0,
		has_voice_ai          BOOLEAN DEFAULT 1,
		has_api_access        BOOLEAN DEFAULT 1,
		has_campaigns         BOOLEAN DEFAULT 1,
		is_default            BOOLEAN DEFAULT 0,
		is_active             BOOLEAN DEFAULT 1,
		created_at            INTEGER NOT NULL
	);`
	if _, err := db.ExecContext(ctx, query); err != nil {
		return nil, fmt.Errorf("create plans table: %w", err)
	}

	store := &planStore{db: db}

	// Seed default plans if empty
	var count int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM plans`).Scan(&count); err == nil && count == 0 {
		now := time.Now().UnixMilli()
		// Free default plan: 1 WhatsApp instance, 2 concurrent calls, free
		_, _ = db.ExecContext(ctx, `INSERT INTO plans (
			id, name, description, price_cents, max_instances, max_concurrent_calls, trial_days,
			has_voice_ai, has_api_access, has_campaigns, is_default, is_active, created_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			"plan_free", "Gratuito / Teste", "Plano inicial com 1 linha WhatsApp e agente de voz IA.",
			0, 1, 2, 0, true, true, true, true, true, now)

		// Pro plan: 3 WhatsApp instances
		_, _ = db.ExecContext(ctx, `INSERT INTO plans (
			id, name, description, price_cents, max_instances, max_concurrent_calls, trial_days,
			has_voice_ai, has_api_access, has_campaigns, is_default, is_active, created_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			"plan_pro", "Profissional", "Ideal para pequenas e médias equipes: 3 linhas simultâneas.",
			9700, 3, 5, 0, true, true, true, false, true, now)
	}

	return store, nil
}

func (s *planStore) listPlans(ctx context.Context, onlyActive bool) ([]Plan, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	query := `SELECT id, name, description, price_cents, max_instances, max_concurrent_calls, trial_days,
		has_voice_ai, has_api_access, has_campaigns, is_default, is_active, created_at
		FROM plans`
	if onlyActive {
		query += ` WHERE is_active = 1`
	}
	query += ` ORDER BY price_cents ASC, created_at ASC`

	rows, err := s.db.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var plans []Plan
	for rows.Next() {
		var p Plan
		if err := rows.Scan(
			&p.ID, &p.Name, &p.Description, &p.PriceCents, &p.MaxInstances, &p.MaxConcurrentCalls, &p.TrialDays,
			&p.HasVoiceAI, &p.HasAPIAccess, &p.HasCampaigns, &p.IsDefault, &p.IsActive, &p.CreatedAt,
		); err != nil {
			return nil, err
		}
		plans = append(plans, p)
	}
	return plans, rows.Err()
}

func (s *planStore) getPlanByID(ctx context.Context, id string) (*Plan, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var p Plan
	err := s.db.QueryRowContext(ctx, `SELECT id, name, description, price_cents, max_instances, max_concurrent_calls, trial_days,
		has_voice_ai, has_api_access, has_campaigns, is_default, is_active, created_at
		FROM plans WHERE id = ?`, id).Scan(
		&p.ID, &p.Name, &p.Description, &p.PriceCents, &p.MaxInstances, &p.MaxConcurrentCalls, &p.TrialDays,
		&p.HasVoiceAI, &p.HasAPIAccess, &p.HasCampaigns, &p.IsDefault, &p.IsActive, &p.CreatedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
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
	err := s.db.QueryRowContext(ctx, `SELECT id, name, description, price_cents, max_instances, max_concurrent_calls, trial_days,
		has_voice_ai, has_api_access, has_campaigns, is_default, is_active, created_at
		FROM plans WHERE is_default = 1 AND is_active = 1 LIMIT 1`).Scan(
		&p.ID, &p.Name, &p.Description, &p.PriceCents, &p.MaxInstances, &p.MaxConcurrentCalls, &p.TrialDays,
		&p.HasVoiceAI, &p.HasAPIAccess, &p.HasCampaigns, &p.IsDefault, &p.IsActive, &p.CreatedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			// Fallback to first active plan
			err = s.db.QueryRowContext(ctx, `SELECT id, name, description, price_cents, max_instances, max_concurrent_calls, trial_days,
				has_voice_ai, has_api_access, has_campaigns, is_default, is_active, created_at
				FROM plans WHERE is_active = 1 ORDER BY price_cents ASC LIMIT 1`).Scan(
				&p.ID, &p.Name, &p.Description, &p.PriceCents, &p.MaxInstances, &p.MaxConcurrentCalls, &p.TrialDays,
				&p.HasVoiceAI, &p.HasAPIAccess, &p.HasCampaigns, &p.IsDefault, &p.IsActive, &p.CreatedAt,
			)
			if err != nil {
				return nil, err
			}
			return &p, nil
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
		// Reset other defaults
		_, _ = s.db.ExecContext(ctx, `UPDATE plans SET is_default = 0`)
	}

	_, err := s.db.ExecContext(ctx, `INSERT INTO plans (
		id, name, description, price_cents, max_instances, max_concurrent_calls, trial_days,
		has_voice_ai, has_api_access, has_campaigns, is_default, is_active, created_at
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		p.ID, p.Name, p.Description, p.PriceCents, p.MaxInstances, p.MaxConcurrentCalls, p.TrialDays,
		p.HasVoiceAI, p.HasAPIAccess, p.HasCampaigns, p.IsDefault, p.IsActive, p.CreatedAt,
	)
	if err != nil {
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
		// Reset other defaults
		_, _ = s.db.ExecContext(ctx, `UPDATE plans SET is_default = 0 WHERE id != ?`, p.ID)
	}

	_, err = s.db.ExecContext(ctx, `UPDATE plans SET
		name = ?, description = ?, price_cents = ?, max_instances = ?, max_concurrent_calls = ?,
		trial_days = ?, has_voice_ai = ?, has_api_access = ?, has_campaigns = ?, is_default = ?, is_active = ?
		WHERE id = ?`,
		p.Name, p.Description, p.PriceCents, p.MaxInstances, p.MaxConcurrentCalls,
		p.TrialDays, p.HasVoiceAI, p.HasAPIAccess, p.HasCampaigns, p.IsDefault, p.IsActive, p.ID,
	)
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func (s *planStore) deletePlan(ctx context.Context, id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Soft delete / disable
	_, err := s.db.ExecContext(ctx, `UPDATE plans SET is_active = 0 WHERE id = ?`, id)
	return err
}
