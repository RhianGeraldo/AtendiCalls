package voiceagent

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/coder/websocket"
)

type GeminiLiveAgent struct {
	cfg       AgentConfig
	keys      APIKeys
	callbacks Callbacks
	log       *slog.Logger

	pacer *AudioPacer

	peerMu  sync.Mutex
	peerBuf []float32

	wsConn *websocket.Conn
	mu     sync.Mutex
	turns  []Turn

	ctx    context.Context
	cancel context.CancelFunc
}

func NewGeminiLiveAgent(ctx context.Context, cfg AgentConfig, keys APIKeys, cb Callbacks, log *slog.Logger) *GeminiLiveAgent {
	if log == nil {
		log = slog.Default()
	}
	agentCtx, cancel := context.WithCancel(ctx)

	a := &GeminiLiveAgent{
		cfg:       cfg,
		keys:      keys,
		callbacks: cb,
		log:       log.With("agent", "gemini_live"),
		ctx:       agentCtx,
		cancel:    cancel,
		turns:     make([]Turn, 0),
		peerBuf:   make([]float32, 0, 16000),
	}

	a.pacer = NewAudioPacer(func(pcm []float32) {
		if cb.OnFeedPCM != nil {
			cb.OnFeedPCM(pcm)
		}
	})

	return a
}

func normalizeGeminiVoice(v string) string {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "aoede", "shimmer", "coral", "ballad", "feminina":
		return "Aoede"
	case "kore", "clara":
		return "Kore"
	case "charon", "echo", "ash", "onyx", "masculina":
		return "Charon"
	case "fenrir", "fable", "grave":
		return "Fenrir"
	case "puck", "alloy", "verse", "sage", "neutra", "dinamica":
		return "Puck"
	default:
		for _, valid := range []string{"Aoede", "Charon", "Fenrir", "Kore", "Puck"} {
			if strings.EqualFold(valid, v) {
				return valid
			}
		}
		return "Aoede"
	}
}

func normalizeGeminiModel(m string) string {
	m = strings.TrimSpace(m)
	if m == "" || strings.Contains(m, "gemini-2.0-flash-exp") || strings.Contains(m, "gemini-2.0-flash-001") {
		return "models/gemini-2.5-flash-native-audio-latest"
	}
	if !strings.HasPrefix(m, "models/") {
		m = "models/" + m
	}
	return m
}

func getDefaultBuiltinTools() []any {
	return []any{
		map[string]any{
			"name":        "encerrar_chamada",
			"description": "Desliga e encerra a chamada telefônica imediatamente. Chame esta função sempre que a conversa estiver concluída, ou o usuário disser 'tchau', 'obrigado', 'pode desligar', 'até mais', ou quando o atendimento for finalizado.",
			"parameters": map[string]any{
				"type": "object",
				"properties": map[string]any{
					"motivo": map[string]any{
						"type":        "string",
						"description": "Frase de despedida ou motivo do encerramento da chamada telefônica.",
					},
				},
			},
		},
		map[string]any{
			"name":        "enviar_mensagem_whatsapp",
			"description": "Envia uma mensagem de texto instantânea pelo WhatsApp para a pessoa com quem você está conversando nesta chamada telefônica. Use sempre que você prometer enviar um resumo, catálogo, lembrete, link, código ou se combinarem de continuar o atendimento por mensagem.",
			"parameters": map[string]any{
				"type": "object",
				"properties": map[string]any{
					"mensagem": map[string]any{
						"type":        "string",
						"description": "O texto completo da mensagem a ser enviada no WhatsApp para o interlocutor.",
					},
				},
				"required": []string{"mensagem"},
			},
		},
		map[string]any{
			"name":        "enviar_botoes_whatsapp",
			"description": "Envia uma mensagem interativa com botões de ação pelo WhatsApp para o interlocutor (ex: resposta rápida como 'Confirmar'/'Remarcar', links para sites/pagamento, chave Pix para cópia imediata, ou botão de ligar). Use sempre que fizer sentido oferecer opções clicáveis ao usuário.",
			"parameters": map[string]any{
				"type": "object",
				"properties": map[string]any{
					"titulo": map[string]any{
						"type":        "string",
						"description": "Título opcional de cabeçalho da mensagem.",
					},
					"mensagem": map[string]any{
						"type":        "string",
						"description": "Texto principal do corpo da mensagem.",
					},
					"rodape": map[string]any{
						"type":        "string",
						"description": "Texto opcional curto de rodapé.",
					},
					"botoes": map[string]any{
						"type":        "array",
						"description": "Lista de botões a exibir ao interlocutor.",
						"items": map[string]any{
							"type": "object",
							"properties": map[string]any{
								"tipo": map[string]any{
									"type":        "string",
									"description": "Tipo do botão: 'reply' (resposta rápida), 'url' (abrir link), 'copy' (copiar código/pix), 'call' (ligar).",
								},
								"texto": map[string]any{
									"type":        "string",
									"description": "Texto visível exibido no botão.",
								},
								"id": map[string]any{
									"type":        "string",
									"description": "ID único da opção para botões do tipo 'reply' ou 'copy'.",
								},
								"url": map[string]any{
									"type":        "string",
									"description": "URL de destino se o tipo for 'url'.",
								},
								"copiar": map[string]any{
									"type":        "string",
									"description": "Código ou chave Pix a copiar se o tipo for 'copy'.",
								},
								"telefone": map[string]any{
									"type":        "string",
									"description": "Número de telefone se o tipo for 'call'.",
								},
							},
							"required": []string{"tipo", "texto"},
						},
					},
				},
				"required": []string{"mensagem", "botoes"},
			},
		},
	}
}

func (a *GeminiLiveAgent) Start(ctx context.Context) error {
	apiKey := a.keys.GoogleKey
	if apiKey == "" {
		return fmt.Errorf("google Gemini API key required for gemini_live provider")
	}

	model := normalizeGeminiModel(a.cfg.Model)
	voice := normalizeGeminiVoice(a.cfg.Voice)

	url := fmt.Sprintf("wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=%s", apiKey)

	conn, _, err := websocket.Dial(a.ctx, url, nil)
	if err != nil {
		return fmt.Errorf("failed to dial gemini live websocket: %w", err)
	}
	conn.SetReadLimit(16 * 1024 * 1024)
	a.wsConn = conn

	instructions := a.interpolate(a.cfg.SystemPrompt)
	if instructions == "" {
		instructions = "Você é um assistente virtual gentil conversando por telefone. Fale sempre em português do Brasil de forma concisa e natural."
	}

	var toolDirectives []string
	if a.cfg.EnableHangup {
		toolDirectives = append(toolDirectives,
			"- FERRAMENTA 'encerrar_chamada': Quando o interlocutor se despedir (dizer 'tchau', 'obrigado', 'era só isso', 'pode desligar', 'até mais') ou a conversa for concluída, despeça-se brevemente e chame IMEDIATAMENTE a ferramenta 'encerrar_chamada' para desligar a ligação.",
		)
	}
	if a.cfg.EnableWhatsAppMessage {
		directive := "- FERRAMENTAS DE WHATSAPP: Você pode enviar mensagens pelo WhatsApp para a pessoa com quem está falando.\n" +
			"  * 'enviar_mensagem_whatsapp': Para enviar mensagens de texto comuns, resumos ou lembretes.\n" +
			"  * 'enviar_botoes_whatsapp': Para enviar mensagens interativas com botões clicáveis (ex: resposta rápida como 'Confirmar'/'Remarcar', links para páginas web/pagamento, chave Pix para cópia imediata, ou botão de ligar). Use sempre que fizer sentido oferecer opções práticas de clique ao interlocutor.\n" +
			"Se você disser ou combinar que vai enviar algo por WhatsApp, acione a ferramenta correspondente e avise o cliente na ligação que já enviou."
		if a.cfg.WhatsAppMessageRules != "" {
			directive += fmt.Sprintf(" Regras específicas para mensagens no WhatsApp: %s", a.cfg.WhatsAppMessageRules)
		}
		toolDirectives = append(toolDirectives, directive)
	}

	if len(toolDirectives) > 0 {
		instructions += "\n\nINSTRUÇÕES ESSENCIAIS DE FERRAMENTAS:\n" + strings.Join(toolDirectives, "\n")
	}

	setupMsg := map[string]any{
		"setup": map[string]any{
			"model": model,
			"generationConfig": map[string]any{
				"responseModalities": []string{"AUDIO"},
				"speechConfig": map[string]any{
					"voiceConfig": map[string]any{
						"prebuiltVoiceConfig": map[string]any{
							"voiceName": voice,
						},
					},
				},
				"thinkingConfig": map[string]any{
					"thinkingBudget": 0,
				},
			},
			"realtimeInputConfig": map[string]any{
				"automaticActivityDetection": map[string]any{
					"silenceDurationMs": 250,
					"prefixPaddingMs":   50,
				},
			},
			"systemInstruction": map[string]any{
				"parts": []map[string]any{
					{"text": instructions},
				},
			},
		},
	}

	var allTools []any
	if a.cfg.EnableHangup {
		allTools = append(allTools, map[string]any{
			"name":        "encerrar_chamada",
			"description": "Desliga e encerra a chamada telefônica imediatamente. Chame esta função sempre que a conversa estiver concluída, ou o usuário disser 'tchau', 'obrigado', 'pode desligar', 'até mais', ou quando o atendimento for finalizado.",
			"parameters": map[string]any{
				"type": "object",
				"properties": map[string]any{
					"motivo": map[string]any{
						"type":        "string",
						"description": "Frase de despedida ou motivo do encerramento da chamada telefônica.",
					},
				},
			},
		})
	}
	if a.cfg.EnableWhatsAppMessage {
		allTools = append(allTools,
			map[string]any{
				"name":        "enviar_mensagem_whatsapp",
				"description": "Envia uma mensagem de texto instantânea pelo WhatsApp para a pessoa com quem você está conversando nesta chamada telefônica. Use sempre que você prometer enviar um resumo, catálogo, lembrete, link, código ou se combinarem de continuar o atendimento por mensagem.",
				"parameters": map[string]any{
					"type": "object",
					"properties": map[string]any{
						"mensagem": map[string]any{
							"type":        "string",
							"description": "O texto completo da mensagem a ser enviada no WhatsApp para o interlocutor.",
						},
					},
					"required": []string{"mensagem"},
				},
			},
			map[string]any{
				"name":        "enviar_botoes_whatsapp",
				"description": "Envia uma mensagem interativa com botões de ação pelo WhatsApp para o interlocutor (ex: botões de resposta rápida, links para pagamento ou site, chave Pix para cópia imediata, ou botão de ligar). Use sempre que fizer sentido oferecer opções clicáveis ao interlocutor.",
				"parameters": map[string]any{
					"type": "object",
					"properties": map[string]any{
						"titulo": map[string]any{
							"type":        "string",
							"description": "Título opcional de cabeçalho da mensagem.",
						},
						"mensagem": map[string]any{
							"type":        "string",
							"description": "Texto principal do corpo da mensagem.",
						},
						"rodape": map[string]any{
							"type":        "string",
							"description": "Texto opcional curto de rodapé.",
						},
						"botoes": map[string]any{
							"type":        "array",
							"description": "Lista de botões a exibir ao interlocutor.",
							"items": map[string]any{
								"type": "object",
								"properties": map[string]any{
									"tipo": map[string]any{
										"type":        "string",
										"description": "Tipo do botão: 'reply' (resposta rápida), 'url' (abrir link), 'copy' (copiar código/pix), 'call' (ligar).",
									},
									"texto": map[string]any{
										"type":        "string",
										"description": "Texto visível exibido no botão.",
									},
									"id": map[string]any{
										"type":        "string",
										"description": "ID único da opção para botões do tipo 'reply' ou 'copy'.",
									},
									"url": map[string]any{
										"type":        "string",
										"description": "URL de destino se o tipo for 'url'.",
									},
									"copiar": map[string]any{
										"type":        "string",
										"description": "Código ou chave Pix a copiar se o tipo for 'copy'.",
									},
									"telefone": map[string]any{
										"type":        "string",
										"description": "Número de telefone se o tipo for 'call'.",
									},
								},
								"required": []string{"tipo", "texto"},
							},
						},
					},
					"required": []string{"mensagem", "botoes"},
				},
			},
		)
	}

	if len(a.cfg.Tools) > 0 {
		for _, customTool := range a.cfg.Tools {
			if m, ok := customTool.(map[string]any); ok {
				name, _ := m["name"].(string)
				if name == "encerrar_chamada" || name == "enviar_mensagem_whatsapp" || name == "enviar_botoes_whatsapp" {
					continue
				}
			}
			allTools = append(allTools, customTool)
		}
	}
	if len(allTools) > 0 {
		setupMsg["setup"].(map[string]any)["tools"] = []map[string]any{
			{"functionDeclarations": allTools},
		}
	}

	if err := a.sendJSON(setupMsg); err != nil {
		_ = conn.Close(websocket.StatusInternalError, "setup failed")
		return err
	}

	a.log.Info("gemini live connected and setup sent", "model", model, "voice", voice)

	go a.readLoop()
	go a.peerAudioLoop()
	return nil
}

func (a *GeminiLiveAgent) OnConnected() {
	if a.cfg.FirstMessage != "" {
		first := a.interpolate(a.cfg.FirstMessage)
		a.log.Info("gemini live OnConnected triggered", "firstMessage", first)
		time.Sleep(300 * time.Millisecond)
		_ = a.Speak(a.ctx, first)
	}
}

func (a *GeminiLiveAgent) FeedPeerAudio(pcm16k []float32) {
	if a.wsConn == nil || len(pcm16k) == 0 {
		return
	}
	a.peerMu.Lock()
	defer a.peerMu.Unlock()
	// Limit peer buffer to 500ms (8000 samples) to prevent accumulation lag
	if len(a.peerBuf) > 8000 {
		a.peerBuf = a.peerBuf[len(a.peerBuf)-8000:]
	}
	a.peerBuf = append(a.peerBuf, pcm16k...)
}

func (a *GeminiLiveAgent) peerAudioLoop() {
	ticker := time.NewTicker(40 * time.Millisecond)
	defer ticker.Stop()

	chunkSize := 640 // 40ms @ 16kHz
	silentChunk := make([]float32, chunkSize)

	for {
		select {
		case <-a.ctx.Done():
			return
		case <-ticker.C:
			if a.wsConn == nil {
				continue
			}

			var toSend []float32
			a.peerMu.Lock()
			if len(a.peerBuf) >= chunkSize {
				toSend = make([]float32, chunkSize)
				copy(toSend, a.peerBuf[:chunkSize])
				a.peerBuf = a.peerBuf[chunkSize:]
			} else if len(a.peerBuf) > 0 {
				toSend = make([]float32, chunkSize)
				copy(toSend, a.peerBuf)
				a.peerBuf = a.peerBuf[:0]
			} else {
				// No peer audio currently received (e.g. WhatsApp DTX silence period).
				// Send steady silence frames so Gemini Live VAD stays in exact sync with wall-clock time!
				toSend = silentChunk
			}
			a.peerMu.Unlock()

			rawBytes := PCMFloat32ToInt16LE(toSend)
			b64Audio := base64.StdEncoding.EncodeToString(rawBytes)

			msg := map[string]any{
				"realtimeInput": map[string]any{
					"mediaChunks": []map[string]any{
						{
							"mimeType": "audio/pcm;rate=16000",
							"data":     b64Audio,
						},
					},
				},
			}
			_ = a.sendJSON(msg)
		}
	}
}

func (a *GeminiLiveAgent) Speak(ctx context.Context, text string) error {
	msg := map[string]any{
		"clientContent": map[string]any{
			"turns": []map[string]any{
				{
					"role": "user",
					"parts": []map[string]any{
						{"text": "Por favor, diga aos ouvintes exatamente a seguinte frase com entonação amigável: " + text},
					},
				},
			},
			"turnComplete": true,
		},
	}
	return a.sendJSON(msg)
}

func (a *GeminiLiveAgent) Interrupt() {
	a.pacer.Clear()
}

func (a *GeminiLiveAgent) Close() {
	a.cancel()
	if a.pacer != nil {
		a.pacer.Close()
	}
	if a.wsConn != nil {
		_ = a.wsConn.Close(websocket.StatusNormalClosure, "call ended")
	}
}

func (a *GeminiLiveAgent) GetTranscript() []Turn {
	a.mu.Lock()
	defer a.mu.Unlock()
	res := make([]Turn, len(a.turns))
	copy(res, a.turns)
	return res
}

func (a *GeminiLiveAgent) readLoop() {
	for {
		select {
		case <-a.ctx.Done():
			return
		default:
		}

		_, msgBytes, err := a.wsConn.Read(a.ctx)
		if err != nil {
			a.log.Info("gemini live ws read loop finished", "err", err, "ctxErr", a.ctx.Err())
			return
		}

		var event struct {
			ToolCall *struct {
				FunctionCalls []struct {
					ID   string         `json:"id"`
					Name string         `json:"name"`
					Args map[string]any `json:"args"`
				} `json:"functionCalls"`
			} `json:"toolCall"`
			ServerContent struct {
				Interrupted bool `json:"interrupted"`
				ModelTurn   struct {
					Parts []struct {
						Text       string `json:"text"`
						InlineData *struct {
							MimeType string `json:"mimeType"`
							Data     string `json:"data"`
						} `json:"inlineData"`
					} `json:"parts"`
				} `json:"modelTurn"`
			} `json:"serverContent"`
		}

		if err := json.Unmarshal(msgBytes, &event); err != nil {
			continue
		}

		if event.ToolCall != nil && len(event.ToolCall.FunctionCalls) > 0 {
			for _, fc := range event.ToolCall.FunctionCalls {
				a.log.Info("gemini live tool call received", "id", fc.ID, "name", fc.Name, "args", fc.Args)
				if fc.Name == "encerrar_chamada" {
					a.log.Info("gemini live requested call termination via tool", "motivo", fc.Args["motivo"])
					toolResp := map[string]any{
						"toolResponse": map[string]any{
							"functionResponses": []map[string]any{
								{
									"id": fc.ID,
									"response": map[string]any{
										"output": map[string]any{"result": "Chamada telefônica sendo encerrada."},
									},
								},
							},
						},
					}
					_ = a.sendJSON(toolResp)
					delayMs := int(a.cfg.HangupDelaySec * 1000)
					if delayMs <= 0 {
						delayMs = 1500
					}
					if a.callbacks.OnHangup != nil {
						go func() {
							time.Sleep(time.Duration(delayMs) * time.Millisecond)
							a.callbacks.OnHangup("agent_ended")
						}()
					}
					continue
				}

				if fc.Name == "enviar_mensagem_whatsapp" || fc.Name == "enviar_mensagem" {
					msgText := ""
					if m, ok := fc.Args["mensagem"].(string); ok {
						msgText = m
					} else if m, ok := fc.Args["texto"].(string); ok {
						msgText = m
					} else if m, ok := fc.Args["text"].(string); ok {
						msgText = m
					}

					resStr := "Mensagem enviada com sucesso no WhatsApp do interlocutor."
					if a.callbacks.OnSendMessage != nil && msgText != "" {
						if err := a.callbacks.OnSendMessage(msgText); err != nil {
							a.log.Error("gemini live failed to send whatsapp message", "err", err)
							resStr = fmt.Sprintf("Erro ao enviar mensagem pelo WhatsApp: %v", err)
						} else {
							a.log.Info("gemini live successfully sent whatsapp message", "len", len(msgText))
						}
					} else if msgText == "" {
						resStr = "Nenhum texto de mensagem foi fornecido."
					}

					toolResp := map[string]any{
						"toolResponse": map[string]any{
							"functionResponses": []map[string]any{
								{
									"id": fc.ID,
									"response": map[string]any{
										"output": map[string]any{"result": resStr},
									},
								},
							},
						},
					}
					if err := a.sendJSON(toolResp); err != nil {
						a.log.Warn("gemini live tool response send error", "err", err)
					}
					continue
				}

				if fc.Name == "enviar_botoes_whatsapp" || fc.Name == "enviar_botoes" {
					title := ""
					if t, ok := fc.Args["titulo"].(string); ok {
						title = t
					} else if t, ok := fc.Args["title"].(string); ok {
						title = t
					}

					body := ""
					if m, ok := fc.Args["mensagem"].(string); ok {
						body = m
					} else if m, ok := fc.Args["texto"].(string); ok {
						body = m
					} else if m, ok := fc.Args["text"].(string); ok {
						body = m
					}

					footer := ""
					if f, ok := fc.Args["rodape"].(string); ok {
						footer = f
					} else if f, ok := fc.Args["footer"].(string); ok {
						footer = f
					}

					var buttons []WhatsAppButton
					if rawButtons, ok := fc.Args["botoes"].([]any); ok {
						for _, rb := range rawButtons {
							if bm, ok := rb.(map[string]any); ok {
								btn := WhatsAppButton{}
								if t, ok := bm["tipo"].(string); ok {
									btn.Type = t
								} else if t, ok := bm["type"].(string); ok {
									btn.Type = t
								}
								if tx, ok := bm["texto"].(string); ok {
									btn.Text = tx
								} else if tx, ok := bm["text"].(string); ok {
									btn.Text = tx
								}
								if id, ok := bm["id"].(string); ok {
									btn.ID = id
								}
								if u, ok := bm["url"].(string); ok {
									btn.URL = u
								}
								if c, ok := bm["copiar"].(string); ok {
									btn.CopyCode = c
								} else if c, ok := bm["copyCode"].(string); ok {
									btn.CopyCode = c
								}
								if p, ok := bm["telefone"].(string); ok {
									btn.Phone = p
								} else if p, ok := bm["phone"].(string); ok {
									btn.Phone = p
								}
								if btn.Text != "" {
									buttons = append(buttons, btn)
								}
							}
						}
					}

					resStr := fmt.Sprintf("Mensagem interativa com %d botões enviada com sucesso no WhatsApp.", len(buttons))
					if a.callbacks.OnSendButtons != nil && len(buttons) > 0 {
						if err := a.callbacks.OnSendButtons(title, body, footer, buttons); err != nil {
							a.log.Error("gemini live failed to send whatsapp buttons", "err", err)
							resStr = fmt.Sprintf("Erro ao enviar botões pelo WhatsApp: %v", err)
						} else {
							a.log.Info("gemini live successfully sent whatsapp buttons", "count", len(buttons))
						}
					} else if len(buttons) == 0 {
						resStr = "Nenhum botão válido foi fornecido."
					}

					toolResp := map[string]any{
						"toolResponse": map[string]any{
							"functionResponses": []map[string]any{
								{
									"id": fc.ID,
									"response": map[string]any{
										"output": map[string]any{"result": resStr},
									},
								},
							},
						},
					}
					if err := a.sendJSON(toolResp); err != nil {
						a.log.Warn("gemini live tool response send error", "err", err)
					}
					continue
				}

				webhookURL := a.cfg.ToolsWebhookURL
				if webhookURL == "" {
					webhookURL = a.cfg.WebhookURL
				}
				resStr := a.executeTool(webhookURL, fc.Name, fc.Args)
				toolResp := map[string]any{
					"toolResponse": map[string]any{
						"functionResponses": []map[string]any{
							{
								"id": fc.ID,
								"response": map[string]any{
									"output": map[string]any{"result": resStr},
								},
							},
						},
					},
				}
				if err := a.sendJSON(toolResp); err != nil {
					a.log.Warn("gemini live tool response send error", "err", err)
				}
			}
		}

		if event.ServerContent.Interrupted {
			a.log.Debug("gemini server detected interruption (barge-in)")
			a.pacer.Clear()
		}

		for _, part := range event.ServerContent.ModelTurn.Parts {
			if part.Text != "" {
				turn := Turn{
					Speaker:   "agent",
					Text:      part.Text,
					Timestamp: time.Now(),
				}
				a.mu.Lock()
				a.turns = append(a.turns, turn)
				a.mu.Unlock()
				if a.callbacks.OnTurn != nil {
					a.callbacks.OnTurn(turn)
				}
			}

			if part.InlineData != nil && part.InlineData.Data != "" {
				audioBytes, err := base64.StdEncoding.DecodeString(part.InlineData.Data)
				if err == nil && len(audioBytes) > 0 {
					a.log.Info("gemini live audio received from model", "bytes", len(audioBytes))
					rate := 24000
					if strings.Contains(part.InlineData.MimeType, "16000") {
						rate = 16000
					}
					f32 := PCMInt16LEToFloat32(audioBytes)
					if rate != 16000 {
						f32 = ResampleLinear(f32, rate, 16000)
					}
					a.pacer.Enqueue(f32)
				}
			}
		}
	}
}

func (a *GeminiLiveAgent) sendJSON(v any) error {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.wsConn == nil {
		return fmt.Errorf("gemini ws not connected")
	}
	b, err := json.Marshal(v)
	if err != nil {
		return err
	}
	return a.wsConn.Write(a.ctx, websocket.MessageText, b)
}

func (a *GeminiLiveAgent) interpolate(text string) string {
	res := text
	for k, v := range a.cfg.Variables {
		res = strings.ReplaceAll(res, "{{"+k+"}}", v)
		res = strings.ReplaceAll(res, "{"+k+"}", v)
	}
	return res
}

func (a *GeminiLiveAgent) executeTool(webhookURL, toolName string, args map[string]any) string {
	if webhookURL == "" {
		return "Ferramenta indisponível (sem webhook configurado)"
	}
	payload, _ := json.Marshal(map[string]any{
		"tool": toolName,
		"args": args,
	})
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, "POST", webhookURL, bytes.NewReader(payload))
	if err != nil {
		return fmt.Sprintf("Erro ao preparar requisição: %v", err)
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		a.log.Warn("gemini live tool execution http error", "tool", toolName, "err", err)
		return fmt.Sprintf("Erro ao executar ferramenta via webhook: %v", err)
	}
	defer resp.Body.Close()
	var res struct {
		Result string `json:"result"`
		Error  string `json:"error"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&res); err != nil {
		return fmt.Sprintf("Erro ao decodificar resposta da ferramenta: %v", err)
	}
	if res.Error != "" {
		return res.Error
	}
	a.log.Info("gemini live tool execution success", "tool", toolName, "resultLen", len(res.Result))
	return res.Result
}
