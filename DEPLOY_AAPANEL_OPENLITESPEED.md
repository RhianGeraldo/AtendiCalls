# 🚀 Guia de Deploy do AtendiCalls no aaPanel (OpenLiteSpeed & Nginx)

Este guia orienta a instalação e execução em produção do **AtendiCalls** dentro do painel **aaPanel**, com foco no servidor web **OpenLiteSpeed (OLS)** (e Nginx como alternativa), banco de dados (MySQL/PostgreSQL), gerenciamento de processos via **Supervisor** e configuração de **SSL / WebSockets** (necessário para áudio em tempo real e WebRTC).

---

## 🏗️ 1. Visão Geral da Arquitetura

```
[ Navegador / Cliente ] 
        │ (HTTPS / WSS - Porta 443)
        ▼
[ OpenLiteSpeed / Nginx ] ── (Proxy Reverso com WebSocket)
        │ 
        ▼ (Porta interna 127.0.0.1:8080)
[ AtendiCalls (Go Server) ] ── (GORM) ──► [ MySQL / PostgreSQL ]
   └─ Entrega Frontend (client/dist) + API + WebSockets
```

---

## 📋 2. Pré-requisitos no aaPanel

No menu lateral **App Store** do aaPanel, garanta que estejam instalados:
1. **OpenLiteSpeed** (seu servidor web ativo).
2. **MySQL** (versão 5.7 ou 8.0) *ou* **PostgreSQL Manager**.
3. **Supervisor** (em *App Store* > procure por "Supervisor" e instale — essencial para manter o processo Go rodando 24/7).
4. **Node.js** (versão 18 ou superior) e **Go** (versão 1.23 ou superior) no terminal do servidor.

Para verificar se o Node e Go estão presentes no terminal do servidor:
```bash
node -v
go version
```
*(Se faltar Go no seu servidor Linux: `apt update && apt install -y golang` ou baixe do site oficial go.dev)*.

---

## 📥 3. Baixar o Código no Servidor

Acesse o terminal SSH da sua VPS ou utilize o **Terminal** nativo do aaPanel:

```bash
cd /www/wwwroot
git clone https://github.com/RhianGeraldo/AtendiCalls.git atendicalls
cd atendicalls
```

---

## 🗄️ 4. Criar o Banco de Dados no aaPanel

1. No menu do aaPanel vá em **Databases** > **Add database**.
2. Preencha os dados:
   - **DB Name:** `atendicalls_db`
   - **DB User:** `atendicalls_user`
   - **Password:** *(Gere uma senha forte)*
   - **Access Rights:** `Local server (127.0.0.1)`

---

## ⚙️ 5. Criar o Arquivo `.env` de Produção

Dentro da pasta `/www/wwwroot/atendicalls`, crie o arquivo `.env`:

```bash
nano /www/wwwroot/atendicalls/.env
```

Cole a configuração:
```env
# Porta local onde o binário Go vai escutar
PORT=8080

# Caso opte por PostgreSQL em vez de MySQL:
# DATABASE_URL=postgres://atendicalls_user:Erriesse2026!@127.0.0.1:5432/atendicalls_db?sslmode=disable

# Chaves de IA (Preencha as que for utilizar):
GEMINI_API_KEY=
OPENROUTER_API_KEY=
```

---

## 🔨 6. Compilar o Frontend e o Backend

Execute os comandos abaixo na pasta do projeto:

```bash
cd /www/wwwroot/atendicalls

# 1. Compilar o Frontend (React / Vite)
cd client
npm install
npm run build
cd ..

# 2. Compilar o Backend Go
go build -o server ./cmd/server
chmod +x server
```

> **Dica:** O backend Go já foi programado para servir automaticamente os arquivos estáticos de `client/dist`. Assim, o binário `server` fornece todo o sistema (API + Painel Web) em uma única porta unificada.

---

## 🔄 7. Manter o Serviço Rodando com Supervisor (aaPanel)

1. No aaPanel, vá em **App Store** > abra as configurações do **Supervisor**.
2. Clique no botão **Add Daemon**:
   - **Name:** `atendicalls`
   - **Run User:** `root` (ou `www`)
   - **Run Dir:** `/www/wwwroot/atendicalls`
   - **Start Command:** `/www/wwwroot/atendicalls/server -addr :8080 -static client/dist`
   - **Number of processes:** `1`
3. Salve. O status deve ficar verde (**RUNNING**).
4. Verifique o log do daemon no Supervisor para confirmar que o servidor iniciou e escuta na `:8080`.

---

## 🌐 8. Configurar o Domínio no OpenLiteSpeed (aaPanel)

### 8.1. Criar o Site
1. No menu lateral vá em **Website** > **Add site**.
2. Preencha:
   - **Domain:** `chamadas.seudominio.com` (aponte o DNS para o IP da sua VPS).
   - **Root directory:** `/www/wwwroot/atendicalls`
   - **PHP Version:** `Pure static` (não precisa de PHP).

### 8.2. Instalar o Certificado SSL (Obrigatório para Microfone/WebRTC)
1. Clique no site criado > aba **SSL**.
2. Selecione **Let's Encrypt**, marque seu domínio e clique em **Apply**.
3. Ative a chave **Force HTTPS**.

### 8.3. Configurar o Proxy Reverso e WebSockets no OpenLiteSpeed

O OpenLiteSpeed gerencia proxies reversos via **External Application** e **Context** (ou Rewrite Rules).

#### Método Recomendado (Via Configuração do vHost do OpenLiteSpeed):
1. No aaPanel, clique no seu site > aba **Config file** (ou abra o arquivo de configuração vhost do OpenLiteSpeed).
2. Adicione o processador externo de proxy e as diretivas de WebSocket dentro do bloco `virtualhost`:

```text
# 1. Definir o backend Go como External Processor
extprocessor atendicalls_backend {
  type                    proxy
  address                 127.0.0.1:8080
  maxConns                200
  pcKeepAliveTimeout      60
  initTimeout             600
  retryTimeout            0
  respURI                 /
}

# 2. Definir o Contexto raiz para encaminhar todo o tráfego
context / {
  type                    proxy
  handler                 atendicalls_backend
  addDefaultCharset       off
}

# 3. Mapear WebSockets para áudio, chamadas e eventos em tempo real
websocket /ws {
  address                 127.0.0.1:8080
}

websocket /api/events {
  address                 127.0.0.1:8080
}

websocket /api/ai/live/ws {
  address                 127.0.0.1:8080
}
```

3. Salve as alterações.
4. Reinicie o OpenLiteSpeed no aaPanel (**App Store** > **OpenLiteSpeed** > **Restart**).

---

## 🔑 9. Primeiro Acesso e Validação

1. Abra seu navegador em `https://chamadas.seudominio.com`.
2. O GORM fará a criação e migração automática de todas as tabelas no seu banco MySQL/Postgres.
3. Faça login com as credenciais padrão:
   - **E-mail:** `admin@admin.com`
   - **Senha:** `admin123`
4. Acesse o menu de perfil para alterar a sua senha.
5. Crie ou conecte uma nova linha de WhatsApp via QR Code!

---

## 🛠️ Dicas de Manutenção e Atualização

Quando houver novas atualizações no repositório Git:

```bash
cd /www/wwwroot/atendicalls
git pull origin main

# Recompilar Frontend
cd client && npm install && npm run build && cd ..

# Recompilar Backend
go build -o server ./cmd/server

# Reiniciar no Supervisor
# No aaPanel: Supervisor > Restart "atendicalls"
# Ou via terminal: supervisorctl restart atendicalls
```
