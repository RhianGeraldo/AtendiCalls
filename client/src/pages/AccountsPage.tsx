import { useState, useEffect } from "react";
import { Copy, Smartphone, Plus, Pencil, Trash2, Power, QrCode, Loader2, CheckCircle2, AlertCircle, Radio, Save, Key, ChevronDown, ChevronUp, Cpu, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { SessionPairing } from "@/components/domain/session/SessionPairing";
import { useSessions, setActiveSession } from "@/stores/sessions";
import { createSession, deleteSession, logoutSession, pairSession, renameSession } from "@/services/sessions";
import { getAISettings, saveAISettings } from "@/services/settings";
import { useAuth } from "@/stores/auth";
import { formatPhoneBR } from "@/utils/format";
import type { SessionInfo } from "@/types/session";

export const AccountsPage = () => {
  const user = useAuth((s) => s.user);
  const isAdmin = user?.role === "admin";

  const sessions = useSessions((s) => s.sessions);
  const activeId = useSessions((s) => s.activeId);
  const pairedSessions = sessions.filter((s) => s.paired);
  const pendingSessions = sessions.filter((s) => !s.paired);

  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [busySessionId, setBusySessionId] = useState<string | null>(null);
  const [isQuotaModalOpen, setIsQuotaModalOpen] = useState(false);

  // AI Settings State
  const [groqApiKey, setGroqApiKey] = useState("");
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [openrouterApiKey, setOpenrouterApiKey] = useState("");
  const [googleApiKey, setGoogleApiKey] = useState("");
  const [systemApiKey, setSystemApiKey] = useState("");
  const [defaultProvider, setDefaultProvider] = useState("openrouter");
  const [defaultModel, setDefaultModel] = useState("google/gemini-2.0-flash-001");
  const [defaultVoice, setDefaultVoice] = useState("alloy");
  const [defaultPrompt, setDefaultPrompt] = useState("");
  const [messageWebhookUrl, setMessageWebhookUrl] = useState("");
  const [whisperModel, setWhisperModel] = useState("whisper-large-v3-turbo");
  const [savingSettings, setSavingSettings] = useState(false);
  const [showAISettings, setShowAISettings] = useState(false);

  useEffect(() => {
    getAISettings()
      .then((res) => {
        if (res.groqApiKey) setGroqApiKey(res.groqApiKey);
        if (res.openaiApiKey) setOpenaiApiKey(res.openaiApiKey);
        if (res.openrouterApiKey) setOpenrouterApiKey(res.openrouterApiKey);
        if (res.googleApiKey) setGoogleApiKey(res.googleApiKey);
        if (res.systemApiKey) setSystemApiKey(res.systemApiKey);
        if (res.defaultProvider) setDefaultProvider(res.defaultProvider);
        if (res.defaultModel) setDefaultModel(res.defaultModel);
        if (res.defaultVoice) setDefaultVoice(res.defaultVoice);
        if (res.defaultPrompt) setDefaultPrompt(res.defaultPrompt);
        if (res.messageWebhookUrl) setMessageWebhookUrl(res.messageWebhookUrl);
        if (res.whisperModel) setWhisperModel(res.whisperModel);
      })
      .catch(() => {});
  }, []);

  const handleSaveAISettings = async () => {
    setSavingSettings(true);
    try {
      await saveAISettings({
        groqApiKey,
        openaiApiKey,
        openrouterApiKey,
        googleApiKey,
        systemApiKey,
        defaultProvider,
        defaultModel,
        defaultVoice,
        defaultPrompt,
        messageWebhookUrl,
        whisperModel,
      });
      toast.success("Configurações do Motor de IA e Mensagens salvas com sucesso!");
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar configurações.");
    } finally {
      setSavingSettings(false);
    }
  };

  // New Session Modal
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newSessionName, setNewSessionName] = useState("");
  const [newSessionToken, setNewSessionToken] = useState("");

  // Edit Session Name Modal
  const [editingSession, setEditingSession] = useState<SessionInfo | null>(null);
  const [editSessionName, setEditSessionName] = useState("");

  // Delete Confirmation
  const [toDelete, setToDelete] = useState<SessionInfo | null>(null);

  const maxInst = user?.maxInstances || (isAdmin ? 9999 : 1);
  const curInst = sessions.length;

  const handleOpenCreate = () => {
    if (!isAdmin && curInst >= maxInst) {
      setIsQuotaModalOpen(true);
      return;
    }
    setNewSessionName(`WhatsApp ${sessions.length + 1}`);
    setNewSessionToken("");
    setIsCreateOpen(true);
  };

  const handleCreate = async () => {
    const nameToUse = newSessionName.trim() || `WhatsApp ${sessions.length + 1}`;
    setCreating(true);
    try {
      const { id } = await createSession(nameToUse, newSessionToken.trim() || undefined);
      setActiveSession(id);
      setIsCreateOpen(false);
      toast.success("Sessão criada com sucesso!");
    } catch (e: any) {
      if (e.message?.includes("Limite de instâncias") || e.message?.includes("QUOTA_EXCEEDED")) {
        setIsCreateOpen(false);
        setIsQuotaModalOpen(true);
      } else {
        toast.error(e.message || "Erro ao criar sessão.");
      }
    } finally {
      setCreating(false);
    }
  };

  const handleRename = async () => {
    if (!editingSession) return;
    const nameToUse = editSessionName.trim();
    if (!nameToUse) {
      toast.error("O nome da sessão não pode ficar em branco.");
      return;
    }
    setRenaming(true);
    try {
      await renameSession(editingSession.id, nameToUse);
      setEditingSession(null);
      toast.success("Nome atualizado!");
    } catch (e: any) {
      toast.error(e.message || "Erro ao renomear.");
    } finally {
      setRenaming(false);
    }
  };

  const handleAction = async (id: string, action: () => Promise<unknown>) => {
    setBusySessionId(id);
    try {
      await action();
    } catch (e: any) {
      toast.error(e.message || "Erro ao executar ação.");
    } finally {
      setBusySessionId(null);
    }
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    try {
      await deleteSession(toDelete.id);
      toast.success("Sessão removida.");
      setToDelete(null);
    } catch (e: any) {
      toast.error(e.message || "Erro ao remover sessão.");
    }
  };

  const selectedSession = sessions.find((s) => s.id === activeId) || sessions[0];

  return (
    <div className="mx-auto max-w-7xl space-y-6 select-none">
      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Card 1: Total de Contas / Plano */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">
              {isAdmin ? "Total de Contas" : `Plano: ${user?.planName || "Gratuito"}`}
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Smartphone className="h-4 w-4" />
            </div>
          </div>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl font-extrabold tracking-tight text-foreground">
              {sessions.length} {!isAdmin && <span className="text-sm font-normal text-muted-foreground">/ {maxInst}</span>}
            </span>
            <span className="text-xs text-muted-foreground">
              {!isAdmin && curInst >= maxInst ? (
                <span className="text-amber-600 font-bold">Limite atingido</span>
              ) : (
                "instâncias ativas"
              )}
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            {isAdmin ? "Sessões globais registradas no sistema" : "Instâncias conectadas à sua conta"}
          </p>
        </div>

        {/* Card 2: Sessões Operacionais */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Operacionais / Prontas</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl font-extrabold tracking-tight text-emerald-500">{pairedSessions.length}</span>
            <span className="text-xs text-emerald-500 font-medium">conectadas</span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">Prontas para efetuar e receber chamadas</p>
        </div>

        {/* Card 3: Aguardando Pareamento */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Aguardando QR Code</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <AlertCircle className="h-4 w-4" />
            </div>
          </div>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl font-extrabold tracking-tight text-amber-500">{pendingSessions.length}</span>
            <span className="text-xs text-amber-500 font-medium">pendentes</span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">Necessitam de leitura do código QR</p>
        </div>
      </div>

      {/* Card: Configuração do Motor de IA para Ligações & Integrações */}
      <div className="rounded-2xl border border-primary/20 bg-card p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/50 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
              <Cpu className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">Motor de IA para Ligações & API Externa</h3>
              <p className="text-xs text-muted-foreground">Configure as chaves da OpenAI, Google Gemini e OpenRouter para bots de voz</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/20">
              OpenRouter · OpenAI · Gemini
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAISettings(!showAISettings)}
              className="h-8 px-2 text-xs gap-1"
            >
              {showAISettings ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              {showAISettings ? "Recolher" : "Configurar"}
            </Button>
          </div>
        </div>

        {showAISettings && (
          <div className="space-y-4 pt-1 animate-in fade-in-50 duration-200">
            {/* Chaves de Provedor */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Key className="h-3.5 w-3.5 text-blue-500" /> OpenRouter API Key
                </label>
                <Input
                  type="password"
                  value={openrouterApiKey}
                  onChange={(e) => setOpenrouterApiKey(e.target.value)}
                  placeholder="sk-or-v1-..."
                  className="text-xs font-mono h-9"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Key className="h-3.5 w-3.5 text-emerald-500" /> OpenAI API Key
                </label>
                <Input
                  type="password"
                  value={openaiApiKey}
                  onChange={(e) => setOpenaiApiKey(e.target.value)}
                  placeholder="sk-..."
                  className="text-xs font-mono h-9"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Key className="h-3.5 w-3.5 text-amber-500" /> Google Gemini Key
                </label>
                <Input
                  type="password"
                  value={googleApiKey}
                  onChange={(e) => setGoogleApiKey(e.target.value)}
                  placeholder="AIzaSy..."
                  className="text-xs font-mono h-9"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Key className="h-3.5 w-3.5 text-purple-500" /> Groq API Key (STT)
                </label>
                <Input
                  type="password"
                  value={groqApiKey}
                  onChange={(e) => setGroqApiKey(e.target.value)}
                  placeholder="gsk_..."
                  className="text-xs font-mono h-9"
                />
              </div>
            </div>

            {/* Configurações Padrão de Voz & Modelo */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 border-t border-border/40 pt-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Wand2 className="h-3.5 w-3.5 text-primary" /> Provedor Padrão
                </label>
                <select
                  value={defaultProvider}
                  onChange={(e) => setDefaultProvider(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="openrouter">OpenRouter (Cascata LLM + Whisper + TTS)</option>
                  <option value="openai_realtime">OpenAI Realtime (Speech-to-Speech nativo)</option>
                  <option value="gemini_live">Google Gemini Live (Multimodal nativo)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Modelo Padrão</label>
                <Input
                  type="text"
                  value={defaultModel}
                  onChange={(e) => setDefaultModel(e.target.value)}
                  placeholder="google/gemini-2.0-flash-001"
                  className="text-xs font-mono h-9"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Voz Padrão</label>
                <Input
                  type="text"
                  value={defaultVoice}
                  onChange={(e) => setDefaultVoice(e.target.value)}
                  placeholder="alloy, nova, Puck, Aoede"
                  className="text-xs font-mono h-9"
                />
              </div>
            </div>

            {/* Prompt Padrão (Persona) */}
            <div className="border-t border-border/40 pt-3 space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Prompt de Atendimento Padrão (Persona)</label>
              <textarea
                value={defaultPrompt}
                onChange={(e) => setDefaultPrompt(e.target.value)}
                rows={2}
                placeholder="Você é um assistente atencioso conversando por telefone. Seja conciso e direto em português..."
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>

            {/* Webhook para Mensagens Recebidas & Token da API Externa */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 border-t border-border/40 pt-3">
              <div className="sm:col-span-8 space-y-1.5">
                <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Radio className="h-3.5 w-3.5 text-emerald-500" /> Webhook para Mensagens Recebidas (n8n, CRM, etc.)
                </label>
                <Input
                  type="url"
                  value={messageWebhookUrl}
                  onChange={(e) => setMessageWebhookUrl(e.target.value)}
                  placeholder="https://meu-n8n.com/webhook/whatsapp-inbound"
                  className="text-xs font-mono h-9"
                />
                <p className="text-[10px] text-muted-foreground">Dispara evento <code>message.received</code> com remetente, texto e mídia sempre que receber uma mensagem.</p>
              </div>

              <div className="sm:col-span-4 space-y-1.5">
                <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Key className="h-3.5 w-3.5 text-primary" /> Token de API do AtendiCalls
                </label>
                <Input
                  type="text"
                  value={systemApiKey}
                  onChange={(e) => setSystemApiKey(e.target.value)}
                  placeholder="Token para n8n, CRM, etc."
                  className="text-xs font-mono h-9"
                />
                <p className="text-[10px] text-muted-foreground">Header: <code>Authorization: Bearer &lt;token&gt;</code></p>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-border/40">
              <Button
                onClick={handleSaveAISettings}
                disabled={savingSettings}
                className="h-9 text-xs gap-2 px-5 shadow-sm"
              >
                {savingSettings ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Salvar Configurações de IA
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Header Bar with Create Action */}
      <div className="flex justify-between items-center border-b border-border/40 pb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <Radio className="w-4 h-4 text-emerald-500 animate-pulse" /> Instâncias de WhatsApp Cadastradas
        </h2>

        {isAdmin && (
          <Button onClick={handleOpenCreate} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 shadow-sm">
            <Plus className="h-4 w-4" /> Nova Sessão
          </Button>
        )}
      </div>

      {/* Grid of Accounts */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sessions.map((s) => {
          const isSelected = s.id === activeId;
          const isBusy = busySessionId === s.id;
          const cleanStatus = s.statusText?.replace(/^"|"$/g, "").trim();

          return (
            <div
              key={s.id}
              onClick={() => setActiveSession(s.id)}
              className={`flex flex-col justify-between rounded-2xl border p-4 shadow-sm transition-all cursor-pointer ${
                isSelected
                  ? "border-emerald-500/60 bg-emerald-500/5 ring-2 ring-emerald-500/20"
                  : "bg-card hover:bg-muted/40 border-border"
              }`}
            >
              <div className="space-y-3">
                {/* Card Top: Avatar & Name */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    {s.pictureUrl ? (
                      <img src={s.pictureUrl} alt={s.name} className="h-10 w-10 rounded-2xl object-cover shrink-0 border border-emerald-500/30" />
                    ) : (
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 font-bold border border-emerald-500/20">
                        {s.name.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="font-bold text-sm text-foreground truncate">{s.name}</p>
                        {isAdmin && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingSession(s);
                              setEditSessionName(s.name);
                            }}
                            className="text-muted-foreground hover:text-foreground p-0.5 rounded"
                            title="Editar nome"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      {s.pushName && <p className="text-xs text-muted-foreground truncate">{s.pushName}</p>}
                    </div>
                  </div>

                  <Badge variant={s.paired ? "success" : "destructive"} className="text-[10px]">
                    {s.paired ? "Conectada" : "QR Pending"}
                  </Badge>
                </div>

                {/* ID & Token da instância */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1 min-w-0">
                      <span>ID:</span>
                      <code className="font-mono truncate select-all">{s.id}</code>
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigator.clipboard.writeText(s.id);
                        toast.success("ID da instância copiado");
                      }}
                      className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground shrink-0 ml-1"
                      title="Copiar ID da instância"
                      aria-label="Copiar ID da instância"
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                  </div>

                  {s.token && (
                    <div className="flex items-center justify-between rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 text-[11px]">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Key className="h-3 w-3 text-emerald-600 shrink-0" />
                        <span className="font-semibold text-emerald-700 dark:text-emerald-400 shrink-0">Token:</span>
                        <code className="font-mono text-foreground truncate select-all">{s.token}</code>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigator.clipboard.writeText(s.token || "");
                          toast.success("Token da instância copiado!");
                        }}
                        className="p-1 rounded hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 shrink-0 ml-1"
                        title="Copiar Token da Instância"
                        aria-label="Copiar Token da Instância"
                      >
                        <Copy className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Phone & JID Details */}
                {s.phone && (
                  <div className="rounded-xl bg-muted/40 p-2.5 text-xs text-muted-foreground space-y-0.5">
                    <p className="font-mono font-medium text-foreground">{formatPhoneBR(s.phone)}</p>
                    {cleanStatus ? <p className="italic text-[11px] truncate">"{cleanStatus}"</p> : null}
                  </div>
                )}
              </div>

              {/* Bottom Actions */}
              <div className="flex items-center justify-between pt-4 border-t border-border/50 mt-3">
                {s.paired ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isBusy}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAction(s.id, () => logoutSession(s.id));
                    }}
                    className="text-xs gap-1.5 h-8"
                  >
                    {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Power className="h-3.5 w-3.5" />}
                    Desconectar
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    disabled={isBusy}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAction(s.id, () => pairSession(s.id));
                    }}
                    className="text-xs gap-1.5 h-8 bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <QrCode className="h-3.5 w-3.5" />}
                    Escanear QR
                  </Button>
                )}

                {isAdmin && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      setToDelete(s);
                    }}
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    title="Excluir conta"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* QR Code Scanner Section for Selected Unpaired Session */}
      {selectedSession && !selectedSession.paired && (
        <div className="rounded-2xl border bg-card p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b pb-3">
            <h2 className="text-base font-bold text-foreground flex items-center gap-2">
              <QrCode className="h-5 w-5 text-emerald-600" /> Escanear QR Code para "{selectedSession.name}"
            </h2>
          </div>
          <SessionPairing session={selectedSession} />
        </div>
      )}

      {/* Modal: Criar Nova Sessão */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Criar Nova Sessão do WhatsApp</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Nome da Instância / Linha</label>
              <Input
                value={newSessionName}
                onChange={(e) => setNewSessionName(e.target.value)}
                placeholder="Ex: Comercial, Unidade Centro..."
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Key className="h-3.5 w-3.5 text-emerald-600" /> Token da Instância (Opcional)
              </label>
              <Input
                value={newSessionToken}
                onChange={(e) => setNewSessionToken(e.target.value)}
                placeholder="Deixe em branco para gerar automaticamente"
                className="font-mono text-xs"
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              />
              <p className="text-[11px] text-muted-foreground">
                Usado pelo seu sistema externo para conectar e enviar mensagens diretamente por esta linha.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)} disabled={creating}>
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={creating} className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
              {creating && <Loader2 className="h-4 w-4 animate-spin" />}
              Criar Sessão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Editar Nome da Sessão */}
      <Dialog open={!!editingSession} onOpenChange={(open) => !open && setEditingSession(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Nome da Sessão</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-xs text-muted-foreground">Digite o novo nome para esta sessão:</p>
            <Input
              value={editSessionName}
              onChange={(e) => setEditSessionName(e.target.value)}
              placeholder="Novo nome da conta..."
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleRename()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingSession(null)} disabled={renaming}>
              Cancelar
            </Button>
            <Button onClick={handleRename} disabled={renaming} className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
              {renaming && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Limite de Instâncias Atingido (Upgrade) */}
      <Dialog open={isQuotaModalOpen} onOpenChange={setIsQuotaModalOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2 text-amber-600">
              <AlertCircle className="h-5 w-5" /> Limite de Instâncias Atingido
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-xs">
            <p className="text-muted-foreground leading-relaxed">
              Seu plano atual (<strong>{user?.planName || "Gratuito"}</strong>) permite até{" "}
              <strong>{user?.maxInstances || 1} instância(s)</strong> de WhatsApp conectada(s).
            </p>
            <div className="p-3 bg-muted/40 rounded-xl border space-y-1">
              <div className="text-foreground font-semibold flex items-center justify-between">
                <span>Uso Atual:</span>
                <span className="font-mono text-amber-600 font-bold">{sessions.length} / {user?.maxInstances || 1}</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Para adicionar mais números de WhatsApp ou criar campanhas em larga escala, faça upgrade do seu plano.
              </p>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setIsQuotaModalOpen(false)} className="rounded-xl">
              Fechar
            </Button>
            <Button
              onClick={() => {
                setIsQuotaModalOpen(false);
                toast.info("Entre em contato com o suporte ou administrador para solicitar o upgrade de plano.");
              }}
              className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
            >
              Fazer Upgrade
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog: Delete Session */}
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Excluir conta?"
        description={toDelete ? `A sessão "${toDelete.name}" será desconectada e removida permanentemente.` : undefined}
        confirmLabel="Excluir"
        destructive
        onConfirm={handleDelete}
      />
    </div>
  );
};
