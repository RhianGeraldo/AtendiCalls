package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"atendicalls/internal/voip/call"
	"atendicalls/internal/voip/core"
	"atendicalls/internal/voip/signaling"
	"atendicalls/internal/voip/voiceagent"
	"atendicalls/internal/voip/wanode"
	"atendicalls/internal/wa"

	"github.com/mdp/qrterminal/v3"
	"go.mau.fi/whatsmeow"
	waBinary "go.mau.fi/whatsmeow/binary"
	"go.mau.fi/whatsmeow/proto/waE2E"
	"go.mau.fi/whatsmeow/types"
	"go.mau.fi/whatsmeow/types/events"
	"google.golang.org/protobuf/proto"
	"rsc.io/qr"
)

type Session struct {
	id     string
	name   string
	token  string
	userID string
	mgr    *SessionManager
	log    *slog.Logger

	client *whatsmeow.Client
	reg    *callRegistry

	mu         sync.Mutex
	auth       AuthSnapshot
	pushName   string
	pictureURL string
	statusText string
}

func newSession(mgr *SessionManager, id, name, token, userID string, client *whatsmeow.Client) *Session {
	if token == "" {
		token = newSessionToken()
	}
	s := &Session{
		id:     id,
		name:   name,
		token:  token,
		userID: userID,
		mgr:    mgr,
		log:    mgr.log.With("session", id),
		client: client,
		auth:   AuthSnapshot{State: "connecting"},
		reg:    newCallRegistry(),
	}
	client.AddEventHandler(s.handleEvent)
	return s
}

func (s *Session) createCall(callID string) *call.CallManager {
	cm := call.NewCallManager(wa.NewSocket(s.client), s.log)
	cm.SetRecordDir("recordings")
	cm.OnRecordDone = func(cID string, path string) {
		ctx := context.Background()
		_ = s.mgr.broker.callStore.SaveRecordingPath(ctx, cID, path)
		go s.mgr.processCallTranscription(ctx, cID, path)
	}
	s.wireCall(cm, callID)
	s.reg.add(callID, &activeCall{cm: cm})
	return cm
}

func (s *Session) getOwnPhone() string {
	if s.client != nil && s.client.Store != nil && s.client.Store.ID != nil {
		return s.client.Store.ID.User
	}
	return ""
}

func (s *Session) getOwnPictureURL() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.pictureURL
}

func (s *Session) resolveContactInfo(ctx context.Context, peerJid types.JID) (string, string) {
	name := ""
	pictureURL := ""

	if s.client != nil && s.client.Store != nil && s.client.Store.Contacts != nil {
		if ci, err := s.client.Store.Contacts.GetContact(ctx, peerJid); err == nil && ci.Found {
			if ci.FullName != "" {
				name = ci.FullName
			} else if ci.PushName != "" {
				name = ci.PushName
			} else if ci.BusinessName != "" {
				name = ci.BusinessName
			}
		}
	}

	if name == "" {
		phone := peerJid.User
		if phone != "" {
			if resp, err := s.client.IsOnWhatsApp(ctx, []string{phone}); err == nil && len(resp) > 0 && resp[0].IsIn {
				if resp[0].VerifiedName != nil && resp[0].VerifiedName.Details != nil {
					name = resp[0].VerifiedName.Details.GetVerifiedName()
				}
			}
		}
	}

	if pic, err := s.client.GetProfilePictureInfo(ctx, peerJid, &whatsmeow.GetProfilePictureParams{Preview: true}); err == nil && pic != nil {
		pictureURL = pic.URL
	}

	return name, pictureURL
}

func (s *Session) wireCall(cm *call.CallManager, callID string) {
	cm.OnIncoming = func(c *call.CallInfo) {
		displayPeer := c.PeerJid
		if c.CallCreator != "" {
			displayPeer = c.CallCreator
		}

		peerJid, _ := types.ParseJID(displayPeer)

		if peerJid.Server == types.HiddenUserServer {
			pn, err := s.client.Store.LIDs.GetPNForLID(context.Background(), peerJid)
			if err == nil && !pn.IsEmpty() {
				peerJid = pn
				displayPeer = peerJid.ToNonAD().String()
			}
		}

		name, pictureURL := s.resolveContactInfo(context.Background(), peerJid)

		s.mgr.broker.upsertCall(CallRecord{
			SessionID: s.id, SessionName: s.name, SessionPhone: s.getOwnPhone(), SessionPictureURL: s.getOwnPictureURL(),
			CallID: c.CallID, Direction: "inbound", Peer: displayPeer,
			StartedAt: time.Now().UnixMilli(), Status: StatusRinging,
			Name: name, PictureURL: pictureURL,
		})
		s.mgr.broker.emitIncoming(s.id, c.CallID, displayPeer, name, pictureURL)
	}
	cm.OnStateChange = func(c *call.CallInfo) {
		ac, _ := s.reg.get(c.CallID)
		if c.IsEnded() {
			if ac != nil {
				var transcript []voiceagent.Turn
				if ac.voiceAgent != nil {
					transcript = ac.voiceAgent.GetTranscript()
					ac.voiceAgent.Close()
				}
				if ac.webhookURL != "" && s.mgr.webhook != nil {
					s.mgr.webhook.Dispatch(ac.webhookURL, "call.ended", c.CallID, s.id, map[string]any{
						"callId":     c.CallID,
						"sessionId":  s.id,
						"reason":     string(c.StateData.EndReason),
						"peer":       c.PeerJid,
						"transcript": transcript,
					})
				}
			}
			s.removeCall(c.CallID)
			s.mgr.broker.endCall(c.CallID, string(c.StateData.EndReason))
			return
		}

		if c.StateData.State == core.CallStateActive {
			if ac != nil {
				if ac.voiceAgent != nil {
					ac.voiceAgent.OnConnected()
				}
				if ac.webhookURL != "" && s.mgr.webhook != nil {
					s.mgr.webhook.Dispatch(ac.webhookURL, "call.answered", c.CallID, s.id, map[string]any{
						"peer": c.PeerJid,
					})
				}
			}
		}

		dir := "outbound"
		if c.Direction == core.CallDirectionIncoming {
			dir = "inbound"
		}

		displayPeer := c.PeerJid
		if c.Direction == core.CallDirectionIncoming && c.CallCreator != "" {
			displayPeer = c.CallCreator
		}

		peerJid, _ := types.ParseJID(displayPeer)
		if peerJid.Server == types.HiddenUserServer {
			pn, err := s.client.Store.LIDs.GetPNForLID(context.Background(), peerJid)
			if err == nil && !pn.IsEmpty() {
				peerJid = pn
				displayPeer = pn.ToNonAD().String()
			}
		}

		existing, _ := s.mgr.broker.getCall(c.CallID)
		name := ""
		pictureURL := ""
		if existing != nil {
			name = existing.Name
			pictureURL = existing.PictureURL
		}
		if name == "" {
			name, pictureURL = s.resolveContactInfo(context.Background(), peerJid)
		}

		rec := CallRecord{
			SessionID: s.id, SessionName: s.name, SessionPhone: s.getOwnPhone(), SessionPictureURL: s.getOwnPictureURL(),
			CallID: c.CallID, Direction: dir, Peer: displayPeer,
			StartedAt: time.Now().UnixMilli(), Status: mapStatus(c.StateData.State),
			Name: name, PictureURL: pictureURL,
		}
		if existing != nil {
			rec.Owner = existing.Owner
			rec.StartedAt = existing.StartedAt
			rec.ConnectedAt = existing.ConnectedAt
			rec.Name = existing.Name
			rec.PictureURL = existing.PictureURL
			if strings.HasSuffix(rec.Peer, "@lid") && existing.Peer != "" && !strings.HasSuffix(existing.Peer, "@lid") {
				rec.Peer = existing.Peer
			}
		}
		if rec.Status == StatusConnected && rec.ConnectedAt == nil {
			now := time.Now().UnixMilli()
			rec.ConnectedAt = &now
		}
		s.mgr.broker.upsertCall(rec)
	}
	cm.OnEnded = func(c *call.CallInfo) {
		ac, _ := s.reg.get(c.CallID)
		if ac != nil {
			var transcript []voiceagent.Turn
			if ac.voiceAgent != nil {
				transcript = ac.voiceAgent.GetTranscript()
				ac.voiceAgent.Close()
			}
			if ac.webhookURL != "" && s.mgr.webhook != nil {
				s.mgr.webhook.Dispatch(ac.webhookURL, "call.ended", c.CallID, s.id, map[string]any{
					"callId":     c.CallID,
					"sessionId":  s.id,
					"reason":     string(c.StateData.EndReason),
					"peer":       c.PeerJid,
					"transcript": transcript,
				})
			}
		}
		s.removeCall(c.CallID)
		s.mgr.broker.endCall(c.CallID, string(c.StateData.EndReason))
	}
	cm.OnPeerAudio = func(pcm16 []float32) {
		ac, ok := s.reg.get(callID)
		if !ok {
			return
		}
		if ac.bridge != nil {
			_ = ac.bridge.WritePCM(pcm16)
		}
		if ac.voiceAgent != nil {
			ac.voiceAgent.FeedPeerAudio(pcm16)
		}
	}
}

func (s *Session) startOutgoingWithAgent(ctx context.Context, peer types.JID, agentCfg voiceagent.AgentConfig, webhookURL string) (string, error) {
	if max := s.mgr.maxCalls; max > 0 && s.reg.count() >= max {
		return "", fmt.Errorf("session at maximum concurrent calls capacity (%d)", max)
	}

	callID := signaling.GenerateCallID()
	cm := s.createCall(callID)

	var keys voiceagent.APIKeys
	if s.mgr.settings != nil {
		keys.OpenRouterKey, _ = s.mgr.settings.Get(ctx, "openrouter_api_key")
		keys.OpenAIKey, _ = s.mgr.settings.Get(ctx, "openai_api_key")
		keys.GoogleKey, _ = s.mgr.settings.Get(ctx, "google_api_key")
		keys.GroqKey, _ = s.mgr.settings.Get(ctx, "groq_api_key")
	}
	if keys.OpenRouterKey == "" {
		keys.OpenRouterKey = os.Getenv("OPENROUTER_API_KEY")
	}
	if keys.OpenAIKey == "" {
		keys.OpenAIKey = os.Getenv("OPENAI_API_KEY")
	}
	if keys.GoogleKey == "" {
		keys.GoogleKey = os.Getenv("GEMINI_API_KEY")
		if keys.GoogleKey == "" {
			keys.GoogleKey = os.Getenv("GOOGLE_API_KEY")
		}
	}
	if keys.GroqKey == "" {
		keys.GroqKey = os.Getenv("GROQ_API_KEY")
	}

	callbacks := voiceagent.Callbacks{
		OnFeedPCM: func(pcm []float32) {
			cm.FeedCapturedPCM(pcm)
		},
		OnTurn: func(turn voiceagent.Turn) {
			s.log.Info("voice agent turn", "call_id", callID, "speaker", turn.Speaker, "text", turn.Text)
			if webhookURL != "" && s.mgr.webhook != nil {
				s.mgr.webhook.Dispatch(webhookURL, "call.turn", callID, s.id, map[string]any{
					"speaker":   turn.Speaker,
					"text":      turn.Text,
					"timestamp": turn.Timestamp.UnixMilli(),
				})
			}
		},
		OnHangup: func(reason string) {
			go s.terminateCall(callID, core.EndCallReasonUserEnded)
		},
		OnSendMessage: func(text string) error {
			target := peer
			if target.Server == types.HiddenUserServer && s.client != nil && s.client.Store != nil {
				if pn, err := s.client.Store.LIDs.GetPNForLID(context.Background(), target); err == nil && !pn.IsEmpty() {
					target = pn
				}
			}
			s.log.Info("AI agent sending WhatsApp message during outgoing call", "call_id", callID, "target", target.String(), "text", text)
			_, err := s.sendTextMessage(context.Background(), target, text)
			return err
		},
		OnSendButtons: func(title, body, footer string, buttons []voiceagent.WhatsAppButton) error {
			target := peer
			if target.Server == types.HiddenUserServer && s.client != nil && s.client.Store != nil {
				if pn, err := s.client.Store.LIDs.GetPNForLID(context.Background(), target); err == nil && !pn.IsEmpty() {
					target = pn
				}
			}
			s.log.Info("AI agent sending WhatsApp buttons during outgoing call", "call_id", callID, "target", target.String(), "count", len(buttons))
			_, err := s.sendButtonsMessage(context.Background(), target, title, body, footer, buttons)
			return err
		},
	}

	agent, err := voiceagent.NewVoiceAgent(context.Background(), agentCfg, keys, callbacks, s.log)
	if err != nil {
		s.removeCall(callID)
		return "", fmt.Errorf("failed to create voice agent: %w", err)
	}

	if err := agent.Start(context.Background()); err != nil {
		agent.Close()
		s.removeCall(callID)
		return "", fmt.Errorf("failed to start voice agent: %w", err)
	}

	ac, _ := s.reg.get(callID)
	if ac != nil {
		ac.voiceAgent = agent
		ac.agentCfg = &agentCfg
		ac.webhookURL = webhookURL
		ac.mode = "ai"
		ac.peer = peer
	}

	ownerName := "IA: " + agentCfg.Provider
	if agentCfg.Model != "" {
		ownerName = "IA: " + agentCfg.Model
	}
	s.mgr.broker.setOwner(callID, ownerName)

	if webhookURL != "" && s.mgr.webhook != nil {
		s.mgr.webhook.Dispatch(webhookURL, "call.initiated", callID, s.id, map[string]any{
			"peer": peer.String(),
			"mode": "ai",
		})
	}

	if err := cm.StartCall(ctx, callID, peer, false); err != nil {
		agent.Close()
		s.removeCall(callID)
		return "", err
	}

	return callID, nil
}

func (s *Session) startOutgoing(ctx context.Context, peer types.JID, isVideo bool) (string, error) {
	callID := signaling.GenerateCallID()
	cm := s.createCall(callID)
	if err := cm.StartCall(ctx, callID, peer, isVideo); err != nil {
		s.removeCall(callID)
		return "", err
	}
	return callID, nil
}

func (s *Session) callForEvent(from types.JID, data *waBinary.Node) (*activeCall, bool) {
	callID := callIDFromNode(wrapCall(from, data))
	if callID == "" {
		return nil, false
	}
	return s.reg.get(callID)
}

func (s *Session) fetchDonnaTools() []any {
	client := &http.Client{Timeout: 2 * time.Second}
	resp, err := client.Get("http://127.0.0.1:8765/api/voice/tools")
	if err != nil {
		return nil
	}
	defer resp.Body.Close()
	var tools []any
	if err := json.NewDecoder(resp.Body).Decode(&tools); err == nil {
		return tools
	}
	return nil
}

func (s *Session) acceptIncomingWithAgent(ctx context.Context, callID string, agentCfg voiceagent.AgentConfig, webhookURL string) error {
	ac, ok := s.reg.get(callID)
	if !ok || ac.cm == nil {
		return fmt.Errorf("call not found: %s", callID)
	}

	peerJID := ac.peer
	if peerJID.IsEmpty() && ac.cm.CurrentCall() != nil {
		peerJID, _ = types.ParseJID(ac.cm.CurrentCall().PeerJid)
	}

	var keys voiceagent.APIKeys
	if s.mgr.settings != nil {
		keys.OpenRouterKey, _ = s.mgr.settings.Get(ctx, "openrouter_api_key")
		keys.OpenAIKey, _ = s.mgr.settings.Get(ctx, "openai_api_key")
		keys.GoogleKey, _ = s.mgr.settings.Get(ctx, "google_api_key")
		keys.GroqKey, _ = s.mgr.settings.Get(ctx, "groq_api_key")
	}
	if keys.OpenRouterKey == "" {
		keys.OpenRouterKey = os.Getenv("OPENROUTER_API_KEY")
	}
	if keys.OpenAIKey == "" {
		keys.OpenAIKey = os.Getenv("OPENAI_API_KEY")
	}
	if keys.GoogleKey == "" {
		keys.GoogleKey = os.Getenv("GEMINI_API_KEY")
		if keys.GoogleKey == "" {
			keys.GoogleKey = os.Getenv("GOOGLE_API_KEY")
		}
	}
	if keys.GroqKey == "" {
		keys.GroqKey = os.Getenv("GROQ_API_KEY")
	}

	callbacks := voiceagent.Callbacks{
		OnFeedPCM: func(pcm []float32) {
			ac.cm.FeedCapturedPCM(pcm)
		},
		OnTurn: func(turn voiceagent.Turn) {
			s.log.Info("voice agent turn", "call_id", callID, "speaker", turn.Speaker, "text", turn.Text)
			if webhookURL != "" && s.mgr.webhook != nil {
				s.mgr.webhook.Dispatch(webhookURL, "call.turn", callID, s.id, map[string]any{
					"speaker":   turn.Speaker,
					"text":      turn.Text,
					"timestamp": turn.Timestamp.UnixMilli(),
				})
			}
		},
		OnHangup: func(reason string) {
			go s.terminateCall(callID, core.EndCallReasonUserEnded)
		},
		OnSendMessage: func(text string) error {
			target := peerJID
			if target.Server == types.HiddenUserServer && s.client != nil && s.client.Store != nil {
				if pn, err := s.client.Store.LIDs.GetPNForLID(context.Background(), target); err == nil && !pn.IsEmpty() {
					target = pn
				}
			}
			s.log.Info("AI agent sending WhatsApp message during incoming call", "call_id", callID, "target", target.String(), "text", text)
			_, err := s.sendTextMessage(context.Background(), target, text)
			return err
		},
		OnSendButtons: func(title, body, footer string, buttons []voiceagent.WhatsAppButton) error {
			target := peerJID
			if target.Server == types.HiddenUserServer && s.client != nil && s.client.Store != nil {
				if pn, err := s.client.Store.LIDs.GetPNForLID(context.Background(), target); err == nil && !pn.IsEmpty() {
					target = pn
				}
			}
			s.log.Info("AI agent sending WhatsApp buttons during incoming call", "call_id", callID, "target", target.String(), "count", len(buttons))
			_, err := s.sendButtonsMessage(context.Background(), target, title, body, footer, buttons)
			return err
		},
	}

	agent, err := voiceagent.NewVoiceAgent(context.Background(), agentCfg, keys, callbacks, s.log)
	if err != nil {
		return fmt.Errorf("failed to create voice agent: %w", err)
	}

	if err := agent.Start(context.Background()); err != nil {
		agent.Close()
		return fmt.Errorf("failed to start voice agent: %w", err)
	}

	ac.voiceAgent = agent
	ac.agentCfg = &agentCfg
	ac.webhookURL = webhookURL
	ac.mode = "ai"

	ownerName := "IA: " + agentCfg.Provider
	if agentCfg.Model != "" {
		ownerName = "IA: " + agentCfg.Model
	}
	s.mgr.broker.setOwner(callID, ownerName)

	if err := ac.cm.AcceptCall(ctx, callID); err != nil {
		agent.Close()
		return fmt.Errorf("failed to accept call: %w", err)
	}

	return nil
}

func (s *Session) onIncomingOffer(ctx context.Context, evt *events.CallOffer) {
	node := wrapCall(evt.From, evt.Data)
	callID := callIDFromNode(node)
	if callID == "" {
		return
	}
	if max := s.mgr.maxCalls; max > 0 && s.reg.count() >= max {
		s.rejectOffer(ctx, node, evt.From)
		return
	}
	cm := s.createCall(callID)
	if ac, ok := s.reg.get(callID); ok {
		ac.peer = evt.From
	}
	cm.HandleCallOffer(ctx, node, evt.From)

	caller := evt.From.String()
	donnaNumber := os.Getenv("DONNA_AUTO_ANSWER_NUMBER")
	if donnaNumber != "" && strings.Contains(caller, donnaNumber) {
		go func() {
			time.Sleep(300 * time.Millisecond)
			tools := s.fetchDonnaTools()
			webhookTools := os.Getenv("DONNA_TOOLS_WEBHOOK_URL")
			if webhookTools == "" {
				webhookTools = "http://127.0.0.1:8765/api/voice/tools/execute"
			}
			webhookCall := os.Getenv("DONNA_CALL_WEBHOOK_URL")
			if webhookCall == "" {
				webhookCall = "http://127.0.0.1:8765/api/voice/webhook"
			}
			prompt := os.Getenv("DONNA_SYSTEM_PROMPT")
			if prompt == "" {
				prompt = "Você é uma assistente executiva pessoal de inteligência artificial de alto padrão. Atenda a ligação com elegância, execute as ferramentas necessárias e responda de forma concisa e direta."
			}
			greeting := os.Getenv("DONNA_FIRST_MESSAGE")
			if greeting == "" {
				greeting = "Olá! Como posso te ajudar agora?"
			}
			cfg := voiceagent.AgentConfig{
				Provider:        "gemini_live",
				Model:           "gemini-2.5-flash-native-audio-latest",
				Voice:           "Aoede",
				ToolsWebhookURL: webhookTools,
				Tools:           tools,
				SystemPrompt:    prompt,
				FirstMessage:    greeting,
			}
			if err := s.acceptIncomingWithAgent(context.Background(), callID, cfg, webhookCall); err != nil {
				s.log.Error("failed to auto-accept call with Donna voice agent", "err", err)
			}
		}()
	} else if s.mgr.agents != nil {
		agent, err := s.mgr.agents.FindAgentForSession(ctx, s.id)
		if err == nil && agent != nil && agent.AutoAnswer && agent.IsActive {
			go func() {
				delay := time.Duration(agent.AutoAnswerDelaySec) * time.Second
				if delay <= 0 {
					delay = 1 * time.Second
				}
				time.Sleep(delay)

				cfg := voiceagent.AgentConfig{
					Provider:              agent.Provider,
					Model:                 agent.Model,
					Voice:                 agent.Voice,
					SystemPrompt:          agent.SystemPrompt,
					FirstMessage:          agent.FirstMessage,
					EnableHangup:          agent.EnableHangup,
					HangupDelaySec:        agent.HangupDelaySec,
					EnableWhatsAppMessage: agent.EnableWhatsAppMessage,
					WhatsAppMessageRules:  agent.WhatsAppMessageRules,
				}
				if err := s.acceptIncomingWithAgent(context.Background(), callID, cfg, agent.CallWebhookURL); err != nil {
					s.log.Error("failed to auto-accept call with assigned AI agent", "agent_id", agent.ID, "agent_name", agent.Name, "err", err)
				}
			}()
		} else if s.mgr.settings != nil {
			autoAnswer, _ := s.mgr.settings.Get(ctx, "auto_answer_ai")
			aiSessID, _ := s.mgr.settings.Get(ctx, "ai_default_session_id")
			if autoAnswer == "true" && (aiSessID == "" || aiSessID == "all" || aiSessID == s.id) {
				go func() {
					delay := 1 * time.Second
					if dStr, err := s.mgr.settings.Get(context.Background(), "auto_answer_delay_sec"); err == nil && dStr != "" {
						if sec, err := strconv.Atoi(dStr); err == nil && sec > 0 {
							delay = time.Duration(sec) * time.Second
						}
					}
					time.Sleep(delay)

					provider, _ := s.mgr.settings.Get(context.Background(), "default_ai_provider")
					if provider == "" {
						provider = "openrouter"
					}
					model, _ := s.mgr.settings.Get(context.Background(), "default_ai_model")
					voice, _ := s.mgr.settings.Get(context.Background(), "default_ai_voice")
					prompt, _ := s.mgr.settings.Get(context.Background(), "default_ai_prompt")
					firstMsg, _ := s.mgr.settings.Get(context.Background(), "default_ai_first_message")
					webhookURL, _ := s.mgr.settings.Get(context.Background(), "call_webhook_url")

					cfg := voiceagent.AgentConfig{
						Provider:     provider,
						Model:        model,
						Voice:        voice,
						SystemPrompt: prompt,
						FirstMessage: firstMsg,
					}
					if err := s.acceptIncomingWithAgent(context.Background(), callID, cfg, webhookURL); err != nil {
						s.log.Error("failed to auto-accept call with AI agent", "err", err)
					}
				}()
			}
		}
	} else if s.mgr.settings != nil {
		autoAnswer, _ := s.mgr.settings.Get(ctx, "auto_answer_ai")
		aiSessID, _ := s.mgr.settings.Get(ctx, "ai_default_session_id")
		if autoAnswer == "true" && (aiSessID == "" || aiSessID == "all" || aiSessID == s.id) {
			go func() {
				delay := 1 * time.Second
				if dStr, err := s.mgr.settings.Get(context.Background(), "auto_answer_delay_sec"); err == nil && dStr != "" {
					if sec, err := strconv.Atoi(dStr); err == nil && sec > 0 {
						delay = time.Duration(sec) * time.Second
					}
				}
				time.Sleep(delay)

				provider, _ := s.mgr.settings.Get(context.Background(), "default_ai_provider")
				if provider == "" {
					provider = "openrouter"
				}
				model, _ := s.mgr.settings.Get(context.Background(), "default_ai_model")
				voice, _ := s.mgr.settings.Get(context.Background(), "default_ai_voice")
				prompt, _ := s.mgr.settings.Get(context.Background(), "default_ai_prompt")
				firstMsg, _ := s.mgr.settings.Get(context.Background(), "default_ai_first_message")
				webhookURL, _ := s.mgr.settings.Get(context.Background(), "call_webhook_url")

				cfg := voiceagent.AgentConfig{
					Provider:     provider,
					Model:        model,
					Voice:        voice,
					SystemPrompt: prompt,
					FirstMessage: firstMsg,
				}
				if err := s.acceptIncomingWithAgent(context.Background(), callID, cfg, webhookURL); err != nil {
					s.log.Error("failed to auto-accept call with AI agent", "err", err)
				}
			}()
		}
	}
}

func (s *Session) rejectOffer(ctx context.Context, node *waBinary.Node, from types.JID) {
	info := signaling.ExtractNodeInfo(node)
	if info == nil {
		return
	}
	creator := wanode.AttrString(info.InnerNode.Attrs, "call-creator")
	if creator == "" {
		creator = from.String()
	}
	reject := signaling.BuildRejectStanza(from, info.CallID, wanode.MustJID(creator))
	_ = wa.NewSocket(s.client).SendNode(ctx, reject)
	s.log.Info("inbound call rejected: session at capacity", "call_id", info.CallID)
}

func (s *Session) handleEvent(rawEvt any) {
	ctx := context.Background()
	switch evt := rawEvt.(type) {
	case *events.Connected:
		if id := s.client.Store.ID; id != nil {
			_ = s.mgr.store.setJID(s.mgr.appCtx, s.id, id.String())
			go s.fetchProfileDetails(ctx)
		}
		s.setAuth(AuthSnapshot{State: "open", Paired: true})
	case *events.LoggedOut:
		s.setAuth(AuthSnapshot{State: "logged_out", Paired: false})
	case *events.CallOffer:
		s.onIncomingOffer(ctx, evt)
	case *events.CallAccept:
		if ac, ok := s.callForEvent(evt.From, evt.Data); ok {
			ac.cm.HandleCallAccept(ctx, wrapCall(evt.From, evt.Data), evt.From)
		}
	case *events.CallTransport:
		if ac, ok := s.callForEvent(evt.From, evt.Data); ok {
			ac.cm.HandleCallTransport(ctx, wrapCall(evt.From, evt.Data), evt.From)
		}
	case *events.CallTerminate:
		if ac, ok := s.callForEvent(evt.From, evt.Data); ok {
			ac.cm.HandleCallTerminate(wrapCall(evt.From, evt.Data))
		}
	case *events.CallReject:
		if ac, ok := s.callForEvent(evt.From, evt.Data); ok {
			ac.cm.HandleCallTerminate(wrapCall(evt.From, evt.Data))
		}
	case *events.Message:
		s.handleIncomingMessage(ctx, evt)
	}
}

func (s *Session) connect(ctx context.Context) error {
	if s.client.Store.ID != nil {
		return s.client.Connect()
	}
	return s.startPairing(ctx)
}

func (s *Session) startPairing(ctx context.Context) error {
	qrChan, err := s.client.GetQRChannel(ctx)
	if err != nil {
		return err
	}
	if err := s.client.Connect(); err != nil {
		return err
	}
	go func() {
		for evt := range qrChan {
			switch evt.Event {
			case "code":
				s.log.Info("scan the QR code to pair this session")
				qrterminal.GenerateHalfBlock(evt.Code, qrterminal.L, os.Stdout)
				s.setAuth(AuthSnapshot{State: "qr", QR: evt.Code})
				s.mgr.broker.emitSessionQR(s.id, evt.Code)
			case "success":
				if id := s.client.Store.ID; id != nil {
					_ = s.mgr.store.setJID(s.mgr.appCtx, s.id, id.String())
				}
				s.setAuth(AuthSnapshot{State: "open", Paired: true})
			case "timeout":
				s.setAuth(AuthSnapshot{State: "logged_out", Paired: false})
			}
		}
	}()
	return nil
}

func (s *Session) setAuth(a AuthSnapshot) {
	s.mu.Lock()
	s.auth = a
	s.mu.Unlock()
	s.mgr.broker.emitAuthState(s.id, a)
	s.mgr.broker.emitSessionList(s.mgr.infos())
}

func (s *Session) fetchProfileDetails(ctx context.Context) {
	if s.client.Store.ID == nil {
		return
	}
	ownJID := s.client.Store.ID.ToNonAD()
	pushName := s.client.Store.PushName

	pictureURL := ""
	if pic, err := s.client.GetProfilePictureInfo(ctx, ownJID, &whatsmeow.GetProfilePictureParams{Preview: true}); err == nil && pic != nil {
		pictureURL = pic.URL
	}

	statusText := ""
	if info, err := s.client.GetUserInfo(ctx, []types.JID{ownJID}); err == nil && info != nil {
		if uInfo, ok := info[ownJID]; ok {
			statusText = strings.Trim(strings.TrimSpace(uInfo.Status), `"`)
		}
	}
	s.mu.Lock()
	s.pushName = pushName
	s.pictureURL = pictureURL
	s.statusText = statusText
	s.mu.Unlock()

	s.mgr.broker.emitSessionList(s.mgr.infos())
}

func generateQRBase64(code string) (string, error) {
	if strings.TrimSpace(code) == "" {
		return "", errors.New("empty qr code")
	}
	qrObj, err := qr.Encode(code, qr.M)
	if err != nil {
		return "", err
	}
	pngBytes := qrObj.PNG()
	return "data:image/png;base64," + base64.StdEncoding.EncodeToString(pngBytes), nil
}

func (s *Session) getQRCode(ctx context.Context, maxWait time.Duration) (string, string, error) {
	s.mu.Lock()
	qrCode := s.auth.QR
	isPaired := s.auth.Paired || (s.client != nil && s.client.Store != nil && s.client.Store.ID != nil)
	s.mu.Unlock()

	if isPaired {
		return "", "", errors.New("instance already connected")
	}

	if qrCode != "" {
		b64, err := generateQRBase64(qrCode)
		return qrCode, b64, err
	}

	// Trigger pairing if not already active
	if err := s.startPairing(s.mgr.appCtx); err != nil {
		s.log.Debug("startPairing in getQRCode", "err", err)
	}

	deadline := time.Now().Add(maxWait)
	for time.Now().Before(deadline) {
		select {
		case <-ctx.Done():
			return "", "", ctx.Err()
		case <-time.After(150 * time.Millisecond):
			s.mu.Lock()
			code := s.auth.QR
			paired := s.auth.Paired || (s.client != nil && s.client.Store != nil && s.client.Store.ID != nil)
			s.mu.Unlock()
			if paired {
				return "", "", errors.New("instance already connected")
			}
			if code != "" {
				b64, err := generateQRBase64(code)
				return code, b64, err
			}
		}
	}

	return "", "", errors.New("timeout waiting for QR code from WhatsApp")
}

func (s *Session) info() SessionInfo {
	s.mu.Lock()
	a := s.auth
	pushName := s.pushName
	pictureURL := s.pictureURL
	statusText := s.statusText
	s.mu.Unlock()
	jid := ""
	phone := ""
	if id := s.client.Store.ID; id != nil {
		jid = id.String()
		phone = id.User
	}
	return SessionInfo{
		ID: s.id, Name: s.name, Token: s.token, UserID: s.userID, JID: jid, Phone: phone,
		PushName: pushName, PictureURL: pictureURL, StatusText: statusText,
		State: a.State, Paired: a.Paired || jid != "", QR: a.QR,
	}
}

func (s *Session) setBridge(callID string, b *Bridge) {
	oldB, found := s.reg.setBridge(callID, b)
	if !found {
		b.Close()
		return
	}
	if oldB != nil {
		oldB.Close()
	}
}

func (s *Session) removeCall(callID string) {
	ac, ok := s.reg.remove(callID)
	if !ok {
		return
	}
	if ac.bridge != nil {
		ac.bridge.Close()
	}
}

func (s *Session) terminateCall(callID string, reason core.EndCallReason) {
	ac, ok := s.reg.get(callID)
	if !ok {
		return
	}
	_ = ac.cm.EndCall(context.Background(), reason)
}

func (s *Session) teardownAllCalls() {
	for _, ac := range s.reg.drain() {
		_ = ac.cm.EndCall(context.Background(), core.EndCallReasonUserEnded)
		if ac.bridge != nil {
			ac.bridge.Close()
		}
	}
}

func (s *Session) replaceClient(client *whatsmeow.Client) {
	s.teardownAllCalls()
	s.client.Disconnect()
	s.client = client
	client.AddEventHandler(s.handleEvent)
}

func (s *Session) shutdown() {
	s.teardownAllCalls()
	s.client.Disconnect()
}

func mapStatus(state core.CallState) CallStatus {
	switch state {
	case core.CallStateActive:
		return StatusConnected
	case core.CallStateConnecting:
		return StatusConnecting
	case core.CallStateEnded:
		return StatusEnded
	case core.CallStateInitiating:
		return StatusStarting
	default:
		return StatusRinging
	}
}

func (s *Session) sendTextMessage(ctx context.Context, peer types.JID, text string) (types.MessageID, error) {
	if s.client == nil || !s.client.IsConnected() {
		return "", fmt.Errorf("session WhatsApp is not connected")
	}

	msg := &waE2E.Message{
		Conversation: proto.String(text),
	}

	resp, err := s.client.SendMessage(ctx, peer, msg)
	if err != nil {
		return "", err
	}
	return resp.ID, nil
}

type WhatsAppButton = voiceagent.WhatsAppButton

func (s *Session) sendButtonsMessage(ctx context.Context, peer types.JID, title, body, footer string, buttons []WhatsAppButton) (types.MessageID, error) {
	if s.client == nil || !s.client.IsConnected() {
		return "", fmt.Errorf("session WhatsApp is not connected")
	}

	if len(buttons) == 0 {
		return "", fmt.Errorf("at least one button is required")
	}

	if len(buttons) > 10 {
		return "", fmt.Errorf("maximum of 10 buttons allowed")
	}

	var nativeButtons []*waE2E.InteractiveMessage_NativeFlowMessage_NativeFlowButton

	for i, b := range buttons {
		btnText := strings.TrimSpace(b.Text)
		if btnText == "" {
			return "", fmt.Errorf("button %d: text cannot be empty", i+1)
		}

		btnType := strings.ToLower(strings.TrimSpace(b.Type))
		var btnName string
		var paramsMap map[string]string

		switch btnType {
		case "reply", "quick_reply", "":
			btnName = "quick_reply"
			btnID := strings.TrimSpace(b.ID)
			if btnID == "" {
				btnID = fmt.Sprintf("btn_%d", i+1)
			}
			paramsMap = map[string]string{
				"display_text": btnText,
				"id":           btnID,
			}
		case "url", "cta_url", "link":
			btnName = "cta_url"
			targetURL := strings.TrimSpace(b.URL)
			if targetURL == "" {
				return "", fmt.Errorf("button %d (%s): 'url' cannot be empty", i+1, btnText)
			}
			if !strings.HasPrefix(targetURL, "http://") && !strings.HasPrefix(targetURL, "https://") {
				targetURL = "https://" + targetURL
			}
			paramsMap = map[string]string{
				"display_text": btnText,
				"url":          targetURL,
				"merchant_url": targetURL,
			}
		case "copy", "cta_copy", "pix":
			btnName = "cta_copy"
			btnID := strings.TrimSpace(b.ID)
			if btnID == "" {
				btnID = fmt.Sprintf("copy_%d", i+1)
			}
			copyCode := strings.TrimSpace(b.CopyCode)
			if copyCode == "" {
				copyCode = btnText
			}
			paramsMap = map[string]string{
				"display_text": btnText,
				"id":           btnID,
				"copy_code":    copyCode,
			}
		case "call", "cta_call", "phone":
			btnName = "cta_call"
			phone := strings.TrimSpace(b.Phone)
			if phone == "" {
				return "", fmt.Errorf("button %d (%s): 'phone' number cannot be empty", i+1, btnText)
			}
			paramsMap = map[string]string{
				"display_text": btnText,
				"phone_number": phone,
			}
		default:
			return "", fmt.Errorf("unsupported button type: %s", b.Type)
		}

		paramsJSON, err := json.Marshal(paramsMap)
		if err != nil {
			return "", fmt.Errorf("failed to encode button params: %w", err)
		}

		nativeButtons = append(nativeButtons, &waE2E.InteractiveMessage_NativeFlowMessage_NativeFlowButton{
			Name:             proto.String(btnName),
			ButtonParamsJSON: proto.String(string(paramsJSON)),
		})
	}

	interactiveMsg := &waE2E.InteractiveMessage{
		Body: &waE2E.InteractiveMessage_Body{
			Text: proto.String(body),
		},
		InteractiveMessage: &waE2E.InteractiveMessage_NativeFlowMessage_{
			NativeFlowMessage: &waE2E.InteractiveMessage_NativeFlowMessage{
				Buttons:           nativeButtons,
				MessageParamsJSON: proto.String(""),
				MessageVersion:    proto.Int32(1),
			},
		},
	}

	if title != "" {
		interactiveMsg.Header = &waE2E.InteractiveMessage_Header{
			Title:              proto.String(title),
			HasMediaAttachment: proto.Bool(false),
		}
	}

	if footer != "" {
		interactiveMsg.Footer = &waE2E.InteractiveMessage_Footer{
			Text: proto.String(footer),
		}
	}

	msg := &waE2E.Message{
		MessageContextInfo: &waE2E.MessageContextInfo{
			DeviceListMetadata:        &waE2E.DeviceListMetadata{},
			DeviceListMetadataVersion: proto.Int32(2),
		},
		InteractiveMessage: interactiveMsg,
	}

	additionalNodes := []waBinary.Node{
		{
			Tag: "biz",
			Content: []waBinary.Node{
				{
					Tag: "interactive",
					Attrs: waBinary.Attrs{
						"type": "native_flow",
						"v":    "1",
					},
					Content: []waBinary.Node{
						{
							Tag: "native_flow",
							Attrs: waBinary.Attrs{
								"name": "mixed",
								"v":    "9",
							},
						},
					},
				},
			},
		},
	}

	if peer.Server != types.GroupServer {
		additionalNodes = append(additionalNodes, waBinary.Node{
			Tag:   "bot",
			Attrs: waBinary.Attrs{"biz_bot": "1"},
		})
	}

	resp, err := s.client.SendMessage(ctx, peer, msg, whatsmeow.SendRequestExtra{
		AdditionalNodes: &additionalNodes,
	})
	if err != nil {
		return "", err
	}
	return resp.ID, nil
}

func (s *Session) sendAudioMessage(ctx context.Context, peer types.JID, audioBytes []byte, ptt bool) (types.MessageID, error) {
	if s.client == nil || !s.client.IsConnected() {
		return "", fmt.Errorf("session WhatsApp is not connected")
	}

	uploaded, err := s.client.Upload(ctx, audioBytes, whatsmeow.MediaAudio)
	if err != nil {
		return "", fmt.Errorf("failed to upload audio to WhatsApp: %w", err)
	}

	audioMsg := &waE2E.AudioMessage{
		URL:           &uploaded.URL,
		DirectPath:    &uploaded.DirectPath,
		MediaKey:      uploaded.MediaKey,
		FileEncSHA256: uploaded.FileEncSHA256,
		FileSHA256:    uploaded.FileSHA256,
		FileLength:    &uploaded.FileLength,
		Mimetype:      proto.String("audio/ogg; codecs=opus"),
		PTT:           proto.Bool(ptt),
	}

	resp, err := s.client.SendMessage(ctx, peer, &waE2E.Message{
		AudioMessage: audioMsg,
	})
	if err != nil {
		return "", err
	}
	return resp.ID, nil
}

func (s *Session) sendMediaMessage(ctx context.Context, peer types.JID, mediaBytes []byte, mimeType, fileName, caption string) (types.MessageID, error) {
	if s.client == nil || !s.client.IsConnected() {
		return "", fmt.Errorf("session WhatsApp is not connected")
	}

	isImage := strings.HasPrefix(mimeType, "image/")

	var mediaType whatsmeow.MediaType = whatsmeow.MediaDocument
	if isImage {
		mediaType = whatsmeow.MediaImage
	}

	uploaded, err := s.client.Upload(ctx, mediaBytes, mediaType)
	if err != nil {
		return "", fmt.Errorf("failed to upload media to WhatsApp: %w", err)
	}

	var waMsg *waE2E.Message
	if isImage {
		img := &waE2E.ImageMessage{
			URL:           &uploaded.URL,
			DirectPath:    &uploaded.DirectPath,
			MediaKey:      uploaded.MediaKey,
			FileEncSHA256: uploaded.FileEncSHA256,
			FileSHA256:    uploaded.FileSHA256,
			FileLength:    &uploaded.FileLength,
			Mimetype:      proto.String(mimeType),
		}
		if caption != "" {
			img.Caption = proto.String(caption)
		}
		waMsg = &waE2E.Message{ImageMessage: img}
	} else {
		doc := &waE2E.DocumentMessage{
			URL:           &uploaded.URL,
			DirectPath:    &uploaded.DirectPath,
			MediaKey:      uploaded.MediaKey,
			FileEncSHA256: uploaded.FileEncSHA256,
			FileSHA256:    uploaded.FileSHA256,
			FileLength:    &uploaded.FileLength,
			Mimetype:      proto.String(mimeType),
			FileName:      proto.String(fileName),
			Title:         proto.String(fileName),
		}
		if caption != "" {
			doc.Caption = proto.String(caption)
		}
		waMsg = &waE2E.Message{DocumentMessage: doc}
	}

	resp, err := s.client.SendMessage(ctx, peer, waMsg)
	if err != nil {
		return "", err
	}
	return resp.ID, nil
}

func (s *Session) handleIncomingMessage(ctx context.Context, evt *events.Message) {
	if evt.Info.IsFromMe {
		return
	}
	text := extractMessageText(evt.Message)
	msgType := getMessageType(evt.Message)

	s.log.Info("incoming whatsapp message",
		"session", s.id,
		"from", evt.Info.Sender.String(),
		"push_name", evt.Info.PushName,
		"type", msgType,
		"text", text,
	)

	var webhookURL string
	if s.mgr.settings != nil {
		webhookURL, _ = s.mgr.settings.Get(ctx, "message_webhook_url")
	}
	if webhookURL == "" {
		webhookURL = os.Getenv("MESSAGE_WEBHOOK_URL")
	}

	if webhookURL != "" && s.mgr.webhook != nil {
		payload := map[string]any{
			"messageId": evt.Info.ID,
			"chat":      evt.Info.Chat.String(),
			"sender":    evt.Info.Sender.String(),
			"phone":     evt.Info.Sender.User,
			"pushName":  evt.Info.PushName,
			"isGroup":   evt.Info.IsGroup,
			"timestamp": evt.Info.Timestamp.UnixMilli(),
			"type":      msgType,
			"text":      text,
		}
		if btnID := extractButtonID(evt.Message); btnID != "" {
			payload["buttonId"] = btnID
		}
		s.mgr.webhook.Dispatch(webhookURL, "message.received", evt.Info.ID, s.id, payload)
	}
}

func extractButtonID(msg *waE2E.Message) string {
	if msg == nil {
		return ""
	}
	if msg.InteractiveResponseMessage != nil {
		if native := msg.InteractiveResponseMessage.GetNativeFlowResponseMessage(); native != nil {
			if native.ParamsJSON != nil && *native.ParamsJSON != "" {
				var p struct {
					ID string `json:"id"`
				}
				if err := json.Unmarshal([]byte(*native.ParamsJSON), &p); err == nil && p.ID != "" {
					return p.ID
				}
			}
		}
	}
	if msg.ButtonsResponseMessage != nil {
		return msg.ButtonsResponseMessage.GetSelectedButtonID()
	}
	if msg.TemplateButtonReplyMessage != nil {
		return msg.TemplateButtonReplyMessage.GetSelectedID()
	}
	return ""
}

func extractMessageText(msg *waE2E.Message) string {
	if msg == nil {
		return ""
	}
	if msg.Conversation != nil {
		return *msg.Conversation
	}
	if msg.ExtendedTextMessage != nil && msg.ExtendedTextMessage.Text != nil {
		return *msg.ExtendedTextMessage.Text
	}
	if msg.InteractiveResponseMessage != nil {
		if native := msg.InteractiveResponseMessage.GetNativeFlowResponseMessage(); native != nil {
			if native.ParamsJSON != nil && *native.ParamsJSON != "" {
				var p struct {
					ID          string `json:"id"`
					Text        string `json:"text"`
					Title       string `json:"title"`
					DisplayText string `json:"display_text"`
				}
				if err := json.Unmarshal([]byte(*native.ParamsJSON), &p); err == nil {
					if p.DisplayText != "" {
						return p.DisplayText
					}
					if p.Title != "" {
						return p.Title
					}
					if p.Text != "" {
						return p.Text
					}
					if p.ID != "" {
						return p.ID
					}
				}
				return *native.ParamsJSON
			}
		}
		if msg.InteractiveResponseMessage.Body != nil && msg.InteractiveResponseMessage.Body.Text != nil {
			return *msg.InteractiveResponseMessage.Body.Text
		}
	}
	if msg.ButtonsResponseMessage != nil {
		if txt := msg.ButtonsResponseMessage.GetSelectedDisplayText(); txt != "" {
			return txt
		}
		if id := msg.ButtonsResponseMessage.GetSelectedButtonID(); id != "" {
			return id
		}
	}
	if msg.TemplateButtonReplyMessage != nil {
		if txt := msg.TemplateButtonReplyMessage.GetSelectedDisplayText(); txt != "" {
			return txt
		}
		if id := msg.TemplateButtonReplyMessage.GetSelectedID(); id != "" {
			return id
		}
	}
	if msg.ImageMessage != nil && msg.ImageMessage.Caption != nil {
		return *msg.ImageMessage.Caption
	}
	if msg.VideoMessage != nil && msg.VideoMessage.Caption != nil {
		return *msg.VideoMessage.Caption
	}
	if msg.DocumentMessage != nil && msg.DocumentMessage.Caption != nil {
		return *msg.DocumentMessage.Caption
	}
	return ""
}

func getMessageType(msg *waE2E.Message) string {
	if msg == nil {
		return "unknown"
	}
	if msg.InteractiveResponseMessage != nil || msg.ButtonsResponseMessage != nil || msg.TemplateButtonReplyMessage != nil {
		return "button_response"
	}
	if msg.Conversation != nil || msg.ExtendedTextMessage != nil {
		return "text"
	}
	if msg.AudioMessage != nil {
		if msg.AudioMessage.PTT != nil && *msg.AudioMessage.PTT {
			return "voice_note"
		}
		return "audio"
	}
	if msg.ImageMessage != nil {
		return "image"
	}
	if msg.VideoMessage != nil {
		return "video"
	}
	if msg.DocumentMessage != nil {
		return "document"
	}
	if msg.StickerMessage != nil {
		return "sticker"
	}
	if msg.LocationMessage != nil {
		return "location"
	}
	if msg.ContactMessage != nil {
		return "contact"
	}
	return "other"
}

func (s *Session) resolvePeerJID(ctx context.Context, phone string) types.JID {
	clean := phoneDigitsRegex.ReplaceAllString(phone, "")
	// If 10 or 11 digits without country code, auto-prefix Brazil DDI 55
	if (len(clean) == 10 || len(clean) == 11) && !strings.HasPrefix(clean, "55") {
		clean = "55" + clean
	}
	if s.client != nil && s.client.IsConnected() {
		res, err := s.client.IsOnWhatsApp(ctx, []string{"+" + clean})
		if err == nil && len(res) > 0 && res[0].IsIn {
			return res[0].JID
		}
		// If Brazil (DDI 55) and 13 digits (55 + 2 DDD + 9 digits), try without the 9th digit (12 digits)
		if strings.HasPrefix(clean, "55") && len(clean) == 13 && clean[4] == '9' {
			alt := clean[:4] + clean[5:]
			resAlt, errAlt := s.client.IsOnWhatsApp(ctx, []string{"+" + alt})
			if errAlt == nil && len(resAlt) > 0 && resAlt[0].IsIn {
				return resAlt[0].JID
			}
		}
		// If Brazil and 12 digits, try with the 9th digit (13 digits)
		if strings.HasPrefix(clean, "55") && len(clean) == 12 {
			alt := clean[:4] + "9" + clean[4:]
			resAlt, errAlt := s.client.IsOnWhatsApp(ctx, []string{"+" + alt})
			if errAlt == nil && len(resAlt) > 0 && resAlt[0].IsIn {
				return resAlt[0].JID
			}
		}
	}
	return types.NewJID(clean, types.DefaultUserServer)
}
