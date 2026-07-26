import { useEffect, useState } from "react";
import { PhoneCall, Phone, Radio, Users } from "lucide-react";
import { Dialer } from "@/components/domain/call/Dialer";
import { CallCard } from "@/components/domain/call/CallCard";
import { OtherCallsList } from "@/components/domain/call/OtherCallsList";
import { HistoryDrawer } from "@/components/domain/history/HistoryDrawer";
import { EmptyState } from "@/components/shared/EmptyState";
import { isMine, useCalls } from "@/stores/calls";
import { useSessions } from "@/stores/sessions";

export const CallsPage = ({ sid }: { sid: string }) => {
  const calls = useCalls((s) => s.calls);
  const sessions = useSessions((s) => s.sessions);
  const [, force] = useState(0);

  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const sessionCalls = calls.filter((c) => c.sessionId === sid && c.status !== "ended");
  const mine = sessionCalls.filter(isMine);
  const others = sessionCalls.filter((c) => !isMine(c));
  const currentSession = sessions.find((s) => s.id === sid);

  return (
    <div className="mx-auto max-w-7xl space-y-6 select-none">
      {/* Top KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Minhas Chamadas</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <PhoneCall className="h-4 w-4" />
            </div>
          </div>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl font-extrabold tracking-tight text-emerald-500">{mine.length}</span>
            <span className="text-xs text-muted-foreground">em andamento</span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">Chamadas sob seu atendimento direto</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Outros Operadores</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <Users className="h-4 w-4" />
            </div>
          </div>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl font-extrabold tracking-tight text-blue-500">{others.length}</span>
            <span className="text-xs text-muted-foreground">ao vivo</span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">Ligação atendida por outros membros</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Linha Conectada</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Radio className="h-4 w-4" />
            </div>
          </div>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-sm font-bold tracking-tight text-foreground truncate">{currentSession?.name || "WhatsApp"}</span>
            <span className="text-xs text-emerald-500 font-medium">{currentSession?.paired ? "Online" : "Desconectado"}</span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">{currentSession?.phone || "Dispositivo conectado"}</p>
        </div>
      </div>

      <div className="flex items-center justify-between border-b border-border/40 pb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <Phone className="w-4 h-4 text-emerald-500" /> Disca-Simples & Celular Virtual
        </h2>
        <HistoryDrawer sid={sid} />
      </div>

      <div className="max-w-3xl mx-auto space-y-6">
        <Dialer sid={sid} />
        {mine.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {mine.map((c) => (
              <CallCard key={c.callId} call={c} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<PhoneCall className="h-6 w-6" />}
            title="Nenhuma chamada ativa no seu ramal"
            description="Digite um número acima ou clique em Fazer Ligação para iniciar."
          />
        )}
        <OtherCallsList calls={others} />
      </div>
    </div>
  );
};
