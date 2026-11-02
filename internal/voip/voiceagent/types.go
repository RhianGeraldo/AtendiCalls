package voiceagent

import (
	"context"
	"time"
)

type Turn struct {
	Speaker   string    `json:"speaker"` // "user" or "agent"
	Text      string    `json:"text"`
	Timestamp time.Time `json:"timestamp"`
}

type AgentConfig struct {
	Provider        string            `json:"provider"` // "openrouter", "openai_realtime", "gemini_live"
	Model           string            `json:"model"`
	Voice           string            `json:"voice"`
	SystemPrompt    string            `json:"systemPrompt"`
	FirstMessage    string            `json:"firstMessage"`
	Temperature     float64           `json:"temperature"`
	WebhookURL      string            `json:"webhookUrl"`
	Variables       map[string]string `json:"variables"`
	MaxDurationSec  int               `json:"maxDurationSec"`
	Tools           []any             `json:"tools"`
	ToolsWebhookURL string            `json:"toolsWebhookUrl"`

	// Capabilities & Tool Toggles
	EnableHangup          bool    `json:"enableHangup"`
	HangupDelaySec        float64 `json:"hangupDelaySec"`
	EnableWhatsAppMessage bool    `json:"enableWhatsAppMessage"`
	WhatsAppMessageRules  string  `json:"whatsappMessageRules"`

	// Sub-options for cascade pipelines (OpenRouter)
	STTProvider string `json:"sttProvider"` // "groq", "openai"
	TTSProvider string `json:"ttsProvider"` // "openai", "google"
}

type APIKeys struct {
	OpenRouterKey string
	OpenAIKey     string
	GoogleKey     string
	GroqKey       string
}

type WhatsAppButton struct {
	Type     string `json:"type"`               // "reply", "url", "copy", "call"
	Text     string `json:"text"`               // Button label
	ID       string `json:"id,omitempty"`       // Custom button ID
	URL      string `json:"url,omitempty"`      // Link for URL button
	CopyCode string `json:"copyCode,omitempty"` // Pix or code for copy button
	Phone    string `json:"phone,omitempty"`    // Phone for call button
}

type Callbacks struct {
	OnTurn        func(Turn)
	OnHangup      func(reason string)
	OnFeedPCM     func([]float32)
	OnSendMessage func(text string) error
	OnSendButtons func(title, body, footer string, buttons []WhatsAppButton) error
}

type VoiceAgent interface {
	Start(ctx context.Context) error
	OnConnected()
	FeedPeerAudio(pcm []float32)
	Speak(ctx context.Context, text string) error
	Interrupt()
	Close()
	GetTranscript() []Turn
}
