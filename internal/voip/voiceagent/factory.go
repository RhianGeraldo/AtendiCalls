package voiceagent

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
)

func NewVoiceAgent(ctx context.Context, cfg AgentConfig, keys APIKeys, cb Callbacks, log *slog.Logger) (VoiceAgent, error) {
	provider := strings.ToLower(strings.TrimSpace(cfg.Provider))
	if provider == "" {
		provider = "openrouter"
	}

	switch provider {
	case "openai_realtime":
		return NewOpenAIRealtimeAgent(ctx, cfg, keys, cb, log), nil
	case "gemini_live":
		return NewGeminiLiveAgent(ctx, cfg, keys, cb, log), nil
	case "openrouter":
		return NewOpenRouterAgent(ctx, cfg, keys, cb, log), nil
	default:
		return nil, fmt.Errorf("unsupported voice agent provider: %s", provider)
	}
}
