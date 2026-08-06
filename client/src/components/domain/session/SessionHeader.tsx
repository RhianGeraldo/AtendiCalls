import { useState } from "react";
import { Loader2, Power, QrCode, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { logoutSession, pairSession, renameSession } from "@/services/sessions";
import type { SessionInfo, SessionState } from "@/types/session";

const statusLabel: Record<SessionState, string> = {
  open: "Conectado",
  qr: "Escanear QR",
  connecting: "Conectando…",
  logged_out: "Desconectado",
};

const statusVariant: Record<SessionState, "success" | "secondary" | "muted" | "destructive"> = {
  open: "success",
  qr: "secondary",
  connecting: "muted",
  logged_out: "destructive",
};

function formatPhoneBR(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.startsWith("55") && digits.length >= 12) {
    const ddd = digits.slice(2, 4);
    const rest = digits.slice(4);
    if (rest.length === 8) {
      return `+55 (${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
    }
    return `+55 (${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`;
  }
  return raw;
}

export const SessionHeader = ({ session }: { session: SessionInfo }) => {
  const [busy, setBusy] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [nameInput, setNameInput] = useState(session.name);
  const [renaming, setRenaming] = useState(false);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleSaveName = async () => {
    const trimmed = nameInput.trim();
    if (!trimmed) {
      toast.error("O nome da sessão não pode ficar em branco.");
      return;
    }
    setRenaming(true);
    try {
      await renameSession(session.id, trimmed);
      setIsEditing(false);
      toast.success("Sessão renomeada!");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRenaming(false);
    }
  };

  const cleanStatus = session.statusText?.replace(/^"|"$/g, "").trim();

  return (
    <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 select-none">
      <div className="flex min-w-0 items-center gap-3">
        {/* Connected Account Avatar */}
        {session.pictureUrl ? (
          <img
            src={session.pictureUrl}
            alt={session.pushName || session.name}
            className="h-11 w-11 rounded-2xl object-cover border-2 border-emerald-500/40 shadow-sm shrink-0"
          />
        ) : (
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 font-bold border border-emerald-500/20">
            {session.name.slice(0, 2).toUpperCase()}
          </div>
        )}

        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-xl font-semibold tracking-tight">{session.name}</h1>
            <button
              type="button"
              onClick={() => {
                setNameInput(session.name);
                setIsEditing(true);
              }}
              className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-muted"
              title="Renomear sessão"
              aria-label="Renomear sessão"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <Badge variant={statusVariant[session.state]}>{statusLabel[session.state]}</Badge>
          </div>

          {(session.pushName || session.phone) && (
            <p className="text-xs text-muted-foreground truncate">
              {session.pushName ? <span className="font-medium text-foreground">{session.pushName} • </span> : ""}
              {session.phone ? formatPhoneBR(session.phone) : ""}
              {cleanStatus ? <span className="italic"> — "{cleanStatus}"</span> : ""}
            </p>
          )}
        </div>
      </div>

      {session.paired ? (
        <Button variant="outline" size="sm" disabled={busy} onClick={() => run(() => logoutSession(session.id))}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
          Desconectar
        </Button>
      ) : (
        <Button size="sm" disabled={busy} onClick={() => run(() => pairSession(session.id))}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
          Reativar / QR
        </Button>
      )}

      {/* Modal: Editar Nome da Sessão */}
      <Dialog open={isEditing} onOpenChange={setIsEditing}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Nome da Sessão</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-xs text-muted-foreground">Altere a identificação desta conta:</p>
            <Input
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="Nome da sessão..."
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleSaveName()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditing(false)} disabled={renaming}>
              Cancelar
            </Button>
            <Button onClick={handleSaveName} disabled={renaming} className="gap-2">
              {renaming && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
