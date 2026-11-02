import { useState, useEffect } from "react";
import {
  Copy,
  Check,
  Key,
  Smartphone,
  PhoneCall,
  MessageSquare,
  Webhook,
  Terminal,
  ShieldCheck,
  Sparkles,
  Layers,
  FileCode,
  Bot,
  Zap,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useSessions } from "@/stores/sessions";
import { getAISettings } from "@/services/settings";

interface CodeBlockProps {
  code: string;
  language?: string;
}

const CodeBlock = ({ code }: CodeBlockProps) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    toast.success("Código copiado!");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group rounded-xl bg-slate-950 dark:bg-zinc-950 border border-slate-800 text-slate-100 overflow-hidden font-mono text-xs my-2.5 shadow-sm">
      <div className="flex items-center justify-between px-3.5 py-1.5 border-b border-slate-800/80 bg-slate-900/60 text-slate-400 text-[11px]">
        <span className="flex items-center gap-1.5 font-medium">
          <Terminal className="h-3 w-3 text-emerald-400" /> Exemplo de Código
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-white transition-colors bg-slate-800/80 hover:bg-slate-700 px-2 py-0.5 rounded"
        >
          {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
          <span>{copied ? "Copiado!" : "Copiar"}</span>
        </button>
      </div>
      <pre className="p-3.5 overflow-x-auto leading-relaxed select-all scrollbar-thin scrollbar-thumb-slate-800">
        <code>{code}</code>
      </pre>
    </div>
  );
};

export const ApiDocsPage = () => {
  const sessions = useSessions((s) => s.sessions);
  const [systemKey, setSystemKey] = useState("");
  const [selectedSessionId, setSelectedSessionId] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"platform" | "instances" | "messages" | "voice" | "webhooks" | "quickstart">("platform");

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "http://localhost:8080";

  useEffect(() => {
    getAISettings()
      .then((res) => {
        if (res.systemApiKey) setSystemKey(res.systemApiKey);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (sessions.length > 0 && !selectedSessionId) {
      setSelectedSessionId(sessions[0].id);
    }
  }, [sessions, selectedSessionId]);

  const selectedSession = sessions.find((s) => s.id === selectedSessionId) || sessions[0];
  const activeToken = selectedSession?.token || "SEU_TOKEN_DA_INSTANCIA";
  const activeName = selectedSession?.name || "Unidade Centro - Linha 1";
  const activeSessionId = selectedSession?.id || "ID_DA_INSTANCIA";

  const copyText = (txt: string, label: string) => {
    navigator.clipboard.writeText(txt);
    toast.success(`${label} copiado!`);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Credenciais Dinâmicas Rápidas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Base URL */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-2 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-semibold flex items-center gap-1.5 text-foreground">
              <Terminal className="h-3.5 w-3.5 text-blue-500" /> Base URL da API
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => copyText(baseUrl, "Base URL")}
              title="Copiar Base URL"
            >
              <Copy className="h-3 w-3" />
            </Button>
          </div>
          <code className="text-xs font-mono block bg-muted/50 p-2 rounded-lg border border-border/50 truncate text-foreground select-all">
            {baseUrl}
          </code>
          <p className="text-[11px] text-muted-foreground">Todas as rotas públicas ficam em <code className="font-mono text-foreground">/api/v1/...</code></p>
        </div>

        {/* Instância Selecionada & Token */}
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-2 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-semibold flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
              <Key className="h-3.5 w-3.5" /> Token da Instância Ativa
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-emerald-700 dark:text-emerald-400"
              onClick={() => copyText(activeToken, "Token da Instância")}
              title="Copiar Token"
            >
              <Copy className="h-3 w-3" />
            </Button>
          </div>

          <div className="flex gap-2">
            <select
              value={selectedSessionId}
              onChange={(e) => setSelectedSessionId(e.target.value)}
              className="h-8 rounded-md border border-emerald-500/30 bg-background px-2 text-xs font-medium text-foreground w-full shadow-2xs"
            >
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} {s.paired ? "✅" : "⚠️"}
                </option>
              ))}
            </select>
          </div>

          <code className="text-[11px] font-mono block bg-background p-1.5 rounded border border-emerald-500/20 truncate text-foreground select-all">
            {activeToken}
          </code>
        </div>

        {/* Autenticação Global / Headers Aceitos */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-2 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-semibold flex items-center gap-1.5 text-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-purple-500" /> Headers de Autenticação
            </span>
          </div>
          <div className="space-y-1 text-xs">
            <div className="flex items-center justify-between bg-muted/40 px-2 py-1 rounded text-[11px] font-mono">
              <span>X-API-Key:</span>
              <span className="text-emerald-600 font-bold">&lt;token&gt;</span>
            </div>
            <div className="flex items-center justify-between bg-muted/40 px-2 py-1 rounded text-[11px] font-mono">
              <span>Authorization:</span>
              <span className="text-emerald-600 font-bold">Bearer &lt;token&gt;</span>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">Aceita tanto o Token da Instância quanto a Master Key.</p>
        </div>
      </div>

      {/* Tabs de Navegação da Documentação */}
      <div className="flex flex-wrap gap-1.5 border-b border-border/60 pb-2">
        <button
          onClick={() => setActiveTab("platform")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
            activeTab === "platform"
              ? "bg-emerald-600 text-white shadow-xs"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          <Bot className="h-3.5 w-3.5" /> 🤖 Guia de Conexão: Sua Plataforma / CRM
        </button>

        <button
          onClick={() => setActiveTab("instances")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
            activeTab === "instances"
              ? "bg-emerald-600 text-white shadow-xs"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          <Smartphone className="h-3.5 w-3.5" /> 1. Instâncias & QR Code
        </button>

        <button
          onClick={() => setActiveTab("messages")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
            activeTab === "messages"
              ? "bg-emerald-600 text-white shadow-xs"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          <MessageSquare className="h-3.5 w-3.5" /> 2. Mensagens & Botões
        </button>

        <button
          onClick={() => setActiveTab("voice")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
            activeTab === "voice"
              ? "bg-emerald-600 text-white shadow-xs"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          <PhoneCall className="h-3.5 w-3.5" /> 3. Ligações Telefônicas com IA
        </button>

        <button
          onClick={() => setActiveTab("webhooks")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
            activeTab === "webhooks"
              ? "bg-emerald-600 text-white shadow-xs"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          <Webhook className="h-3.5 w-3.5" /> 4. Webhooks & Retornos
        </button>

        <button
          onClick={() => setActiveTab("quickstart")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
            activeTab === "quickstart"
              ? "bg-emerald-600 text-white shadow-xs"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          <Sparkles className="h-3.5 w-3.5" /> 5. Exemplos (Node, Python, n8n)
        </button>
      </div>

      {/* Conteúdo das Abas */}

      {/* ABA 0: GUIA PASSO A PASSO PARA PLATAFORMAS EXTERNAS / CRMS */}
      {activeTab === "platform" && (
        <div className="space-y-6 animate-in fade-in-50 duration-200">
          {/* Card Conceitual */}
          <div className="rounded-2xl border border-emerald-500/30 bg-card p-6 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/50 pb-4">
              <div className="space-y-1">
                <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                  <Zap className="h-5 w-5 text-emerald-600" /> Como sua Plataforma Conecta ao Motor AtendiCalls
                </h3>
                <p className="text-xs text-muted-foreground">
                  A <strong>sua plataforma ou CRM</strong> é o cérebro (onde ficam seus prompts, funis, leads e regras). O <strong>AtendiCalls</strong> na sua VPS é o motor de execução (linhas do WhatsApp, áudio VoIP UDP de baixa latência e IA de voz).
                </p>
              </div>
              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 text-xs px-3 py-1 shrink-0">
                Integração 100% Headless
              </Badge>
            </div>

            {/* Diagrama de Fluxo */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 text-xs">
              <div className="rounded-xl border border-border bg-muted/40 p-3.5 space-y-1.5">
                <span className="font-bold text-foreground flex items-center gap-1.5">
                  <span className="flex h-5 w-5 rounded-full bg-emerald-600 text-white text-[10px] items-center justify-center">1</span>
                  Sua Plataforma / CRM
                </span>
                <p className="text-muted-foreground text-[11px] leading-relaxed">
                  Decide quando ligar para o lead, monta o prompt com variáveis e dispara a chamada via API.
                </p>
              </div>

              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3.5 space-y-1.5">
                <span className="font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                  <span className="flex h-5 w-5 rounded-full bg-emerald-600 text-white text-[10px] items-center justify-center">2</span>
                  Motor AtendiCalls (VPS)
                </span>
                <p className="text-muted-foreground text-[11px] leading-relaxed">
                  Liga pelo WhatsApp via túnel UDP RTP, gerencia o streaming do microfone, IA de voz e gravação estéreo.
                </p>
              </div>

              <div className="rounded-xl border border-border bg-muted/40 p-3.5 space-y-1.5">
                <span className="font-bold text-foreground flex items-center gap-1.5">
                  <span className="flex h-5 w-5 rounded-full bg-emerald-600 text-white text-[10px] items-center justify-center">3</span>
                  Retorno no seu Sistema
                </span>
                <p className="text-muted-foreground text-[11px] leading-relaxed">
                  AtendiCalls envia o webhook <code className="font-mono text-foreground">call.ended</code> com a <strong>transcrição completa</strong> para seu sistema salvar no histórico do lead.
                </p>
              </div>
            </div>
          </div>

          {/* Dados que você preenche dentro da plataforma externa */}
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Key className="h-4 w-4 text-emerald-600" />
              As 3 Credenciais que você cadastra no seu sistema
            </h3>
            <p className="text-xs text-muted-foreground">
              No painel do seu sistema (ou em variáveis de ambiente da sua aplicação), configure estes 3 campos:
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
              <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-1.5">
                <span className="text-[11px] font-semibold text-muted-foreground">1. URL da API (VPS):</span>
                <code className="text-xs font-mono block bg-background p-1.5 rounded border border-border select-all truncate text-foreground">
                  {baseUrl}
                </code>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs px-2 gap-1 w-full mt-1"
                  onClick={() => copyText(baseUrl, "URL da API")}
                >
                  <Copy className="h-3 w-3" /> Copiar URL
                </Button>
              </div>

              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-1.5">
                <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">2. Token da Instância:</span>
                <code className="text-xs font-mono block bg-background p-1.5 rounded border border-emerald-500/20 select-all truncate text-foreground">
                  {activeToken}
                </code>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs px-2 gap-1 w-full mt-1 text-emerald-700 dark:text-emerald-400"
                  onClick={() => copyText(activeToken, "Token")}
                >
                  <Copy className="h-3 w-3" /> Copiar Token
                </Button>
              </div>

              <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-1.5">
                <span className="text-[11px] font-semibold text-muted-foreground">3. Header HTTP:</span>
                <code className="text-xs font-mono block bg-background p-1.5 rounded border border-border select-all text-foreground">
                  X-API-Key
                </code>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Enviado em todas as chamadas do seu sistema.
                </p>
              </div>
            </div>
          </div>

          {/* Passo 1: Como sua plataforma exibe o QR Code para parear */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-3">
            <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
              <span className="flex h-5 w-5 rounded-full bg-emerald-600 text-white text-[10px] items-center justify-center">1</span>
              Como sua Plataforma Conecta o WhatsApp (Exibir QR Code no seu Painel)
            </h4>
            <p className="text-xs text-muted-foreground">
              Para o seu cliente escanear o QR Code direto dentro da tela da sua aplicação, o seu backend faz um <code className="font-mono text-foreground">GET /api/v1/instance/connect</code>:
            </p>
            <CodeBlock
              code={`// Backend da sua aplicação buscando o QR Code para o usuário:
const response = await fetch("${baseUrl}/api/v1/instance/connect", {
  headers: { "X-API-Key": "${activeToken}" }
});
const data = await response.json();

// Se aguardando leitura:
// data.qrcode.base64 -> "data:image/png;base64,iVBORw0KGgo..."
// Você simplesmente coloca no seu frontend: <img src={data.qrcode.base64} />`}
            />
          </div>

          {/* Passo 2: Disparo de Ligação de Voz pela sua plataforma */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-3">
            <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
              <span className="flex h-5 w-5 rounded-full bg-emerald-600 text-white text-[10px] items-center justify-center">2</span>
              Como sua Plataforma Dispara a Ligação com IA
            </h4>
            <p className="text-xs text-muted-foreground">
              Quando o lead precisa ser contatado, o seu sistema faz esta requisição para o AtendiCalls:
            </p>
            <CodeBlock
              code={`// Disparo da Ligação de Voz feito pela sua plataforma:
const res = await fetch("${baseUrl}/api/v1/voice/calls", {
  method: "POST",
  headers: {
    "X-API-Key": "${activeToken}",
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    to: "5511999998888",
    webhookUrl: "https://seu-sistema.com/api/webhooks/calls",
    agent: {
      provider: "openrouter",
      model: "google/gemini-2.0-flash-001",
      voice: "alloy",
      systemPrompt: "Você é a assistente virtual da empresa. Confirme se o cliente {{nome}} comparecerá ao agendamento de amanhã às {{horario}}.",
      firstMessage: "Olá {{nome}}, tudo bem? Estou ligando para confirmar seu agendamento!",
      variables: {
        nome: "Carlos Silva",
        horario: "14:30"
      }
    }
  })
});
const { callId } = await res.json();
console.log("Chamada iniciada com ID:", callId);`}
            />
          </div>

          {/* Passo 3: Webhook de Retorno com a Transcrição */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-3">
            <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
              <span className="flex h-5 w-5 rounded-full bg-emerald-600 text-white text-[10px] items-center justify-center">3</span>
              O que sua Plataforma Recebe no Webhook quando a Ligação Termina
            </h4>
            <p className="text-xs text-muted-foreground">
              Assim que o cliente desliga, o AtendiCalls envia este payload para o endpoint do seu sistema:
            </p>
            <CodeBlock
              code={`// Payload recebido no endpoint https://seu-sistema.com/api/webhooks/calls:
{
  "event": "call.ended",
  "callId": "3EB042E927A1...",
  "sessionId": "${activeSessionId}",
  "reason": "completed",
  "peer": "5511999998888",
  "durationSec": 54,
  "transcript": "[00:02] Atendente: Olá Carlos Silva, tudo bem? Estou ligando para confirmar seu agendamento!\\n[00:06] Cliente: Olá! Tudo ótimo, pode confirmar sim às 14:30.\\n[00:10] Atendente: Perfeito Carlos! Te aguardo amanhã. Tenha um excelente dia!",
  "timestamp": 1730430054000
}`}
            />
          </div>

          {/* Passo 4: Ações em Tempo Real e Follow-up */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-border bg-card p-4 space-y-2 text-xs">
              <span className="font-bold text-foreground flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Desligar Chamada com Segurança
              </span>
              <p className="text-muted-foreground">
                Se o operador ou uma regra do seu sistema decidir encerrar:
              </p>
              <code className="font-mono text-foreground block bg-muted/50 p-2 rounded truncate select-all">
                POST {baseUrl}/api/v1/voice/calls/{"{id}"}/hangup
              </code>
            </div>

            <div className="rounded-xl border border-border bg-card p-4 space-y-2 text-xs">
              <span className="font-bold text-foreground flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Baixar Gravação de Áudio (.wav)
              </span>
              <p className="text-muted-foreground">
                Para ouvir a ligação gravada dentro do player da sua aplicação:
              </p>
              <code className="font-mono text-foreground block bg-muted/50 p-2 rounded truncate select-all">
                GET {baseUrl}/api/v1/voice/calls/{"{id}"}/audio
              </code>
            </div>
          </div>
        </div>
      )}

      {/* ABA 1: INSTÂNCIAS E QR CODE */}
      {activeTab === "instances" && (
        <div className="space-y-6 animate-in fade-in-50 duration-200">
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30">POST</Badge>
                  /api/v1/instance/create — Criar Nova Instância
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Cria uma linha do WhatsApp, define o token de acesso e já retorna o QR Code em Base64 PNG.
                </p>
              </div>
            </div>

            <CodeBlock
              code={`curl -X POST ${baseUrl}/api/v1/instance/create \\
  -H "X-API-Key: ${systemKey || "SUA_MASTER_KEY"}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Unidade Centro - Linha 1",
    "token": "meu_token_personalizado_123"
  }'`}
            />

            <div className="rounded-lg bg-muted/40 p-3 text-xs space-y-1">
              <p className="font-semibold text-foreground">Exemplo de Resposta (Status 200 OK):</p>
              <pre className="text-[11px] font-mono text-muted-foreground overflow-x-auto">
{`{
  "status": "created",
  "instance": {
    "id": "c1f7a08b6d43e21a...",
    "name": "Unidade Centro - Linha 1",
    "token": "meu_token_personalizado_123",
    "state": "connecting",
    "paired": false
  },
  "qrcode": {
    "code": "2@bK3l0Z...",
    "base64": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA..."
  }
}`}
              </pre>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/30">GET</Badge>
                  /api/v1/instance/connect — Obter QR Code / Conectar
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Basta autenticar com o <strong>Token da Instância</strong>. O motor entrega a imagem do QR Code em Base64 para exibir no seu CRM.
                </p>
              </div>
            </div>

            <CodeBlock
              code={`curl -X GET ${baseUrl}/api/v1/instance/connect \\
  -H "X-API-Key: ${activeToken}"`}
            />

            <div className="rounded-lg bg-muted/40 p-3 text-xs space-y-1">
              <p className="font-semibold text-foreground">Resposta aguardando leitura do QR Code:</p>
              <pre className="text-[11px] font-mono text-muted-foreground overflow-x-auto">
{`{
  "status": "scan_qr_code",
  "instance": { "id": "${activeSessionId}", "name": "${activeName}", "token": "${activeToken}" },
  "qrcode": {
    "code": "2@...",
    "base64": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA..."
  }
}`}
              </pre>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30">POST</Badge>
                  /api/v1/instance/pair-phone — Pareamento por Código de 8 Dígitos (Opcional)
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Conecte o WhatsApp digitando o código de 8 dígitos no celular (sem precisar apontar a câmera para o QR Code).
                </p>
              </div>
            </div>

            <CodeBlock
              code={`curl -X POST ${baseUrl}/api/v1/instance/pair-phone \\
  -H "X-API-Key: ${activeToken}" \\
  -H "Content-Type: application/json" \\
  -d '{"phone": "5511999998888"}'`}
            />
          </div>
        </div>
      )}

      {/* ABA 2: MENSAGENS E BOTÕES */}
      {activeTab === "messages" && (
        <div className="space-y-6 animate-in fade-in-50 duration-200">
          {/* Mensagem de Texto */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30">POST</Badge>
                  /api/v1/messages/send-text — Enviar Texto
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Envia mensagens de texto comuns pelo WhatsApp da instância.
                </p>
              </div>
            </div>

            <CodeBlock
              code={`curl -X POST ${baseUrl}/api/v1/messages/send-text \\
  -H "X-API-Key: ${activeToken}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "to": "5511999998888",
    "text": "Olá Carlos! Seu agendamento foi confirmado para amanhã às 14h30."
  }'`}
            />
          </div>

          {/* Botões Interativos Nativos */}
          <div className="rounded-xl border border-emerald-500/20 bg-card p-5 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30">POST</Badge>
                  /api/v1/messages/send-buttons — Botões Nativos do WhatsApp
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Envia botões clicáveis de resposta rápida, link de URL externo, botão de copiar Pix e botão de ligar.
                </p>
              </div>
            </div>

            <CodeBlock
              code={`curl -X POST ${baseUrl}/api/v1/messages/send-buttons \\
  -H "X-API-Key: ${activeToken}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "to": "5511999998888",
    "title": "Confirmação de Agendamento",
    "text": "Olá Carlos! Gostaria de confirmar seu horário amanhã às 14h30?",
    "footer": "AtendiCalls • Assistente Virtual",
    "buttons": [
      {
        "type": "reply",
        "text": "✅ Sim, confirmado!",
        "id": "btn_confirmado"
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
        "copyCode": "financeiro@clinica.com.br"
      }
    ]
  }'`}
            />
          </div>

          {/* Áudio Gravado PTT */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30">POST</Badge>
                  /api/v1/messages/send-audio — Áudio Gravado (Voice Note PTT)
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Envia áudio nativo com waveform e microfone verde/azul (gravado na hora via TTS ou a partir de URL).
                </p>
              </div>
            </div>

            <CodeBlock
              code={`curl -X POST ${baseUrl}/api/v1/messages/send-audio \\
  -H "X-API-Key: ${activeToken}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "to": "5511999998888",
    "text": "Olá Carlos! Aqui é a Sofia da clínica. Estou te mandando este áudio para confirmar seu agendamento de amanhã.",
    "voice": "alloy",
    "ptt": true
  }'`}
            />
          </div>

          {/* Mídia / Documentos */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30">POST</Badge>
                  /api/v1/messages/send-media — Enviar PDF, Imagem ou Documento
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Faz o download e o envio automático de arquivos remotos para o cliente.
                </p>
              </div>
            </div>

            <CodeBlock
              code={`curl -X POST ${baseUrl}/api/v1/messages/send-media \\
  -H "X-API-Key: ${activeToken}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "to": "5511999998888",
    "mediaUrl": "https://meu-crm.com/comprovantes/recibo_123.pdf",
    "fileName": "Comprovante.pdf",
    "caption": "Segue em anexo o seu comprovante de atendimento."
  }'`}
            />
          </div>
        </div>
      )}

      {/* ABA 3: LIGAÇÕES TELEFÔNICAS COM IA */}
      {activeTab === "voice" && (
        <div className="space-y-6 animate-in fade-in-50 duration-200">
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30">POST</Badge>
                  /api/v1/voice/calls — Iniciar Ligação Telefônica com IA
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Dispara a chamada VoIP no WhatsApp com um robô de IA configurado dinamicamente para o cliente.
                </p>
              </div>
            </div>

            <CodeBlock
              code={`curl -X POST ${baseUrl}/api/v1/voice/calls \\
  -H "X-API-Key: ${activeToken}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "to": "5511999998888",
    "webhookUrl": "https://meu-crm.com/webhooks/call-ended",
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
  }'`}
            />

            <div className="rounded-lg bg-muted/40 p-3 text-xs space-y-1">
              <p className="font-semibold text-foreground">Retorno da Chamada Criada:</p>
              <pre className="text-[11px] font-mono text-muted-foreground overflow-x-auto">
{`{
  "callId": "3EB042E927A1...",
  "status": "initiated",
  "sessionId": "${activeSessionId}",
  "to": "5511999998888",
  "startedAt": 1730430000000
}`}
              </pre>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <h3 className="text-sm font-bold text-foreground">Rotas de Controle em Tempo Real e Download da Gravação</h3>
            
            <div className="space-y-3">
              <div className="p-3 rounded-lg border border-border bg-muted/30 text-xs space-y-1">
                <p className="font-semibold text-foreground flex items-center gap-1.5">
                  <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/30">GET</Badge>
                  /api/v1/voice/calls/{"{id}"}/audio — Baixar Gravação (.wav)
                </p>
                <p className="text-muted-foreground">Faz o streaming ou download do áudio completo estéreo gravado da ligação.</p>
              </div>

              <div className="p-3 rounded-lg border border-border bg-muted/30 text-xs space-y-1">
                <p className="font-semibold text-foreground flex items-center gap-1.5">
                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30">POST</Badge>
                  /api/v1/voice/calls/{"{id}"}/speak — Forçar a IA a Falar um Texto
                </p>
                <code className="text-[11px] font-mono block text-muted-foreground">{"{\"text\": \"Carlos, você ainda está na linha?\"}"}</code>
              </div>

              <div className="p-3 rounded-lg border border-border bg-muted/30 text-xs space-y-1">
                <p className="font-semibold text-foreground flex items-center gap-1.5">
                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30">POST</Badge>
                  /api/v1/voice/calls/{"{id}"}/interrupt — Calar a IA Imediatamente
                </p>
                <p className="text-muted-foreground">Interrompe a fala da IA instantaneamente se o cliente começou a falar.</p>
              </div>

              <div className="p-3 rounded-lg border border-border bg-muted/30 text-xs space-y-1">
                <p className="font-semibold text-foreground flex items-center gap-1.5">
                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30">POST</Badge>
                  /api/v1/voice/calls/{"{id}"}/hangup — Desligar / Encerrar Chamada
                </p>
                <p className="text-muted-foreground">
                  Desliga o telefone e finaliza a sessão de voz ativa. <strong>Não apaga nenhum dado</strong> (a gravação de áudio, métricas e a transcrição completa são salvas e preservadas no histórico).
                  Também aceita <code className="font-mono text-foreground">DELETE /api/v1/voice/calls/{"{id}"}</code> como rota alternativa.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ABA 4: WEBHOOKS E RETORNOS */}
      {activeTab === "webhooks" && (
        <div className="space-y-6 animate-in fade-in-50 duration-200">
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Webhook className="h-4 w-4 text-emerald-600" />
              Webhook de Encerramento de Ligação (call.ended)
            </h3>
            <p className="text-xs text-muted-foreground">
              Enviado automaticamente para a URL de webhook informada no disparo da chamada. Já entrega a <strong>transcrição completa das falas</strong> sem precisar fazer outra chamada GET!
            </p>

            <CodeBlock
              code={`{
  "event": "call.ended",
  "callId": "3EB042E927A1...",
  "sessionId": "${activeSessionId}",
  "reason": "completed",
  "peer": "5511999998888",
  "durationSec": 84,
  "transcript": "[00:03] Atendente: Olá Carlos, aqui é a Sofia!\\n[00:06] Cliente: Olá Sofia, tudo bem?\\n[00:09] Atendente: Tudo ótimo! Estou ligando para confirmar sua consulta amanhã às 14:30.\\n[00:15] Cliente: Perfeito, confirmado sim!\\n[00:18] Atendente: Muito obrigada, até amanhã!",
  "timestamp": 1730430084000
}`}
            />
          </div>

          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-emerald-600" />
              Webhook de Mensagem Recebida / Clique em Botão (message.received)
            </h3>
            <p className="text-xs text-muted-foreground">
              Disparado sempre que o cliente responde por texto ou clica em um botão interativo:
            </p>

            <CodeBlock
              code={`{
  "event": "message.received",
  "sessionId": "${activeSessionId}",
  "timestamp": 1730430015000,
  "data": {
    "messageId": "3EB034E...",
    "phone": "5511999998888",
    "pushName": "Carlos Silva",
    "type": "button_response",
    "text": "Sim, confirmado!",
    "buttonId": "btn_confirmado"
  }
}`}
            />
          </div>

          <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-4 space-y-2">
            <h4 className="text-xs font-bold text-purple-700 dark:text-purple-300 flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4" /> Validação de Segurança HMAC SHA-256
            </h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Quando a Master Key (<code className="font-mono text-foreground">{systemKey || "system_api_key"}</code>) estiver configurada, todos os webhooks disparados pelo AtendiCalls conterão o cabeçalho:
            </p>
            <code className="text-xs font-mono block bg-background p-2 rounded border border-purple-500/20 text-foreground">
              X-AtendiCalls-Signature-256: sha256=hash_hexadecimal
            </code>
          </div>
        </div>
      )}

      {/* ABA 5: GUIAS E CÓDIGOS EM OUTRAS LINGUAGENS */}
      {activeTab === "quickstart" && (
        <div className="space-y-6 animate-in fade-in-50 duration-200">
          {/* Node.js */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-3">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              <FileCode className="h-4 w-4 text-emerald-600" /> Exemplo em Node.js (Fetch / Axios)
            </h3>
            <CodeBlock
              code={`// Enviar mensagem de texto no Node.js
async function enviarMensagem() {
  const response = await fetch("${baseUrl}/api/v1/messages/send-text", {
    method: "POST",
    headers: {
      "X-API-Key": "${activeToken}",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      to: "5511999998888",
      text: "Olá! Mensagem enviada pelo nosso CRM."
    })
  });

  const data = await response.json();
  console.log("Mensagem enviada:", data);
}

enviarMensagem();`}
            />
          </div>

          {/* Python */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-3">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              <FileCode className="h-4 w-4 text-blue-500" /> Exemplo em Python (Requests)
            </h3>
            <CodeBlock
              code={`import requests

# Disparar ligação com IA no Python
url = "${baseUrl}/api/v1/voice/calls"
headers = {
    "X-API-Key": "${activeToken}",
    "Content-Type": "application/json"
}
payload = {
    "to": "5511999998888",
    "agent": {
        "provider": "openrouter",
        "model": "google/gemini-2.0-flash-001",
        "voice": "alloy",
        "systemPrompt": "Você é o assistente virtual da empresa confirmando a visita técnica."
    }
}

response = requests.post(url, json=payload, headers=headers)
print(response.json())`}
            />
          </div>

          {/* n8n / Typebot */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-3">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Layers className="h-4 w-4 text-purple-500" /> Integração no n8n ou Typebot
            </h3>
            <div className="text-xs text-muted-foreground space-y-2 leading-relaxed">
              <p>
                1. No seu fluxo do <strong>n8n</strong>, adicione um nó de <strong>HTTP Request</strong>.
              </p>
              <p>
                2. Configure o método como <strong>POST</strong> e a URL como:
                <code className="font-mono text-foreground block bg-muted/50 p-1.5 rounded my-1">{`${baseUrl}/api/v1/messages/send-buttons`}</code>
              </p>
              <p>
                3. Em <strong>Headers</strong>, adicione o parâmetro <code className="font-mono text-foreground">X-API-Key</code> com o valor do token da instância:
                <code className="font-mono text-foreground block bg-muted/50 p-1.5 rounded my-1">{activeToken}</code>
              </p>
              <p>
                4. Em <strong>Body Parameters (JSON)</strong>, cole o JSON com o destinatário e botões. Pronto! Seus disparos serão processados em milissegundos pelo motor.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
