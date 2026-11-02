# 📞 AtendiCalls - API de Voz com IA e Mensagens WhatsApp para Integrações Externas

Esta API permite que sistemas externos (CRMs, automações no n8n, Typebot, ERPs, backends Python/Node/PHP) controlem o WhatsApp tanto para **Ligações Telefônicas com IA** quanto para **Envio e Recebimento de Mensagens (Texto, Áudio Gravado PTT, Mídias e Webhooks)**.

---

## 🔐 Autenticação (Token da Instância ou Token Master)

O motor do AtendiCalls suporta **dois modos de autenticação**:

1. **Token da Instância (Recomendado para integrações por linha):**
   Cada linha/instância criada possui seu próprio token individual (`token`). Ao enviar o token da instância nos cabeçalhos, o AtendiCalls **já identifica automaticamente a linha de saída**, dispensando o envio de `sessionId` no corpo do JSON!
2. **Token Global / Master (`system_api_key`):**
   Configurado no painel do AtendiCalls, tem permissão para gerenciar e disparar mensagens/ligações em qualquer uma das instâncias.

### Cabeçalhos de Autenticação Suportados:
Envie qualquer um dos cabeçalhos abaixo com o seu token:
```http
X-API-Key: SEU_TOKEN_DA_INSTANCIA
```
*ou*
```http
apikey: SEU_TOKEN_DA_INSTANCIA
```
*ou*
```http
Instance-Token: SEU_TOKEN_DA_INSTANCIA
```
*ou*
```http
Authorization: Bearer SEU_TOKEN_DA_INSTANCIA
```

---

## 🤖 Guia Prático: Como Integrar sua Plataforma ou CRM com o AtendiCalls

O **seu sistema externo ou CRM** atua como a **Plataforma Mestre** (onde ficam as personas dos agentes, variáveis de leads, funis e regras de negócio), enquanto o **AtendiCalls** na sua VPS atua como o **Motor Headless de Telefonia e WhatsApp** (gerencia os sockets UDP RTP de voz de baixa latência, áudio e conexões do WhatsApp).

```
┌─────────────────────────────────┐
│     SUA PLATAFORMA / CRM        │  (Cérebro: Agentes, CRM, Leads, Campanhas)
└──────────────┬──────────────────┘
               │ 1. Disparo de Chamada com IA e Prompt (POST /api/v1/voice/calls)
               │ 2. Retorno com Transcrição Completa no Webhook (call.ended)
┌──────────────▼──────────────────┐
│     MOTOR ATENDICALLS (VPS)     │  (Músculo: WhatsApp VoIP, UDP RTP, STT/TTS, PTT)
└─────────────────────────────────┘
```

### 1. As 3 Informações que você cadastra no seu sistema:
1. **URL da API do AtendiCalls:** `http://IP_DA_SUA_VPS:8080` *(ou `https://calls.seudominio.com`)*
2. **Token da Instância (Linha do WhatsApp):** Copiado diretamente na tela de instâncias do AtendiCalls.
3. **Header HTTP:** `X-API-Key: TOKEN_DA_INSTANCIA`

---

### 2. Fluxo 1: Onboarding do WhatsApp na sua Plataforma (Exibir QR Code)
O cliente não precisa abrir o AtendiCalls para ler o QR Code. O backend da sua aplicação chama:
```bash
curl -X GET http://IP_DA_VPS:8080/api/v1/instance/connect \
  -H "X-API-Key: TOKEN_DA_INSTANCIA"
```
O AtendiCalls retorna:
```json
{
  "status": "scan_qr_code",
  "qrcode": {
    "code": "2@bK3l0Z...",
    "base64": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA..."
  }
}
```
A sua aplicação renderiza a imagem no painel dela usando `<img src={data.qrcode.base64} />`. O cliente lê o código e a linha está conectada!

---

### 3. Fluxo 2: Disparo de Ligação de Voz com IA pelo seu Sistema
Quando a sua plataforma decide ligar para um cliente, ela dispara:
```bash
curl -X POST http://IP_DA_VPS:8080/api/v1/voice/calls \
  -H "X-API-Key: TOKEN_DA_INSTANCIA" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "5511999998888",
    "webhookUrl": "https://seu-sistema.com/api/webhooks/calls",
    "agent": {
      "provider": "openrouter",
      "model": "google/gemini-2.0-flash-001",
      "voice": "alloy",
      "systemPrompt": "Você é a assistente virtual da empresa. Confirme o horário do cliente {{nome}} marcado para {{horario}}.",
      "firstMessage": "Olá {{nome}}, aqui é a assistente virtual da empresa, tudo bem?",
      "variables": {
        "nome": "Carlos Silva",
        "horario": "14:30"
      }
    }
  }'
```
* **Retorno:** `{"callId": "3EB042E9...", "status": "initiated"}`.
* O AtendiCalls liga via VoIP WhatsApp para o cliente instantaneamente.

---

### 4. Fluxo 3: Entrega da Transcrição Completa no seu Sistema
Assim que o telefonema termina, o AtendiCalls envia um `POST` para o `webhookUrl` da sua plataforma com toda a conversa:
```json
{
  "event": "call.ended",
  "callId": "3EB042E9...",
  "reason": "completed",
  "peer": "5511999998888",
  "durationSec": 62,
  "transcript": "[00:02] Atendente: Olá Carlos Silva, aqui é a assistente virtual, tudo bem?\\n[00:06] Cliente: Tudo bem! Sim, confirmo minha consulta.\\n[00:09] Atendente: Excelente! Te aguardamos amanhã às 14:30.",
  "timestamp": 1730430062000
}
```
A sua aplicação salva a transcrição no histórico do cliente no CRM e pode gerar resumos automaticamente.

---

### 5. Fluxo 4: Controle e Gravação de Áudio
* **Desligar Chamada com Segurança:** `POST /api/v1/voice/calls/{id}/hangup` *(não apaga dados, salva gravação e transcrição)*
* **Baixar Gravação da Ligação (.wav):** `GET /api/v1/voice/calls/{id}/audio`
* **Interromper Fala da IA:** `POST /api/v1/voice/calls/{id}/interrupt`

---

---

## 💬 1. API de Mensagens WhatsApp

### A. Enviar Mensagem de Texto
* **Rota:** `POST /api/v1/messages/send-text`
* **Exemplo de Requisição:**
```bash
curl -X POST http://localhost:8080/api/v1/messages/send-text \
  -H "Authorization: Bearer SEU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "5511999999999",
    "text": "Olá Carlos! Confirmando sua consulta amanhã às 14:30."
  }'
```
* **Resposta de Sucesso:**
```json
{
  "status": "sent",
  "messageId": "3EB042E927A1...",
  "sessionId": "04c7d9f8b9c8...",
  "to": "5511999999999",
  "timestamp": 1730430000000
}
```

---

### B. Enviar Áudio Gravado (Voice Note / PTT)
Envia o áudio como nota de voz gravada no WhatsApp (waveform com microfone verde/azul).

**Opção 1: Gerar áudio automaticamente a partir de texto (via OpenAI TTS):**
```bash
curl -X POST http://localhost:8080/api/v1/messages/send-audio \
  -H "Authorization: Bearer SEU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "5511999999999",
    "text": "Olá Carlos! Aqui é a Sofia da clínica. Estou te mandando este áudio para confirmar seu agendamento de amanhã.",
    "voice": "alloy",
    "ptt": true
  }'
```

**Opção 2: Enviar áudio existente via Base64 ou URL remota:**
```json
{
  "to": "5511999999999",
  "audioUrl": "https://meu-servidor.com/audio.ogg",
  "ptt": true
}
```

---

### C. Enviar Mídias (Imagens, Documentos, PDFs)
* **Rota:** `POST /api/v1/messages/send-media`
```bash
curl -X POST http://localhost:8080/api/v1/messages/send-media \
  -H "Authorization: Bearer SEU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "5511999998888",
    "mediaUrl": "https://meu-site.com/comprovante.pdf",
    "fileName": "Comprovante.pdf",
    "caption": "Segue o seu comprovante em anexo."
  }'
```

---

### D. Enviar Mensagem Interativa com Botões (Native Flow Buttons)
Envia botões nativos modernos do WhatsApp (Quick Reply, Link CTA URL, Copiar Pix ou Ligar):

* **Rota:** `POST /api/v1/messages/send-buttons`
* **Headers:** `Authorization: Bearer <API_KEY>` (se configurada) e `Content-Type: application/json`
* **Exemplo de Requisição:**

```bash
curl -X POST http://localhost:8080/api/v1/messages/send-buttons \
  -H "Authorization: Bearer SEU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "04c7d9f8b9c80ac053114ba48f80f736",
    "to": "5511999998888",
    "title": "Confirmação de Consulta",
    "text": "Olá Carlos! Gostaria de confirmar o seu horário amanhã às 14h30?",
    "footer": "AtendiCalls • Assistente Virtual",
    "buttons": [
      {
        "type": "reply",
        "text": "✅ Sim, confirmado!",
        "id": "btn_confirmar"
      },
      {
        "type": "reply",
        "text": "📅 Remarcar horário",
        "id": "btn_remarcar"
      },
      {
        "type": "url",
        "text": "🌐 Ver Localização",
        "url": "https://maps.google.com"
      },
      {
        "type": "copy",
        "text": "💳 Chave Pix",
        "copyCode": "contato@empresa.com.br"
      }
    ]
  }'
```

**Tipos de botões suportados:**
- `"reply"` ou `"quick_reply"`: Botão de resposta rápida com texto e `id`.
- `"url"` ou `"cta_url"`: Abre diretamente um link no navegador (`text` e `url`).
- `"copy"` ou `"cta_copy"`: Copia chave Pix ou código com 1 toque (`text` e `copyCode`).
- `"call"` ou `"cta_call"`: Dispara ligação para o telefone informado (`text` e `phone`).

---

### E. Criação de Instâncias e Geração do QR Code (Motor Headless)

Como o AtendiCalls opera como um motor headless, o seu sistema externo pode criar instâncias, gerar o token da linha e obter o QR Code (com imagem Base64 PNG pronta para renderizar no seu CRM):

#### 1. Criar Nova Instância (com ou sem token personalizado)
* **Rotas:** `POST /api/v1/instance/create` ou `POST /api/v1/sessions`
* **Headers:** `Authorization: Bearer <SEU_TOKEN>` (ou `X-API-Key: <SEU_TOKEN>`)
* **Exemplo de Requisição:**
```bash
curl -X POST http://localhost:8080/api/v1/instance/create \
  -H "Authorization: Bearer SEU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Unidade Centro - Linha 1",
    "token": "token_opcional_personalizado"
  }'
```
* **Exemplo de Resposta:**
```json
{
  "status": "created",
  "instance": {
    "id": "c1f7a08b6d43e21a8f9024c08b2...",
    "name": "Unidade Centro - Linha 1",
    "token": "token_opcional_personalizado",
    "state": "connecting",
    "paired": false
  },
  "qrcode": {
    "code": "2@bK3l0Z...",
    "base64": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA..."
  }
}
```
*(Se o WhatsApp disponibilizar o QR nos primeiros 2.5s, ele já vem incluído no objeto `qrcode` com o Base64 pronto para `<img src="..." />`).*

---

#### 2. Obter / Atualizar QR Code da Instância (Connect)
* **Rotas:** 
  * `GET /api/v1/instance/connect` (autenticando com o token da própria instância)
  * `GET /api/v1/instance/connect/{id}` ou `GET /api/v1/sessions/{id}/qr`
* **Headers:** `X-API-Key: TOKEN_DA_INSTANCIA` ou `Authorization: Bearer TOKEN_DA_INSTANCIA`
* **Exemplo de Requisição:**
```bash
curl -X GET http://localhost:8080/api/v1/instance/connect \
  -H "X-API-Key: TOKEN_DA_INSTANCIA"
```
* **Resposta quando aguardando leitura do QR Code:**
```json
{
  "status": "scan_qr_code",
  "instance": {
    "id": "c1f7a08b6d43...",
    "name": "Unidade Centro - Linha 1",
    "token": "TOKEN_DA_INSTANCIA"
  },
  "qrcode": {
    "code": "2@bK3l0Z...",
    "base64": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA..."
  }
}
```
* **Resposta se a instância já estiver conectada:**
```json
{
  "status": "connected",
  "message": "Instância já está conectada.",
  "instance": {
    "id": "c1f7a08b...",
    "name": "Unidade Centro - Linha 1",
    "phone": "5511999998888",
    "state": "open",
    "paired": true
  }
}
```

---

#### 3. Conexão Alternativa por Código de 8 Dígitos (Pair Phone)
Permite conectar o WhatsApp digitando um código de 8 dígitos no celular (sem precisar escanear a câmera):
* **Rotas:** `POST /api/v1/instance/pair-phone` ou `POST /api/v1/sessions/{id}/pair-phone`
* **Exemplo de Requisição:**
```bash
curl -X POST http://localhost:8080/api/v1/sessions/c1f7a08b.../pair-phone \
  -H "X-API-Key: TOKEN_DA_INSTANCIA" \
  -H "Content-Type: application/json" \
  -d '{"phone": "5511999998888"}'
```
* **Resposta:**
```json
{
  "status": "pairing_code_generated",
  "phone": "5511999998888",
  "pairingCode": "ABCD-1234"
}
```

---

#### 4. Listar Instâncias e Status
* **Rota:** `GET /api/v1/sessions`
* **Retorno:** Lista todas as instâncias, seus nomes, IDs, tokens, telefones vinculados e status de conexão.

---

#### 5. Desconectar e Excluir
* **Desconectar / Logout:** `POST /api/v1/sessions/{id}/logout` ou `POST /api/v1/instance/logout`
* **Excluir Linha:** `DELETE /api/v1/sessions/{id}` ou `DELETE /api/v1/instance/delete/{id}`

---

### F. Webhook de Mensagens Recebidas (Inbound)
Configure o campo **Webhook para Mensagens Recebidas** no painel do AtendiCalls (ex: URL do seu n8n, Typebot ou CRM). Sempre que um cliente enviar uma mensagem para o WhatsApp, o AtendiCalls disparará um `POST`:

```json
{
  "event": "message.received",
  "callId": "3EB034E...",
  "sessionId": "04c7d9f8b9c80ac053114ba48f80f736",
  "timestamp": 1730430015000,
  "data": {
    "messageId": "3EB034E...",
    "chat": "5511999998888@s.whatsapp.net",
    "sender": "5511999998888@s.whatsapp.net",
    "phone": "5511999998888",
    "pushName": "Carlos Silva",
    "isGroup": false,
    "timestamp": 1730430014000,
    "type": "button_response",
    "text": "Sim, confirmado!",
    "buttonId": "btn_confirmar"
  }
}
```

#### 🔒 Assinatura de Segurança dos Webhooks (HMAC SHA-256)
Quando a chave `system_api_key` estiver configurada no AtendiCalls, todas as requisições de webhook enviadas para o seu sistema incluirão os headers:
- `X-AtendiCalls-Signature-256: sha256=<hash_hex>`
- `X-Hub-Signature-256: sha256=<hash_hex>`

Você pode validar a autenticidade calculando `HMAC-SHA256(raw_body, system_api_key)`.

---

### G. Políticas de Rate Limiting
Para proteger o servidor contra sobrecargas acidentais de loops em automações externas, as rotas `/api/v1/...` aplicam:
- **Limite:** 120 requisições por minuto por chave de API ou IP (com burst de até 30 requisições imediatas).
- **Headers retornados em todas as chamadas:**
  - `X-RateLimit-Limit: 120`
  - `X-RateLimit-Remaining: <saldo>`
- **Em caso de excesso (HTTP 429 Too Many Requests):**
  - Header: `Retry-After: 60`

---

## 📞 2. API de Ligações Telefônicas com IA

### A. Iniciar Ligação com IA (Outbound)

* **Rota:** `POST /api/v1/voice/calls`
* **Exemplo de Requisição (com OpenRouter):**

```bash
curl -X POST http://localhost:8080/api/v1/voice/calls \
  -H "Authorization: Bearer SEU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "04c7d9f8b9c80ac053114ba48f80f736",
    "to": "5511999999999",
    "webhookUrl": "https://meu-crm.com/api/webhooks/call-events",
    "agent": {
      "provider": "openrouter",
      "model": "google/gemini-2.0-flash-001",
      "voice": "alloy",
      "systemPrompt": "Você é a Sofia da Clínica X. Seu objetivo é confirmar a consulta do paciente {{nome}} agendada para amanhã às {{horario}}.",
      "firstMessage": "Olá, {{nome}}! Aqui é a Sofia da Clínica X, tudo bem? Estou ligando para confirmar sua consulta de amanhã.",
      "variables": {
        "nome": "Carlos Silva",
        "horario": "14:30"
      },
      "temperature": 0.7
    }
  }'
```

* **Provedores Suportados:**
  1. `openrouter`: Streaming LLM com modelos como Claude 3.5, Llama 3.3, DeepSeek, Gemini 2.0 Flash + Groq Whisper STT + OpenAI TTS.
  2. `openai_realtime`: Áudio bidirecional nativo com `gpt-4o-realtime-preview`.
  3. `gemini_live`: Multimodal Live nativo com `gemini-2.0-flash-exp`.

---

### B. Controle da Chamada e Download da Gravação

* **Consultar Chamada e Transcrição em Tempo Real:** `GET /api/v1/voice/calls/{id}`
* **Baixar / Reproduzir Áudio Gravado da Chamada (.wav):** `GET /api/v1/voice/calls/{id}/audio`
* **Forçar a IA a Falar um Texto:** `POST /api/v1/voice/calls/{id}/speak`
* **Interromper a IA Imediatamente:** `POST /api/v1/voice/calls/{id}/interrupt`
* **Transferir Chamada para Atendente Humano:** `POST /api/v1/voice/calls/{id}/transfer`
* **Desligar / Encerrar Chamada:** `POST /api/v1/voice/calls/{id}/hangup` *(ou `DELETE /api/v1/voice/calls/{id}`)*
  > **Nota de Segurança:** Esta ação apenas desliga o telefone e finaliza a sessão VoIP ativa. **Nenhum dado é apagado** — o histórico, as métricas, a transcrição completa e o arquivo `.wav` gravado continuam salvos e disponíveis no banco de dados.

---

## 🎯 3. Casos de Uso Híbridos (Voz + Mensagem)

1. **Follow-up pós-ligação:** Quando o webhook receber `call.ended`, seu n8n/CRM dispara `POST /api/v1/messages/send-text` com o resumo e link da consulta.
2. **Fallback se a ligação não atender:** Se a ligação terminar sem resposta (`no_answer`), envie automaticamente uma mensagem ou áudio PTT perguntando se o cliente prefere conversar por texto.
3. **Envio de link durante a chamada:** Durante a ligação, envie catálogo, chave Pix ou link de confirmação diretamente para o WhatsApp do cliente.
