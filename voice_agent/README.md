# 🎙️ AtendiCalls Voice Agent

Motor autônomo de agentes de voz para chamadas VoIP no WhatsApp integrado ao **AtendiCalls**.
Permite que o WhatsApp atenda ligações automaticamente ou realize discagens ativas com fala natural, interrupção instantânea (barge-in) e execução de ferramentas externas via Webhook.

---

## 📁 Estrutura do Módulo

```
voice_agent/
├── engine.py              # Núcleo de voz em tempo real (Gemini Multimodal Live API · Aoede)
├── agent_runner.py        # Daemon de monitoramento SSE, atendimento e discagem
├── webhook_client.py      # Despachante HTTP para ferramentas (Tool Calling)
├── profiles/              # Perfis de Agentes em formato JSON
│   ├── donna_paulsen.json # Perfil executivo da Donna Paulsen
│   └── comercial_estetica.json # Perfil de vendas da Estética & Laser
└── requirements.txt       # Dependências
```

---

## 🚀 Como Executar

### 1. Instalar dependências
```bash
pip install -r requirements.txt
```

### 2. Configurar Variáveis de Ambiente (`.env`)
```bash
cp .env.example .env
# Adicione a sua GEMINI_API_KEY no arquivo .env
```

### 3. Rodar como Daemon de Atendimento Automático (Inbound)
Para atender qualquer ligação recebida no WhatsApp da sessão com o perfil da Donna:
```bash
python agent_runner.py --listen --profile donna_paulsen
```

Para rodar com a consultora comercial da Estética & Laser:
```bash
python agent_runner.py --listen --profile comercial_estetica
```

### 4. Fazer o Agente Ligar Ativamente (Outbound)
```bash
python agent_runner.py --call 5511999998888 --profile donna_paulsen --motivo "Alinhamento das metas semanais"
```

---

## 🛠️ Perfis de Agentes (`profiles/*.json`)
Cada perfil define:
- `name`: Nome do agente.
- `voice_name`: Voz (`Aoede`, `Puck`, `Charon`, `Kore`, `Fenrir`).
- `silence_duration_ms`: Tempo de silêncio para detecção de fim de fala (padrão: 450ms).
- `system_instruction`: Prompt mestre da IA.
- `inbound_greeting`: Frase dita assim que atende.
- `outbound_greeting`: Frase dita assim que o cliente atende.
- `tools_webhook_url`: Endpoint HTTP que recebe os Tool Calls da IA e devolve o resultado em JSON.
- `tools_declarations`: Catálogo de ferramentas que o modelo tem permissão para acionar.
