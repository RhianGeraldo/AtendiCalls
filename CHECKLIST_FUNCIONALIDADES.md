# 📋 Roadmap & Checklist de Funcionalidades - AtendiCalls

Documento consolidado de visão e evolução técnica da plataforma **AtendiCalls**, integrando o **Motor de Chamadas Telefônicas VoIP**, a **Inteligência Artificial de Conversação em Tempo Real** e as **Mensagens Nativas do WhatsApp via Whatsmeow**.

---

## 🚀 CHECKLIST 1: Funcionalidades da Plataforma (Sinergia VoIP + IA de Voz + WhatsApp)

Recursos que combinam o poder das ligações telefônicas ao vivo com automações de mensagens e agentes de IA multimodais.

### 📞 1. Automações Pós-Chamada e Inteligência
- [ ] **Resumo Automático Pós-Chamada no WhatsApp**
  - **Descrição**: Assim que qualquer ligação termina (atendida pela IA ou por atendente humano), a gravação de áudio é transcrita com Groq Whisper, a IA gera um resumo executivo dos tópicos conversados, protocolo e próximos passos, e dispara automaticamente uma mensagem no WhatsApp do cliente.
  - **Impacto**: Aumenta a retenção e formaliza combinados comerciais imediatamente.

- [ ] **Análise de Sentimento & Sales Coach Pós-Chamada**
  - **Descrição**: Análise automática do tom da conversa, objeções levantadas pelo cliente, interesse de compra e atribuição de etiquetas/tags (ex: *Quente*, *Interesse em Planos*, *Reclamação*) para o CRM.

### 🎯 2. Campanhas Híbridas de Conversão (Omnichannel)
- [ ] **Campanha Inteligente com Fallback em WhatsApp**
  - **Descrição**: O discador automático roda a lista de contatos.
    - Se o cliente **atender**: a IA conduz a ligação e pode disparar a proposta no WhatsApp durante a conversa.
    - Se der **ocupado, não atendeu ou caixa postal**: o sistema dispara automaticamente uma mensagem personalizada de follow-up: *"Oi [Nome], tentei te ligar agora há pouco sobre a sua solicitação. Quando puder me dê um alô por aqui ou me retorne!"*.
  - **Impacto**: Triplica a taxa de contato útil em campanhas ativas de vendas e cobrança.

- [ ] **Click-to-Call Reverso ("Me Ligue Agora")**
  - **Descrição**: O cliente clica em um botão no site ou envia *"Pode me ligar?"* no WhatsApp. O AtendiCalls inicia na hora uma ligação VoIP via WhatsApp para o cliente com a IA ou operador já conectado.

### 🤖 3. Agente de IA Unificado (Voz + Texto)
- [ ] **Mesmo Agente Respondendo por Texto e por Voz**
  - **Descrição**: O mesmo perfil de assistente cadastrado (ex: *Sara - Vendas*, com o mesmo tom, modelo e instruções) pode tanto atender ligações quanto responder mensagens de texto recebidas no chat do WhatsApp.

- [ ] **Memória de Conversa Cruzada (Cross-Channel Memory)**
  - **Descrição**: Se o cliente trocou mensagens ontem pelo WhatsApp e ligou hoje por voz, a IA na chamada telefônica consulta o histórico recente e já sabe o contexto completo da conversa, sem fazer o cliente se repetir.

### 🔄 4. Transbordo e Roteamento
- [ ] **Transbordo da IA para Atendente Humano em Chamada**
  - **Descrição**: Quando o cliente disser na ligação *"Quero falar com uma pessoa"*, a IA aciona a ferramenta de transbordo, toca uma música de espera e encaminha o áudio para o navegador do atendente humano logado no AtendiCalls.

---

## 💬 CHECKLIST 2: Funcionalidades Nativas do WhatsApp (Whatsmeow Engine)

Recursos avançados de mensagens e interatividade nativos do WhatsApp para enriquecer a comunicação.

### 🔘 1. Mensagens Interativas & Engajamento
- [x] **Botões Interativos (Native Flow Buttons)** *(Implementado!)*
  - **Quick Reply**: Botões rápidos de escolha direta (ex: `[Quero Agendar]`, `[Falar com Atendente]`, `[Ver Planos]`).
  - **CTA URL (Link Externo)**: Botão com link que abre o navegador com 1 clique (ex: `[Acessar Catálogo]`, `[Pagar Fatura]`).
  - **CTA Copy (Pix Copia-e-Cola)**: Botão que copia a chave Pix ou código de barras com 1 toque para a memória do celular.
  - **CTA Call**: Botão que dispara discagem para outro número de suporte.
  - **Canais de Disparo**:
    - API HTTP: `POST /api/v1/messages/send-buttons`
    - IA de Voz em Chamada: Ferramenta nativa `enviar_botoes_whatsapp`
    - Painel Web: Teste rápido direto no gerenciador de Agentes de IA (`AIAgentPage`)

- [ ] **Menu em Lista (List Messages)**
  - **Descrição**: Botão que abre uma gaveta pop-up no WhatsApp com até 10 opções organizadas por categorias/seções (ex: *Vendas, Suporte, Financeiro*).

- [ ] **Enquetes Nativas (Polls)**
  - **Descrição**: Criação de enquetes interativas com votação direta na conversa (ex: *"Qual o melhor período para te ligarmos?"*). O sistema recebe os votos em tempo real via Webhook.

- [ ] **Reações com Emojis (Reactions)**
  - **Descrição**: Reagir com emojis (👍, ❤️, ✅, 👏) a mensagens específicas enviadas pelo cliente.

### ⚡ 2. Presença e Humanização
- [ ] **Simulação de Digitação ("Digitando..." / "Gravando áudio...")**
  - **Descrição**: Emissão do status nativo `types.ChatPresenceComposing` ou `types.ChatPresenceMediaAudio` por um tempo proporcional ao texto (ex: 2 a 4s) antes do envio da mensagem. Protege contra bloqueios e humaniza o bot.

- [ ] **Confirmação de Leitura (Blue Ticks / Marcar como Lido)**
  - **Descrição**: Marcar as mensagens recebidas como lidas automaticamente quando processadas pelo sistema ou pela IA.

### 🎙️ 3. Mídias Ricas & Compartilhamento
- [x] **Envio de Mensagens de Texto** *(Implementado!)*
- [x] **Áudio Gravado na Hora (PTT / Microfone Verde)** *(Implementado!)*
  - Áudio sintetizado por TTS (OpenAI) ou arquivo enviado como nota de voz nativa com forma de onda.
- [x] **Envio de Imagens e Fotos com Legenda** *(Implementado!)*
- [x] **Envio de Documentos e PDFs** *(Implementado!)*
- [ ] **Localização no Mapa (Location Messages)**
  - Enviar coordenadas do Google Maps com nome e endereço da empresa.
- [ ] **Cartão de Contato (vCard)**
  - Enviar contato do vendedor ou especialista para o cliente salvar na agenda com 1 toque.
- [ ] **Figurinhas / Stickers (`image/webp`)**
  - Envio de figurinhas personalizadas estáticas ou animadas.

### 📝 4. Contexto & Mensagens
- [ ] **Resposta Citada (Quoted Reply)**
  - Citar a mensagem exata do cliente ao responder para manter o contexto.
- [ ] **Mensagens Temporárias (Disappearing Messages)**
  - Configurar mensagens que somem após determinado período para assuntos confidenciais.

---

## 🎯 Sugestão de Fases de Entrega (Roadmap)

| Fase | Foco | Itens |
| :---: | :--- | :--- |
| **Fase 1** | **Interatividade e Humanização WhatsApp** | Botões Interativos (Quick Reply, Link, Pix), Simulação de Digitando/Gravando, Reações e Marcar como Lido. |
| **Fase 2** | **Sinergia Pós-Chamada** | Resumo automático pós-chamada no WhatsApp e envio de localização/vCard durante a ligação. |
| **Fase 3** | **Campanhas Inteligentes** | Campanha mista (Ligação + Fallback automático em WhatsApp caso não atenda). |
| **Fase 4** | **Omnichannel Unificado** | Agente de IA atendendo por texto no WhatsApp com a mesma base e memória da chamada de voz. |
