package main

import (
	"context"
	"testing"
	"time"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func TestAIAgentStoreRoundtrip(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Info),
	})
	if err != nil {
		t.Fatalf("open db: %v", err)
	}

	ctx := context.Background()
	store, err := newAIAgentStore(ctx, db)
	if err != nil {
		t.Fatalf("new store: %v", err)
	}

	agent := &AIAgent{
		ID:                    "agent_59610070",
		Name:                  "Test Agent",
		Provider:              "gemini_live",
		Model:                 "gemini-2.5-flash-native-audio-latest",
		Voice:                 "Aoede",
		SystemPrompt:          "You are a helpful assistant",
		FirstMessage:          "Hello",
		AutoAnswer:            true,
		AutoAnswerDelaySec:    1,
		AssignedSessions:      []string{"all"},
		EnableHangup:          true,
		HangupDelaySec:        1.5,
		EnableWhatsAppMessage: true,
		IsActive:              true,
		CreatedAt:             time.Now(),
		UpdatedAt:             time.Now(),
	}

	if err := store.CreateAgent(ctx, agent); err != nil {
		t.Fatalf("create agent: %v", err)
	}

	agent.Name = "Updated Name"
	if err := store.UpdateAgent(ctx, agent); err != nil {
		t.Fatalf("update agent: %v", err)
	}

	got, err := store.GetAgent(ctx, "agent_59610070")
	if err != nil {
		t.Fatalf("get agent: %v", err)
	}
	if got.Name != "Updated Name" {
		t.Fatalf("expected 'Updated Name', got '%s'", got.Name)
	}

	found, err := store.FindAgentForSession(ctx, "any_session_id")
	if err != nil {
		t.Fatalf("find agent: %v", err)
	}
	if found == nil {
		t.Fatalf("expected agent to be found for session, got nil")
	}
	t.Logf("Found agent: %s (%s)", found.Name, found.ID)
}
