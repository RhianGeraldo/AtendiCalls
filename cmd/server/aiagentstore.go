package main

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type AIAgent struct {
	ID                    string    `gorm:"primaryKey" json:"id"`
	UserID                string    `gorm:"index;default:''" json:"userId,omitempty"`
	Name                  string    `gorm:"not null" json:"name"`
	Description           string    `gorm:"type:text;default:''" json:"description"`
	Provider              string    `gorm:"not null" json:"provider"` // "openrouter", "openai_realtime", "gemini_live"
	Model                 string    `gorm:"not null" json:"model"`
	Voice                 string    `gorm:"not null" json:"voice"`
	SystemPrompt          string    `gorm:"type:text;not null" json:"systemPrompt"`
	FirstMessage          string    `gorm:"type:text;not null" json:"firstMessage"`
	AutoAnswer            bool      `gorm:"default:true" json:"autoAnswer"`
	AutoAnswerDelaySec    int       `gorm:"default:1" json:"autoAnswerDelaySec"`
	AssignedSessions      []string  `gorm:"-" json:"assignedSessions"`
	AssignedSessionsRaw   string    `gorm:"column:assigned_sessions;type:text" json:"-"`
	CallWebhookURL        string    `gorm:"default:''" json:"callWebhookUrl"`
	EnableHangup          bool      `gorm:"default:true" json:"enableHangup"`
	HangupDelaySec        float64   `gorm:"default:1.5" json:"hangupDelaySec"`
	EnableWhatsAppMessage bool      `gorm:"column:enable_whats_app_message;default:true" json:"enableWhatsAppMessage"`
	WhatsAppMessageRules  string    `gorm:"column:whats_app_message_rules;type:text;default:''" json:"whatsappMessageRules"`
	IsActive              bool      `gorm:"default:true" json:"isActive"`
	CreatedAt             time.Time `json:"createdAt"`
	UpdatedAt             time.Time `json:"updatedAt"`
}

func (AIAgent) TableName() string {
	return "ai_agents"
}

func (a *AIAgent) BeforeSave(tx *gorm.DB) error {
	if a.AssignedSessions == nil {
		a.AssignedSessions = []string{}
	}
	b, err := json.Marshal(a.AssignedSessions)
	if err == nil {
		a.AssignedSessionsRaw = string(b)
	}
	if a.HangupDelaySec <= 0 {
		a.HangupDelaySec = 1.5
	}
	return nil
}

func (a *AIAgent) AfterFind(tx *gorm.DB) error {
	if a.AssignedSessionsRaw != "" {
		_ = json.Unmarshal([]byte(a.AssignedSessionsRaw), &a.AssignedSessions)
	}
	if a.AssignedSessions == nil {
		a.AssignedSessions = []string{}
	}
	if a.HangupDelaySec <= 0 {
		a.HangupDelaySec = 1.5
	}
	return nil
}

type aiAgentStore struct {
	db *gorm.DB
	mu sync.RWMutex
}

func newAIAgentStore(ctx context.Context, db *gorm.DB) (*aiAgentStore, error) {
	if err := db.WithContext(ctx).AutoMigrate(&AIAgent{}); err != nil {
		return nil, fmt.Errorf("auto migrate ai_agents: %w", err)
	}

	// Rename legacy column if present in older SQLite schemas
	if db.Migrator().HasColumn(&AIAgent{}, "enable_whatsapp_message") && !db.Migrator().HasColumn(&AIAgent{}, "enable_whats_app_message") {
		_ = db.Migrator().RenameColumn(&AIAgent{}, "enable_whatsapp_message", "enable_whats_app_message")
	}
	if db.Migrator().HasColumn(&AIAgent{}, "whatsapp_message_rules") && !db.Migrator().HasColumn(&AIAgent{}, "whats_app_message_rules") {
		_ = db.Migrator().RenameColumn(&AIAgent{}, "whatsapp_message_rules", "whats_app_message_rules")
	}

	store := &aiAgentStore{db: db}

	// Seed default agent if empty
	var count int64
	_ = db.WithContext(ctx).Model(&AIAgent{}).Count(&count).Error
	if count == 0 {
		defAgent := &AIAgent{
			ID:                    "agent_comercial_padrao",
			Name:                  "Assistente Comercial Padrão",
			Description:           "Atendimento receptivo e ativo com voz executiva e envio de mensagens pelo WhatsApp.",
			Provider:              "gemini_live",
			Model:                 "gemini-2.5-flash-native-audio-latest",
			Voice:                 "Aoede",
			SystemPrompt:          "Você é a assistente de inteligência artificial de voz executiva do AtendiCalls. Seu objetivo é atender ligações com alta elegância, objetividade e cordialidade, tirando dúvidas sobre serviços e produtos.\nMantenha respostas faladas curtas e naturais de no máximo 2 a 3 frases.",
			FirstMessage:          "Olá! Sou a assistente virtual do AtendiCalls. Como posso te ajudar hoje?",
			AutoAnswer:            true,
			AutoAnswerDelaySec:    1,
			AssignedSessions:      []string{"all"},
			CallWebhookURL:        "",
			EnableHangup:          true,
			HangupDelaySec:        1.5,
			EnableWhatsAppMessage: true,
			WhatsAppMessageRules:  "",
			IsActive:              true,
			CreatedAt:             time.Now(),
			UpdatedAt:             time.Now(),
		}
		_ = store.CreateAgent(ctx, defAgent)
	}

	return store, nil
}

func (s *aiAgentStore) ListAgents(ctx context.Context, userID string) ([]*AIAgent, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var agents []*AIAgent
	query := s.db.WithContext(ctx).Order("created_at asc")
	if userID != "" {
		query = query.Where("user_id = ? OR user_id = ''", userID)
	}
	if err := query.Find(&agents).Error; err != nil {
		return nil, err
	}
	return agents, nil
}

func (s *aiAgentStore) GetAgent(ctx context.Context, id string) (*AIAgent, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var a AIAgent
	if err := s.db.WithContext(ctx).Where("id = ?", id).First(&a).Error; err != nil {
		return nil, err
	}
	return &a, nil
}

func (s *aiAgentStore) CreateAgent(ctx context.Context, a *AIAgent) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if a.ID == "" {
		a.ID = "agent_" + strings.ReplaceAll(uuid.New().String()[:8], "-", "")
	}
	now := time.Now()
	a.CreatedAt = now
	a.UpdatedAt = now

	return s.db.WithContext(ctx).Create(a).Error
}

func (s *aiAgentStore) UpdateAgent(ctx context.Context, a *AIAgent) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	a.UpdatedAt = time.Now()
	if a.AssignedSessions == nil {
		a.AssignedSessions = []string{}
	}
	b, _ := json.Marshal(a.AssignedSessions)
	a.AssignedSessionsRaw = string(b)

	updates := map[string]any{
		"name":                  a.Name,
		"description":           a.Description,
		"provider":              a.Provider,
		"model":                 a.Model,
		"voice":                 a.Voice,
		"system_prompt":         a.SystemPrompt,
		"first_message":         a.FirstMessage,
		"auto_answer":           a.AutoAnswer,
		"auto_answer_delay_sec": a.AutoAnswerDelaySec,
		"assigned_sessions":     a.AssignedSessionsRaw,
		"call_webhook_url":      a.CallWebhookURL,
		"enable_hangup":         a.EnableHangup,
		"hangup_delay_sec":      a.HangupDelaySec,
		"is_active":             a.IsActive,
		"updated_at":            a.UpdatedAt,
	}

	if s.db.Migrator().HasColumn(&AIAgent{}, "enable_whats_app_message") {
		updates["enable_whats_app_message"] = a.EnableWhatsAppMessage
	} else {
		updates["enable_whatsapp_message"] = a.EnableWhatsAppMessage
	}

	if s.db.Migrator().HasColumn(&AIAgent{}, "whats_app_message_rules") {
		updates["whats_app_message_rules"] = a.WhatsAppMessageRules
	} else {
		updates["whatsapp_message_rules"] = a.WhatsAppMessageRules
	}

	return s.db.WithContext(ctx).Model(&AIAgent{}).Where("id = ?", a.ID).Updates(updates).Error
}

func (s *aiAgentStore) DeleteAgent(ctx context.Context, id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	return s.db.WithContext(ctx).Where("id = ?", id).Delete(&AIAgent{}).Error
}

// FindAgentForSession returns an active agent mapped specifically to sessionID,
// or falls back to an active agent assigned to "all".
func (s *aiAgentStore) FindAgentForSession(ctx context.Context, sessionID string) (*AIAgent, error) {
	agents, err := s.ListAgents(ctx, "")
	if err != nil {
		return nil, err
	}

	var fallback *AIAgent
	for _, a := range agents {
		if !a.IsActive {
			continue
		}
		for _, sid := range a.AssignedSessions {
			if sid == sessionID {
				return a, nil
			}
			if sid == "all" || sid == "*" {
				if fallback == nil {
					fallback = a
				}
			}
		}
	}
	return fallback, nil
}
