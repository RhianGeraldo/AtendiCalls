package main

import (
	"strings"
	"testing"
)

func TestGenerateQRBase64(t *testing.T) {
	sampleCode := "2@1234567890,abcdefghijklmnop==,qrdata"
	b64, err := generateQRBase64(sampleCode)
	if err != nil {
		t.Fatalf("failed to generate qr base64: %v", err)
	}
	if !strings.HasPrefix(b64, "data:image/png;base64,") {
		t.Fatalf("expected data:image/png;base64, prefix, got: %s", b64[:30])
	}
	if len(b64) < 100 {
		t.Fatalf("base64 string unexpectedly short: %d", len(b64))
	}
}

func TestSessionTokens(t *testing.T) {
	m := newTestManager(t)

	// Create with auto-generated token
	id1, tok1, err := m.Create("Unidade 1 - Linha 1")
	if err != nil {
		t.Fatalf("failed to create session: %v", err)
	}
	if len(tok1) < 16 {
		t.Fatalf("expected auto-generated token to have at least 16 chars, got %s", tok1)
	}

	// Create with custom token
	customTok := "my_custom_secret_token_123"
	id2, tok2, err := m.Create("Unidade 2 - Linha 1", customTok)
	if err != nil {
		t.Fatalf("failed to create session with custom token: %v", err)
	}
	if tok2 != customTok {
		t.Fatalf("expected token %s, got %s", customTok, tok2)
	}

	// Lookup by ID
	s1, ok := m.Get(id1)
	if !ok || s1 == nil {
		t.Fatalf("failed to get session by id %s", id1)
	}

	// Lookup by Name
	s2ByName, ok := m.GetByIDOrName("Unidade 2 - Linha 1")
	if !ok || s2ByName == nil || s2ByName.id != id2 {
		t.Fatalf("failed to get session by name")
	}

	// Lookup by Token
	s2ByToken, ok := m.GetByToken(customTok)
	if !ok || s2ByToken == nil || s2ByToken.id != id2 {
		t.Fatalf("failed to get session by token")
	}
}
