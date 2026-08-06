import { useState, useEffect } from "react";
import { Smartphone, Plus, Pencil, Trash2, Power, QrCode, Loader2, CheckCircle2, AlertCircle, Radio, Bot, Save, Key } from "lucide-react";
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

  // AI Settings State
  const [groqApiKey, setGroqApiKey] = useState("");
  const [whisperModel, setWhisperModel] = useState("whisper-large-v3-turbo");
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    getAISettings()
      .then((res) => {
        if (res.groqApiKey) setGroqApiKey(res.groqApiKey);
        if (res.whisperModel) setWhisperModel(res.whisperModel);
      })
      .catch(() => {});
  }, []);

  const handleSaveAISettings = async () => {
    setSavingSettings(true);
    try {
      await saveAISettings({ groqApiKey, whisperModel });
      toast.success("Configurações da IA de Transcrição salvas com sucesso!");
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar configurações.");
    } finally {
      setSavingSettings(false);
    }
  };

  // New Session Modal
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newSessionName, setNewSessionName] = useState("");

  // Edit Session Name Modal
  const [editingSession, setEditingSession] = useState<SessionInfo | null>(null);
  const [editSessionName, setEditSessionName] = useState("");

  // Delete Confirmation
  const [toDelete, setToDelete] = useState<SessionInfo | null>(null);

  const handleOpenCreate = () => {
    setNewSessionName(`WhatsApp ${sessions.length + 1}`);
    setIsCreateOpen(true);
  };

  const handleCreate = async () => {
    const nameToUse = newSessionName.trim() || `WhatsApp ${sessions.length + 1}`;
    setCreating(true);
    try {
      const { id } = await createSession(nameToUse);
      setActiveSession(id);
      setIsCreateOpen(false);
      toast.success("Sessão criada com sucesso!");
    } catch (e: any) {
      toast.error(e.message || "Erro ao criar sessão.");
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
        {/* Card 1: Total de Contas */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Total de Contas</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Smartphone className="h-4 w-4" />
            </div>
          </div>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl font-extrabold tracking-tight text-foreground">{sessions.length}</span>
            <span className="text-xs text-muted-foreground">instâncias</span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">Sessões registradas no sistema</p>
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

      {/* Card: Configuração da IA de Transcrição (Groq / Whisper) */}
      <div className="rounded-2xl border border-emerald-500/30 bg-card p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/50 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">Configuração da IA de Transcrição (Groq / Whisper)</h3>
              <p className="text-xs text-muted-foreground">Insira sua chave de API para habilitar a transcrição automática das ligações</p>
            </div>
          </div>
          <Badge variant="outline" className="w-fit text-xs bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
            Groq Whisper API
          </Badge>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
          <div className="sm:col-span-8 space-y-1.5">
            <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Key className="h-3.5 w-3.5 text-emerald-500" /> Chave de API do Groq (Groq API Key)
            </label>
            <Input
              type="password"
              value={groqApiKey}
              onChange={(e) => setGroqApiKey(e.target.value)}
              placeholder="gsk_..."
              className="text-xs font-mono"
            />
          </div>

          <div className="sm:col-span-4 flex items-center gap-2">
            <Button
              onClick={handleSaveAISettings}
              disabled={savingSettings}
              className="w-full h-9 text-xs gap-2 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
            >
              {savingSettings ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Salvar API Key
            </Button>
          </div>
        </div>
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
          <div className="space-y-3 py-2">
            <p className="text-xs text-muted-foreground">Informe o nome de identificação para esta conta/sessão:</p>
            <Input
              value={newSessionName}
              onChange={(e) => setNewSessionName(e.target.value)}
              placeholder="Ex: Comercial, Suporte, Vendas..."
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
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
