import {
  LayoutDashboard,
  PhoneCall,
  PhoneIncoming,
  PhoneOutgoing,
  Clock,
  CheckCircle2,
  Smartphone,
  TrendingUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useCalls } from "@/stores/calls";
import { useSessions } from "@/stores/sessions";
import { formatPhoneBR } from "@/utils/format";

export const DashboardPage = () => {
  const calls = useCalls((s) => s.calls);
  const sessions = useSessions((s) => s.sessions);

  const activeSessions = sessions.filter((s) => s.paired);
  const activeCalls = calls.filter((c) => c.status === "connected" || c.status === "ringing");
  const completedCalls = calls.filter((c) => c.status === "ended");

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-2 select-none">
      {/* Top Title Bar */}
      <div className="flex flex-col gap-1 border-b border-muted/60 pb-4">
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <LayoutDashboard className="h-6 w-6 text-emerald-600 dark:text-emerald-400" /> Dashboard de Métricas
        </h1>
        <p className="text-xs text-muted-foreground">
          Visão geral do desempenho de chamadas, contas ativas e tráfego em tempo real.
        </p>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Contas Ativas */}
        <div className="rounded-2xl border bg-card p-4 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Contas WhatsApp</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Smartphone className="h-4 w-4" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold tracking-tight text-foreground">{activeSessions.length}</span>
            <span className="text-[11px] text-muted-foreground">de {sessions.length} cadastradas</span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>{activeSessions.length > 0 ? "Sessões operacionais" : "Nenhuma conta pronta"}</span>
          </div>
        </div>

        {/* Card 2: Chamadas Ativas Agora */}
        <div className="rounded-2xl border bg-card p-4 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Em Chamada Agora</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <PhoneCall className="h-4 w-4 animate-pulse" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold tracking-tight text-foreground">{activeCalls.length}</span>
            <span className="text-[11px] text-muted-foreground">ao vivo</span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-amber-600 dark:text-amber-400 font-medium">
            <TrendingUp className="h-3.5 w-3.5" />
            <span>{activeCalls.length > 0 ? "Mídia em progresso" : "Linhas livres"}</span>
          </div>
        </div>

        {/* Card 3: Total Concluídas */}
        <div className="rounded-2xl border bg-card p-4 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Chamadas Registradas</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <PhoneOutgoing className="h-4 w-4" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold tracking-tight text-foreground">{calls.length}</span>
            <span className="text-[11px] text-muted-foreground">histórico total</span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-blue-600 dark:text-blue-400 font-medium">
            <Clock className="h-3.5 w-3.5" />
            <span>{completedCalls.length} finalizadas</span>
          </div>
        </div>

        {/* Card 4: Taxa de Sucesso */}
        <div className="rounded-2xl border bg-card p-4 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Taxa de Conexão</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold tracking-tight text-foreground">
              {calls.length > 0 ? `${Math.round((completedCalls.length / calls.length) * 100)}%` : "100%"}
            </span>
            <span className="text-[11px] text-muted-foreground">qualidade WebRTC</span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>Opus / MLow Codec</span>
          </div>
        </div>
      </div>

      {/* Accounts & Active Traffic Breakdown */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Contas Conectadas */}
        <div className="rounded-2xl border bg-card p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Smartphone className="h-4 w-4 text-emerald-600" /> Contas Conectadas no WhatsApp
            </h2>
            <Badge variant="outline" className="text-[10px]">
              {activeSessions.length} ativas
            </Badge>
          </div>

          <div className="space-y-3">
            {sessions.map((s) => (
              <div key={s.id} className="flex items-center justify-between p-2.5 rounded-xl border bg-muted/20">
                <div className="flex items-center gap-3 min-w-0">
                  {s.pictureUrl ? (
                    <img src={s.pictureUrl} alt={s.name} className="h-9 w-9 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 font-bold border border-emerald-500/20">
                      {s.name.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="font-semibold text-xs text-foreground truncate">{s.name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {s.pushName ? `${s.pushName} • ` : ""}
                      {s.phone ? formatPhoneBR(s.phone) : s.jid.split("@")[0]}
                    </p>
                  </div>
                </div>
                <Badge variant={s.paired ? "success" : "destructive"} className="text-[10px]">
                  {s.paired ? "Conectada" : "Desconectada"}
                </Badge>
              </div>
            ))}
            {sessions.length === 0 && (
              <p className="py-4 text-center text-xs text-muted-foreground">Nenhuma conta cadastrada.</p>
            )}
          </div>
        </div>

        {/* Tráfego de Chamadas Recentes */}
        <div className="rounded-2xl border bg-card p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <PhoneIncoming className="h-4 w-4 text-emerald-600" /> Tráfego Recente de Chamadas
            </h2>
            <Badge variant="outline" className="text-[10px]">
              {calls.length} no histórico
            </Badge>
          </div>

          <div className="space-y-3">
            {calls.slice(0, 5).map((c) => (
              <div key={c.callId} className="flex items-center justify-between p-2.5 rounded-xl border bg-muted/20">
                <div className="flex items-center gap-3 min-w-0">
                  {c.pictureUrl ? (
                    <img src={c.pictureUrl} alt={c.name || c.peer} className="h-9 w-9 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground font-bold">
                      <PhoneCall className="h-4 w-4" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="font-semibold text-xs text-foreground truncate">
                      {c.name || formatPhoneBR(c.peer.split("@")[0])}
                    </p>
                    <p className="text-[11px] text-muted-foreground font-mono">
                      {formatPhoneBR(c.peer.split("@")[0])}
                    </p>
                  </div>
                </div>
                <Badge variant={c.status === "connected" ? "success" : c.status === "ringing" ? "secondary" : "muted"} className="text-[10px] capitalize">
                  {c.status === "connected" ? "Em Chamada" : c.status === "ringing" ? "Chamando..." : "Finalizada"}
                </Badge>
              </div>
            ))}
            {calls.length === 0 && (
              <p className="py-4 text-center text-xs text-muted-foreground">Nenhuma chamada realizada ainda.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
