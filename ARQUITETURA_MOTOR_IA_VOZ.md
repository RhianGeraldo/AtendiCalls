# 🎙️ AtendiCalls Voice AI — Arquitetura do Motor Nativo de Voz e Agentes Autônomos

> **Documento de Arquitetura e Engenharia de Software**  
> **Autor:** Rhian Geraldo & Assessoria Executiva (Donna Paulsen)  
> **Data:** Novembro de 2026  
> **Status:** Aprovado para Implementação  

---

## 🏛️ 1. Visão Executiva do Produto

O **AtendiCalls** nasceu como um motor de discagem e atendimento VoIP para WhatsApp via protocolo nativo da Meta (`whatsmeow` + `MLow` + `SRTP` + `WebRTC`). Inicialmente projetado para atendentes humanos no navegador, a sua maior vantagem competitiva é se transformar em uma **Plataforma Completa de Agentes de Voz Autônomos para WhatsApp** (o equivalente nacional a um *Retell AI*, *Vapi* ou *Bland.ai* direto no WhatsApp).

Nesta arquitetura:
1. **O AtendiCalls assume o controle do motor de conversa de IA nativo.**
2. **Sistemas externos (como CRMs, ERPs, Automações ou Totens)** não precisam se preocupar com WebRTC, codecs ou buffers de áudio: eles apenas fornecem as **Instruções (Prompt)**, a **Voz** e os **Webhooks de Ferramentas (Tool Calling)**.
3. O AtendiCalls gerencia todo o ciclo de vida: atendimento automático (Inbound), discagem ativa de campanhas (Outbound), conversação fluida com baixa latência (<400ms), interrupção instantânea (Barge-in), execução de ferramentas externas via Webhook, gravação estéreo e transcrição com resumo de IA.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        ECOSSISTEMA EXTERNO                             │
│   (CRMs Externos · Plataformas de Atendimento · Campanhas de Vendas)   │
└───────────────────▲────────────────────────────────▲───────────────────┘
                    │ REST / Webhooks                │ Tool Call Responses
                    ▼                                ▼
┌────────────────────────────────────────────────────────────────────────┐
│                         ATENDICALLS CORE                               │
│                                                                        │
│  ┌───────────────────────┐             ┌────────────────────────────┐  │
│  │   WhatsApp VoIP       │             │   Native Voice AI Agent    │  │
│  │   (Go / whatsmeow)    │             │   (Gemini Live / Realtime) │  │
│  │                       │             │                            │  │
│  │  - STUN / Relay ICE   │  PCM 16kHz  │  - Aoede Voice Synthesis   │  │
│  │  - SRTP Cryptography  │◄───────────►│  - Native Barge-in         │  │
│  │  - Meta MLow Codec    │   Direct    │  - VAD 450ms Latency       │  │
│  │  - Stereo Recording   │             │  - Function Calling Router │  │
│  └───────────────────────┘             └─────────────┬──────────────┘  │
│                                                      │                 │
│                                                      ▼                 │
│                                           Webhooks de Ferramentas      │
│                                           (Calendar, CRM, Tasks...)    │
└────────────────────────────────────────────────────────────────────────┘
```

---

## ⚡ 2. Benefícios Estratégicos

1. **Latência Mínima Absoluta:** O áudio capturado pela rede VoIP do WhatsApp é entregue diretamente ao modelo de voz em tempo real (Gemini Multimodal Live API), eliminando passos intermediários de redes virtuais ou navegadores.
2. **Produto SaaS Multitenant:** Uma única instância do AtendiCalls pode gerenciar múltiplas sessões do WhatsApp (ex: Assessoria Rhian, Loja Linhares, Loja Colatina, P&D Erriesse), cada uma com seus próprios agentes de IA, vozes e horários de atendimento.
3. **Desacoplamento Inteligente:** Mudanças de negócio (ex: mudar o prompt de vendas, adicionar uma nova regra de cancelamento ou integrar um novo CRM) são feitas apenas via JSON/Webhook, sem reiniciar o servidor de telecomunicações.

---

## ⚙️ 3. Pipeline de Áudio e Comunicação Interna

### 3.1. Formato de Áudio Padronizado
- **Taxa de Amostragem:** 16.000 Hz (16 kHz).
- **Formato:** PCM Linear 16-bit com sinal (Signed 16-bit LE).
- **Canais:** Mono (1 canal).
- **Tamanho do Bloco de Frame:** 20ms = 320 amostras = 640 bytes (compatível com os pacotes do WhatsApp e com o Gemini Live).

### 3.2. Fluxo Bidirecional:
1. **Inbound (WhatsApp → IA):**
   - WhatsApp cliente envia pacotes RTP SRTP codificados em MLow.
   - AtendiCalls descriptografa (SRTP), decodifica para PCM 16kHz float32 e converte para PCM int16 LE.
   - Bloco PCM é transmitido em tempo real para a sessão ativa do Gemini Live.
2. **Outbound (IA → WhatsApp):**
   - Gemini Live sintetiza a fala a 24kHz.
   - O motor faz o resampling em tempo real para 16kHz com compensação de drift de relógio monotônico.
   - O áudio fatiado em frames de 20ms é codificado em MLow e transmitido pela sessão SRTP ao WhatsApp do cliente.

---

## 🗄️ 4. Extensões de Banco de Dados (`atendicalls.db`)

Para suportar agentes de IA embutidos, o banco SQLite do AtendiCalls recebe os seguintes campos e tabelas:

### 4.1. Configuração do Agente na Sessão (`sessions` / `ai_agent_configs`)
```sql
CREATE TABLE IF NOT EXISTS ai_agent_configs (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    enabled BOOLEAN DEFAULT 1,
    agent_name TEXT DEFAULT 'Atendente Virtual',
    model TEXT DEFAULT 'gemini-2.5-flash-native-audio-latest',
    voice_name TEXT DEFAULT 'Aoede', -- Aoede, Puck, Charon, Fenrir, Kore
    system_instruction TEXT NOT NULL,
    initial_greeting TEXT DEFAULT '',
    silence_duration_ms INTEGER DEFAULT 450,
    tools_webhook_url TEXT DEFAULT '',
    tools_schema_json TEXT DEFAULT '[]', -- Definição de ferramentas suportadas
    auto_answer_inbound BOOLEAN DEFAULT 1,
    inbound_delay_seconds REAL DEFAULT 1.5,
    max_duration_seconds INTEGER DEFAULT 600,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
);
```

### 4.2. Associação em Campanhas (`campaigns`)
Permite que campanhas automáticas de discagem utilizem o motor de IA:
```sql
ALTER TABLE campaigns ADD COLUMN use_ai_agent BOOLEAN DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN ai_agent_id TEXT DEFAULT '';
```

---

## 🌐 5. Endpoints REST da Nova API de IA

### 5.1. Configurar Agente de IA para uma Sessão
`PUT /api/sessions/{sid}/ai-agent`
```json
{
  "enabled": true,
  "agent_name": "Donna Paulsen",
  "voice_name": "Aoede",
  "system_instruction": "Você é Donna Paulsen, assessora de Rhian Geraldo...",
  "initial_greeting": "Donna Paulsen na linha. Olá, como posso te ajudar?",
  "silence_duration_ms": 450,
  "tools_webhook_url": "http://127.0.0.1:8765/api/donna/tools",
  "tools_schema_json": [
    {
      "name": "consultar_agenda",
      "description": "Consulta compromissos de Rhian Geraldo",
      "parameters": {
        "type": "object",
        "properties": {
          "dias": {"type": "integer"}
        }
      }
    }
  ],
  "auto_answer_inbound": true,
  "inbound_delay_seconds": 1.8
}
```

### 5.2. Disparar Ligação Outbound com Agente de IA
`POST /api/sessions/{sid}/calls/ai`
```json
{
  "phone": "5511999998888",
  "agent_id": "assistente-comercial",
  "custom_context": "Motivo da ligação: Alinhamento sobre fechamento do mês.",
  "override_greeting": "Olá! Sou assistente virtual da empresa. Preciso alinhar dois pontos rápidos com você."
}
```

### 5.3. Webhook de Execução de Ferramentas (Tool Calling)
Quando o modelo decide executar uma ação (ex: `consultar_agenda`), o AtendiCalls envia um `POST` para a `tools_webhook_url`:
```json
{
  "call_id": "0011F6261E4A069339F640FED3EFB5D1",
  "session_id": "04c7d9f8b9c80ac053114ba48f80f736",
  "phone": "5511999998888",
  "tool_name": "consultar_agenda",
  "arguments": {
    "dias": 2
  }
}
```
E recebe a resposta síncrona:
```json
{
  "result": "Hoje às 15:00: Alinhamento Estética & Laser. Amanhã às 09:00: P&D Belle Analytics."
}
```

---

## 📂 6. Estrutura de Arquivos Adicionada ao Repositório

```
AtendiCalls/
├── ARQUITETURA_MOTOR_IA_VOZ.md        # Esta especificação oficial
├── voice_agent/                       # Módulo autônomo do Motor de Voz
│   ├── README.md                      # Manual operacional de inicialização e testes
│   ├── requirements.txt               # Dependências leves
│   ├── .env.example                   # Chaves de API e portas
│   ├── agent_runner.py                # Daemon que conecta AtendiCalls ao Gemini Live
│   ├── engine.py                      # Núcleo da sessão Gemini Live (Aoede, VAD, Barge-in)
│   ├── webhook_client.py              # Despachante HTTP para ferramentas externas
│   └── profiles/                      # Perfis prontos de agentes
│       ├── donna_paulsen.json         # Perfil executivo de Donna Paulsen
│       └── vendas_estetica.json       # Perfil comercial para as 5 clínicas
```

---

## 🎯 7. Próximos Passos na Nova Sessão
1. Inicializar o `agent_runner.py` dentro de `voice_agent/`.
2. Conectar a sessão `04c7d9f8b9c80ac053114ba48f80f736` ao perfil `donna_paulsen.json`.
3. Validar a execução ponta a ponta sem qualquer dependência externa de scripts avulsos.
