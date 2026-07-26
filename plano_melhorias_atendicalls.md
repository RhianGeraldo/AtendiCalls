# 🚀 Plano de Melhorias e Roadmap Técnico - AtendiCalls

Este documento detalha o planejamento arquitetural, as capacidades da biblioteca **Whatsmeow**, da pilha **WebRTC (Pion)** e o plano de implementação para as próximas fases do **AtendiCalls**.

---

## 1. Visão Geral da Arquitetura Atual (B2BUA VoIP)

O **AtendiCalls** funciona como um **B2BUA (Back-to-Back User Agent)**:
- **WhatsApp (Cliente Celular)** $\leftrightarrow$ **Whatsmeow / Pion WebRTC (Backend Go)** $\leftrightarrow$ **Softphone Browser (React)**.
- O servidor Go intermediador mantém a sessão de sinalização VoIP nativa do WhatsApp (usando stanzas `offer`, `preaccept`, `accept`, `transport`, `terminate`) e repassa o fluxo de áudio RTP/SRTP para o navegador via WebRTC.
- Esta arquitetura desacoplada possibilita que recursos avançados de telefonia corporativa (como transferência de chamadas, gravação e filas) sejam executados **diretamente no servidor**, sem depender de suporte nativo dessas funções no aplicativo do WhatsApp.

---

## 2. Funcionalidades Planejadas & Análise Técnica

### 🎯 2.1. Vínculo de Contas WhatsApp a Usuários (Roteamento Direto / Ringing Direcionado)

#### **Objetivo:**
Permitir associar uma ou mais contas de WhatsApp conectadas (Sessões) a usuários/agentes específicos do sistema. Quando uma ligação for recebida em um número X, ela deve tocar **apenas** no Softphone do usuário responsável (ou grupo de usuários atribuídos).

#### **Desenho Técnico & Implementação:**
1. **Modelo de Dados (SQLite):**
   - Adicionar a coluna `assigned_user_id TEXT` (ou tabela de relacionamento `session_users`) na tabela `sessions`.
2. **Controle de Transmissão no Broker (Go):**
   - Ao receber o evento `OnIncoming` do `whatsmeow`, o servidor consulta qual `assigned_user_id` está vinculado àquela sessão.
   - O `Broker` filtra a emissão do evento WebSocket (`type: "incoming"`) para enviar a notificação e disparar o toque do Softphone **apenas para as conexões ativas do usuário atribuído**.
   - Se `assigned_user_id` for nulo, mantém-se o comportamento global (*Ring All* / Tocar para todos os administradores).
3. **Interface do Painel:**
   - Na aba **Conexões / WhatsApp**, permitir que o admin selecione qual usuário é o dono/responsável por cada QR Code conectado.

---

### 📞 2.2. Transferência de Chamadas ao Vivo entre Agentes (Call Transfer)

#### **Objetivo:**
Permitir que o Agente A, durante uma chamada ativa com o cliente, transfira a ligação para o Agente B (com ou sem consulta prévia).

#### **Análise de Viabilidade via Whatsmeow & Pion WebRTC:**
- **Sinalização do WhatsApp:** O cliente WhatsApp **não percebe** a transferência. Para o celular do cliente, a sessão de chamada VoIP continua idêntica e ininterrupta com o servidor AtendiCalls.
- **Chaveamento de Mídia no Servidor:**
  1. O Agente A clica em "Transferir para [Agente B]".
  2. O servidor coloca a chamada em **Espera (Hold)** para o cliente (enviando áudio de retenção/música ou silêncio via servidor RTP).
  3. O servidor emite um evento WebSocket para o Agente B (`type: "incoming_transfer"`).
  4. Quando o Agente B aceita, o servidor reconecta o pipeline de áudio RTP do Pion do cliente WhatsApp para a PeerConnection do Agente B, e encerra a PeerConnection do Agente A.
  5. O Softphone do Agente A fecha e o do Agente B assume a chamada com zero desconexão para o cliente final.

---

### 📊 2.3. Relatórios e Analytics de Chamadas (Dashboards & Métricas)

#### **Objetivo:**
Disponibilizar relatórios completos sobre a operação de atendimento telefônico via WhatsApp.

#### **Métricas Mapeadas:**
- **Volume de Chamadas:** Total de ligações (Atendidas, Perdidas, Rejeitadas, Não Atendidas).
- **Tempo Médio de Atendimento (TMA / AHT):** Duração média das ligações ativas por agente.
- **Tempo Médio de Espera (TME):** Tempo entre o toque (`offeredAt`) e o atendimento (`connectedAt`).
- **Desempenho por Agente / Linha WhatsApp:** Ranking de atendimentos por usuário e por número conectado.
- **Horários de Pico:** Gráficos de distribuição de chamadas ao longo do dia e dias da semana.

#### **Armazenamento de Dados:**
- Expandir a tabela `calls` / `call_history` no SQLite:
  - `id`, `session_id`, `call_id`, `peer_jid`, `peer_name`, `peer_phone`, `direction` (`inbound`/`outbound`), `status` (`completed`, `missed`, `rejected`, `busy`), `user_id`, `started_at`, `connected_at`, `ended_at`, `duration_seconds`, `terminate_reason`.

---

### 🎙️ 2.4. Gravação e Transcrição de Ligações com IA

#### **Objetivo:**
Gravar o áudio das chamadas realizadas/recebidas e disponibilizar o player e transcrição no histórico de conversas.

#### **Análise de Viabilidade via Backend:**
- **Interceptação de Pacotes RTP:** Como o backend em Go (`callmanager` + Pion) recebe e processa todos os pacotes de áudio (decodificando codecs como MLOW / Opus), é possível salvar o fluxo PCM/WAV diretamente em disco ou bucket S3.
- **Transcrição Automática:** Ao finalizar a chamada, o arquivo `.wav` gerado pode ser enviado para APIs de transcrição (Whisper / Google Speech-to-Text / Gemini Flash) para gerar o resumo e texto do atendimento.

---

### 🚦 2.5. Filas de Atendimento & URA / DAC (Distribuidores Automáticos de Chamada)

#### **Objetivo:**
Gerenciar chamadas recebidas organizando em filas por departamento (ex: Suporte, Vendas) com regras de distribuição (Round-Robin, Menos Ocupado, Fila Única).

#### **Funcionamento:**
1. A chamada entra em uma fila. O cliente ouve mensagem/áudio de espera.
2. O servidor AtendiCalls distribui para o agente que está `Disponível` há mais tempo.
3. Se o agente não atender em X segundos, a chamada é repassada para o próximo agente da fila.

---

## 3. Matriz de Capacidades do Whatsmeow & Pion WebRTC

| Funcionalidade | Suporte no Whatsmeow / Backend | Como é feito |
| :--- | :--- | :--- |
| **Identificação de Chamadas** | ✅ Total | Stanzas `offer` trazem JID e LID; consulta de contatos/Pushes resolve Nome e Foto. |
| **Atendimento / Rejeição** | ✅ Total | Envio imediato das stanzas `preaccept`, `accept`, `reject`. |
| **Vínculo por Usuário** | ✅ Total | Controle lógico no `Broker` e WebSocket do servidor Go. |
| **Transferência de Chamada** | ✅ Total (via Server-side) | Re-roteamento de mídia no servidor (Pion WebRTC Track Swap). O WhatsApp não precisa saber. |
| **Gravação de Áudio** | ✅ Total | Dumper de áudio no pipeline de mídia do Pion/RTP no servidor Go. |
| **Música de Espera (Hold)** | ✅ Total | Envio de frames de áudio sintéticos (PCM/Opus) enquanto o cliente aguarda na fila/transferência. |
| **Histórico & Duração** | ✅ Total | Eventos de estado (`ringing`, `connected`, `ended`) com timestamp exato em milissegundos. |

---

## 4. Cronograma Sugerido de Execução (Roadmap)

### 📌 **Fase 1: Vínculo de Contas WhatsApp a Usuários**
- Adicionar campo `user_id` na gestão de sessões.
- Ajustar `Broker` para roteamento seletivo por WebSocket.
- UI para atribuição de responsável por número no painel.

### 📌 **Fase 2: Historização Expandida & Relatórios / Analytics**
- Persistência estruturada do histórico de chamadas no SQLite.
- Tela de **Relatórios / Dashboards** com filtros, exportação e gráficos.

### 📌 **Fase 3: Transferência de Chamadas entre Agentes**
- Botão "Colocar em Espera / Transferir" no Softphone.
- Evento de transferência no `Broker` + Troca de Track no Pion WebRTC.

### 📌 **Fase 4: Gravação de Chamadas & Player no Histórico**
- Gravação de áudio em formato `.wav` ou `.opus`.
- Player de áudio na listagem de chamadas e detalhes da conversa.

---

*Documento gerado e atualizado para o repositório **AtendiCalls**.*
