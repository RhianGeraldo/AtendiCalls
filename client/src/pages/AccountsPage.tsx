import { useState } from "react";
import { Smartphone, Plus, Pencil, Trash2, Power, QrCode, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { SessionPairing } from "@/components/domain/session/SessionPairing";
import { useSessions, setActiveSession } from "@/stores/sessions";
import { createSession, deleteSession, logoutSession, pairSession, renameSession } from "@/services/sessions";
import { useAuth } from "@/stores/auth";
import { formatPhoneBR } from "@/utils/format";
import type { SessionInfo } from "@/types/session";

export const AccountsPage = () => {
  const user = useAuth((s) => s.user);
  const isAdmin = user?.role === "admin";

  const sessions = useSessions((s) => s.sessions);
  const activeId = useSessions((s) => s.activeId);

  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [busySessionId, setBusySessionId] = useState<string | null>(null);

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
      toast.success("Sessão renomeada com sucesso!");
    } catch (e: any) {
      toast.error(e.message || "Erro ao renomear sessão.");
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
    <div className="mx-auto max-w-5xl space-y-6 p-2 select-none">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-muted/60 pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Smartphone className="h-6 w-6 text-emerald-600 dark:text-emerald-400" /> Contas WhatsApp Conectadas
          </h1>
          <p className="text-xs text-muted-foreground">
            Gerencie suas instâncias de WhatsApp, escaneie QR Codes e configure linhas de atendimento.
          </p>
        </div>

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
                    {s.statusText && <p className="italic text-[11px] truncate">"{s.statusText}"</p>}
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
