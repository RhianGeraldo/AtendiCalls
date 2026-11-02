package main

import (
	"fmt"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

type clientBucket struct {
	tokens     float64
	lastRefill time.Time
}

type RateLimiter struct {
	mu          sync.Mutex
	buckets     map[string]*clientBucket
	ratePerSec  float64
	burst       float64
	lastCleanUp time.Time
}

func NewRateLimiter(requestsPerMinute, burst int) *RateLimiter {
	rate := float64(requestsPerMinute) / 60.0
	return &RateLimiter{
		buckets:     make(map[string]*clientBucket),
		ratePerSec:  rate,
		burst:       float64(burst),
		lastCleanUp: time.Now(),
	}
}

func (rl *RateLimiter) Allow(clientKey string) (bool, int) {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()

	// Periodic cleanup of stale client buckets every 5 minutes
	if now.Sub(rl.lastCleanUp) > 5*time.Minute {
		for k, b := range rl.buckets {
			if now.Sub(b.lastRefill) > 10*time.Minute {
				delete(rl.buckets, k)
			}
		}
		rl.lastCleanUp = now
	}

	b, ok := rl.buckets[clientKey]
	if !ok {
		b = &clientBucket{
			tokens:     rl.burst - 1,
			lastRefill: now,
		}
		rl.buckets[clientKey] = b
		return true, int(b.tokens)
	}

	// Refill tokens based on elapsed time
	elapsed := now.Sub(b.lastRefill).Seconds()
	b.tokens += elapsed * rl.ratePerSec
	if b.tokens > rl.burst {
		b.tokens = rl.burst
	}
	b.lastRefill = now

	if b.tokens >= 1.0 {
		b.tokens -= 1.0
		return true, int(b.tokens)
	}

	return false, 0
}

func (s *server) rateLimitMiddleware(next http.Handler) http.Handler {
	limiter := NewRateLimiter(120, 30) // 120 req/min with burst of 30

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Only apply rate limiting to public /api/v1/ endpoints
		if !strings.HasPrefix(r.URL.Path, "/api/v1/") {
			next.ServeHTTP(w, r)
			return
		}

		// Client identification: prefer API key or Bearer token, fallback to Remote IP
		clientKey := ""
		if apiKey := r.Header.Get("X-API-Key"); apiKey != "" {
			clientKey = "key:" + apiKey
		} else if auth := r.Header.Get("Authorization"); strings.HasPrefix(strings.ToLower(auth), "bearer ") {
			clientKey = "bearer:" + strings.TrimSpace(auth[7:])
		} else {
			ip, _, err := net.SplitHostPort(r.RemoteAddr)
			if err != nil {
				ip = r.RemoteAddr
			}
			clientKey = "ip:" + ip
		}

		allowed, remaining := limiter.Allow(clientKey)
		w.Header().Set("X-RateLimit-Limit", "120")
		w.Header().Set("X-RateLimit-Remaining", fmt.Sprintf("%d", remaining))

		if !allowed {
			w.Header().Set("Retry-After", "60")
			writeJSON(w, http.StatusTooManyRequests, map[string]any{
				"error":      "Too Many Requests: rate limit exceeded (120 req/min). Please try again shortly.",
				"retryAfter": 60,
			})
			return
		}

		next.ServeHTTP(w, r)
	})
}
