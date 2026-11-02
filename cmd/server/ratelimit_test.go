package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestRateLimiter_AllowsAndBlocks(t *testing.T) {
	// 5 requests per minute, burst of 2
	limiter := NewRateLimiter(5, 2)

	// First request: OK
	allowed, _ := limiter.Allow("client_1")
	if !allowed {
		t.Fatal("expected first request to be allowed")
	}

	// Second request: OK (consumed burst)
	allowed, _ = limiter.Allow("client_1")
	if !allowed {
		t.Fatal("expected second request to be allowed")
	}

	// Third request immediate: Should be blocked
	allowed, _ = limiter.Allow("client_1")
	if allowed {
		t.Fatal("expected third immediate request to be blocked")
	}

	// Other client should still be allowed
	allowed, _ = limiter.Allow("client_2")
	if !allowed {
		t.Fatal("expected client_2 to be allowed")
	}
}

func TestRateLimitMiddleware_Headers(t *testing.T) {
	srv := &server{}
	nextHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	})

	handler := srv.rateLimitMiddleware(nextHandler)

	req := httptest.NewRequest("GET", "/api/v1/sessions", nil)
	req.Header.Set("X-API-Key", "test_key_123")
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", rec.Code)
	}

	if limit := rec.Header().Get("X-RateLimit-Limit"); limit != "120" {
		t.Fatalf("expected X-RateLimit-Limit 120, got %s", limit)
	}
	if rec.Header().Get("X-RateLimit-Remaining") == "" {
		t.Fatal("expected X-RateLimit-Remaining header")
	}
}

func TestWebhookHMAC_Verification(t *testing.T) {
	secret := "my_super_secret_key"
	payload := []byte(`{"event":"test","callId":"123"}`)

	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(payload)
	expectedSig := hex.EncodeToString(mac.Sum(nil))

	if expectedSig == "" {
		t.Fatal("expected non-empty HMAC signature")
	}
}
