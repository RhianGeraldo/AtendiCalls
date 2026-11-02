package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
)

type AIAgent struct {
	ID                    string    `json:"id"`
	UserID                string    `json:"userId,omitempty"`
	Name                  string    `json:"name"`
	Description           string    `json:"description"`
	Provider              string    `json:"provider"` // "openrouter", "openai_realtime", "gemini_live"
	Model                 string    `json:"model"`
	Voice                 string    `json:"voice"`
	SystemPrompt          string    `json:"systemPrompt"`
	FirstMessage          string    `json:"firstMessage"`
	AutoAnswer            bool      `json:"autoAnswer"`
	AutoAnswerDelaySec    int       `json:"autoAnswerDelaySec"`
	AssignedSessions      []string  `json:"assignedSessions"` // e.g. ["all"] or ["sess_1", "sess_2"]
	CallWebhookURL        string    `json:"callWebhookUrl"`
	EnableHangup          bool      `json:"enableHangup"`
	HangupDelaySec        float64   `json:"hangupDelaySec"`
	EnableWhatsAppMessage bool      `json:"enableWhatsAppMessage"`
	WhatsAppMessageRules  string    `json:"whatsappMessageRules"`
	IsActive              bool      `json:"isActive"`
	CreatedAt             time.Time `json:"createdAt"`
	UpdatedAt             time.Time `json:"updatedAt"`
}

type aiAgentStore struct {
	db *sql.DB
	mu sync.RWMutex
}

func newAIAgentStore(ctx context.Context, db *sql.DB) (*aiAgentStore, error) {
	query := `CREATE TABLE IF NOT EXISTS ai_agents (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		description TEXT,
		provider TEXT NOT NULL,
		model TEXT NOT NULL,
		voice TEXT NOT NULL,
		system_prompt TEXT NOT NULL,
		first_message TEXT NOT NULL,
		auto_answer INTEGER NOT NULL DEFAULT 1,
		auto_answer_delay_sec INTEGER NOT NULL DEFAULT 1,
		assigned_sessions TEXT NOT NULL DEFAULT '["all"]',
		call_webhook_url TEXT DEFAULT '',
		enable_hangup INTEGER NOT NULL DEFAULT 1,
		hangup_delay_sec REAL NOT NULL DEFAULT 1.5,
		enable_whatsapp_message INTEGER NOT NULL DEFAULT 1,
		whatsapp_message_rules TEXT DEFAULT '',
		is_active INTEGER NOT NULL DEFAULT 1,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);`

	if _, err := db.ExecContext(ctx, query); err != nil {
		return nil, fmt.Errorf("failed to create ai_agents table: %w", err)
	}

	// Migrations for existing tables
	_, _ = db.ExecContext(ctx, `ALTER TABLE ai_agents ADD COLUMN user_id TEXT DEFAULT '';`)
	_, _ = db.ExecContext(ctx, `CREATE INDEX IF NOT EXISTS idx_ai_agents_user_id ON ai_agents(user_id);`)
	_, _ = db.ExecContext(ctx, `ALTER TABLE ai_agents ADD COLUMN enable_hangup INTEGER NOT NULL DEFAULT 1;`)
	_, _ = db.ExecContext(ctx, `ALTER TABLE ai_agents ADD COLUMN hangup_delay_sec REAL NOT NULL DEFAULT 1.5;`)
	_, _ = db.ExecContext(ctx, `ALTER TABLE ai_agents ADD COLUMN enable_whatsapp_message INTEGER NOT NULL DEFAULT 1;`)
	_, _ = db.ExecContext(ctx, `ALTER TABLE ai_agents ADD COLUMN whatsapp_message_rules TEXT DEFAULT '';`)

	store := &aiAgentStore{db: db}
	// Seed default agent if empty
	var count int
	_ = db.QueryRowContext(ctx, `SELECT COUNT(*) FROM ai_agents`).Scan(&count)
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

	var query string
	var args []any
	if userID != "" {
		query = `
			SELECT id, COALESCE(user_id, ''), name, description, provider, model, voice, system_prompt, first_message,
			       auto_answer, auto_answer_delay_sec, assigned_sessions, call_webhook_url,
			       enable_hangup, hangup_delay_sec, enable_whatsapp_message, whatsapp_message_rules,
			       is_active, created_at, updated_at
			FROM ai_agents
			WHERE user_id = ? OR user_id = ''
			ORDER BY created_at ASC
		`
		args = append(args, userID)
	} else {
		query = `
			SELECT id, COALESCE(user_id, ''), name, description, provider, model, voice, system_prompt, first_message,
			       auto_answer, auto_answer_delay_sec, assigned_sessions, call_webhook_url,
			       enable_hangup, hangup_delay_sec, enable_whatsapp_message, whatsapp_message_rules,
			       is_active, created_at, updated_at
			FROM ai_agents
			ORDER BY created_at ASC
		`
	}

	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var agents []*AIAgent
	for rows.Next() {
		var a AIAgent
		var sessionsJSON string
		var autoAnswerInt, enableHangupInt, enableWAInt, isActiveInt int
		var desc, webhook, waRules sql.NullString
		var createdAt, updatedAt string

		if err := rows.Scan(
			&a.ID, &a.UserID, &a.Name, &desc, &a.Provider, &a.Model, &a.Voice, &a.SystemPrompt, &a.FirstMessage,
			&autoAnswerInt, &a.AutoAnswerDelaySec, &sessionsJSON, &webhook,
			&enableHangupInt, &a.HangupDelaySec, &enableWAInt, &waRules,
			&isActiveInt, &createdAt, &updatedAt,
		); err != nil {
			return nil, err
		}

		a.Description = desc.String
		a.CallWebhookURL = webhook.String
		a.WhatsAppMessageRules = waRules.String
		a.AutoAnswer = autoAnswerInt == 1
		a.EnableHangup = enableHangupInt == 1
		a.EnableWhatsAppMessage = enableWAInt == 1
		if a.HangupDelaySec <= 0 {
			a.HangupDelaySec = 1.5
		}
		a.IsActive = isActiveInt == 1
		_ = json.Unmarshal([]byte(sessionsJSON), &a.AssignedSessions)
		if a.AssignedSessions == nil {
			a.AssignedSessions = []string{}
		}

		t, _ := time.Parse("2006-01-02 15:04:05", createdAt)
		a.CreatedAt = t
		tu, _ := time.Parse("2006-01-02 15:04:05", updatedAt)
		a.UpdatedAt = tu

		agents = append(agents, &a)
	}
	return agents, nil
}

func (s *aiAgentStore) GetAgent(ctx context.Context, id string) (*AIAgent, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var a AIAgent
	var sessionsJSON string
	var autoAnswerInt, enableHangupInt, enableWAInt, isActiveInt int
	var desc, webhook, waRules sql.NullString
	var createdAt, updatedAt string

	err := s.db.QueryRowContext(ctx, `
		SELECT id, COALESCE(user_id, ''), name, description, provider, model, voice, system_prompt, first_message,
		       auto_answer, auto_answer_delay_sec, assigned_sessions, call_webhook_url,
		       enable_hangup, hangup_delay_sec, enable_whatsapp_message, whatsapp_message_rules,
		       is_active, created_at, updated_at
		FROM ai_agents WHERE id = ?
	`, id).Scan(
		&a.ID, &a.UserID, &a.Name, &desc, &a.Provider, &a.Model, &a.Voice, &a.SystemPrompt, &a.FirstMessage,
		&autoAnswerInt, &a.AutoAnswerDelaySec, &sessionsJSON, &webhook,
		&enableHangupInt, &a.HangupDelaySec, &enableWAInt, &waRules,
		&isActiveInt, &createdAt, &updatedAt,
	)
	if err != nil {
		return nil, err
	}

	a.Description = desc.String
	a.CallWebhookURL = webhook.String
	a.WhatsAppMessageRules = waRules.String
	a.AutoAnswer = autoAnswerInt == 1
	a.EnableHangup = enableHangupInt == 1
	a.EnableWhatsAppMessage = enableWAInt == 1
	if a.HangupDelaySec <= 0 {
		a.HangupDelaySec = 1.5
	}
	a.IsActive = isActiveInt == 1
	_ = json.Unmarshal([]byte(sessionsJSON), &a.AssignedSessions)
	if a.AssignedSessions == nil {
		a.AssignedSessions = []string{}
	}

	t, _ := time.Parse("2006-01-02 15:04:05", createdAt)
	a.CreatedAt = t
	tu, _ := time.Parse("2006-01-02 15:04:05", updatedAt)
	a.UpdatedAt = tu

	return &a, nil
}

func (s *aiAgentStore) CreateAgent(ctx context.Context, a *AIAgent) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if a.ID == "" {
		a.ID = "agent_" + strings.ReplaceAll(uuid.New().String()[:8], "-", "")
	}
	if a.AssignedSessions == nil {
		a.AssignedSessions = []string{}
	}
	sessionsBytes, _ := json.Marshal(a.AssignedSessions)

	autoAnswerInt := 0
	if a.AutoAnswer {
		autoAnswerInt = 1
	}
	enableHangupInt := 0
	if a.EnableHangup {
		enableHangupInt = 1
	}
	enableWAInt := 0
	if a.EnableWhatsAppMessage {
		enableWAInt = 1
	}
	if a.HangupDelaySec <= 0 {
		a.HangupDelaySec = 1.5
	}
	isActiveInt := 0
	if a.IsActive {
		isActiveInt = 1
	}

	query := `
		INSERT INTO ai_agents (
			id, user_id, name, description, provider, model, voice, system_prompt, first_message,
			auto_answer, auto_answer_delay_sec, assigned_sessions, call_webhook_url,
			enable_hangup, hangup_delay_sec, enable_whatsapp_message, whatsapp_message_rules,
			is_active, created_at, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
	`
	_, err := s.db.ExecContext(ctx, query,
		a.ID, a.UserID, a.Name, a.Description, a.Provider, a.Model, a.Voice, a.SystemPrompt, a.FirstMessage,
		autoAnswerInt, a.AutoAnswerDelaySec, string(sessionsBytes), a.CallWebhookURL,
		enableHangupInt, a.HangupDelaySec, enableWAInt, a.WhatsAppMessageRules,
		isActiveInt,
	)
	return err
}

func (s *aiAgentStore) UpdateAgent(ctx context.Context, a *AIAgent) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if a.AssignedSessions == nil {
		a.AssignedSessions = []string{}
	}
	sessionsBytes, _ := json.Marshal(a.AssignedSessions)

	autoAnswerInt := 0
	if a.AutoAnswer {
		autoAnswerInt = 1
	}
	enableHangupInt := 0
	if a.EnableHangup {
		enableHangupInt = 1
	}
	enableWAInt := 0
	if a.EnableWhatsAppMessage {
		enableWAInt = 1
	}
	if a.HangupDelaySec <= 0 {
		a.HangupDelaySec = 1.5
	}
	isActiveInt := 0
	if a.IsActive {
		isActiveInt = 1
	}

	query := `
		UPDATE ai_agents SET
			name = ?, description = ?, provider = ?, model = ?, voice = ?,
			system_prompt = ?, first_message = ?, auto_answer = ?,
			auto_answer_delay_sec = ?, assigned_sessions = ?, call_webhook_url = ?,
			enable_hangup = ?, hangup_delay_sec = ?, enable_whatsapp_message = ?, whatsapp_message_rules = ?,
			is_active = ?, updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`
	_, err := s.db.ExecContext(ctx, query,
		a.Name, a.Description, a.Provider, a.Model, a.Voice,
		a.SystemPrompt, a.FirstMessage, autoAnswerInt,
		a.AutoAnswerDelaySec, string(sessionsBytes), a.CallWebhookURL,
		enableHangupInt, a.HangupDelaySec, enableWAInt, a.WhatsAppMessageRules,
		isActiveInt, a.ID,
	)
	return err
}

func (s *aiAgentStore) DeleteAgent(ctx context.Context, id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	_, err := s.db.ExecContext(ctx, `DELETE FROM ai_agents WHERE id = ?`, id)
	return err
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
