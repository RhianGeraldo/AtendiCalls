import { useEffect, useState } from "react";
import { PhoneCall, PhoneIncoming, PhoneOutgoing, LayoutGrid, List, Search, Radio, PhoneOff, User as UserIcon, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CallCard } from "@/components/domain/call/CallCard";
import { useCalls } from "@/stores/calls";
import { useSessions } from "@/stores/sessions";
import { useDialerStore } from "@/stores/dialer";
import { useEndCall } from "@/hooks/useEndCall";
import { formatCallDuration } from "@/utils/format";

export const CallsPage = () => {
  const calls = useCalls((s) => s.calls);
  const sessions = useSessions((s) => s.sessions);
  const openDialer = useDialerStore((s) => s.openDialer);
  const endCall = useEndCall();

  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [search, setSearch] = useState("");
  const [, force] = useState(0);

  // Live timer tick every 1 second
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // Filter all active calls in the entire system (not ended)
  const activeCalls = calls.filter((c) => c.status !== "ended");

  // Search filter
  const filteredCalls = activeCalls.filter((c) => {
    if (!search.trim()) return true;
    const query = search.toLowerCase();
    const name = (c.name || "").toLowerCase();
    const peer = (c.peer || "").toLowerCase();
    const sessionName = (c.sessionName || "").toLowerCase();
    const sessionPhone = (c.sessionPhone || "").toLowerCase();
    return name.includes(query) || peer.includes(query) || sessionName.includes(query) || sessionPhone.includes(query);
  });

  const inboundCount = activeCalls.filter((c) => c.direction === "inbound").length;
  const outboundCount = activeCalls.filter((c) => c.direction === "outbound").length;

  const busySessionIds = new Set(activeCalls.map((c) => c.sessionId));
  const busySessionsCount = busySessionIds.size;

  return (
    <div className="mx-auto max-w-7xl space-y-6 select-none">
      {/* Top KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Card 1: Chamadas Ao Vivo */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Chamadas Ao Vivo</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
              <PhoneCall className="h-4 w-4" />
            </div>
          </div>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl font-extrabold tracking-tight text-emerald-500">{activeCalls.length}</span>
            <span className="text-xs font-semibold text-emerald-500 flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping inline-block" />
              Monitorando
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">Ligações em andamento no sistema</p>
        </div>

        {/* Card 2: Entrada vs Saída */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Tráfego de Linhas</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-500">
              <Radio className="h-4 w-4" />
            </div>
          </div>
          <div className="flex items-center gap-4 mt-2">
            <span className="flex items-center gap-1 text-sm font-bold text-emerald-500">
              <PhoneIncoming className="w-4 h-4" /> {inboundCount} Entrada
            </span>
            <span className="flex items-center gap-1 text-sm font-bold text-rose-500">
              <PhoneOutgoing className="w-4 h-4" /> {outboundCount} Saída
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">Distribuição das chamadas ativas</p>
        </div>

        {/* Card 3: Linhas WhatsApp Ocupadas */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Linhas Ocupadas</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
              <AlertCircle className="h-4 w-4" />
            </div>
          </div>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl font-extrabold tracking-tight text-amber-500">{busySessionsCount}</span>
            <span className="text-xs text-muted-foreground">de {sessions.length} contas</span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">Instâncias com tráfego no momento</p>
        </div>
      </div>

      {/* Action Bar & View Switcher */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-4 rounded-xl border border-border bg-card shadow-sm">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Buscar por contato, número ou linha..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-background"
          />
        </div>

        {/* View Mode Controls */}
        <div className="flex items-center justify-between sm:justify-end gap-3">
          <div className="flex items-center bg-muted rounded-lg p-1 border border-border">
            <button
              onClick={() => setViewMode("grid")}
              className={`p-1.5 rounded-md transition-all ${
                viewMode === "grid" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
              }`}
              title="Visualização em Cards"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`p-1.5 rounded-md transition-all ${
                viewMode === "list" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
              }`}
              title="Visualização em Lista / Tabela"
            >
              <List className="w-4 h-4" />
            </button>
          </div>

          <Button onClick={() => openDialer()} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 shadow-xs">
            <PhoneCall className="w-4 h-4" /> Fazer Ligação
          </Button>
        </div>
      </div>

      {/* Active Calls Display Section */}
      {filteredCalls.length === 0 ? (
        /* Empty State */
        <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center shadow-xs flex flex-col items-center justify-center gap-3">
          <div className="h-14 w-14 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center border border-emerald-500/20 shadow-xs animate-pulse">
            <PhoneCall className="w-7 h-7" />
          </div>
          <div>
            <h3 className="font-bold text-lg text-foreground">Nenhuma chamada em andamento no momento</h3>
            <p className="text-xs text-muted-foreground max-w-md mx-auto mt-1">
              Todas as ligações ativas efetuadas ou recebidas serão exibidas aqui em tempo real com controle de áudio e status ao vivo.
            </p>
          </div>
          <Button onClick={() => openDialer()} variant="outline" className="mt-2 gap-2 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10">
            <PhoneCall className="w-4 h-4" /> Efetuar Chamada Agora
          </Button>
        </div>
      ) : viewMode === "grid" ? (
        /* Grid of Active Call Cards */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCalls.map((call) => (
            <CallCard key={call.callId} call={call} />
          ))}
        </div>
      ) : (
        /* Table List of Active Calls */
        <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-left text-sm border-collapse">
            <thead className="bg-muted/80 border-b border-border text-xs uppercase tracking-wider text-muted-foreground font-semibold">
              <tr>
                <th className="py-3 px-4">Contato</th>
                <th className="py-3 px-4">Conta / Linha</th>
                <th className="py-3 px-4">Direção</th>
                <th className="py-3 px-4">Agente</th>
                <th className="py-3 px-4">Duração Ao Vivo</th>
                <th className="py-3 px-4 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {filteredCalls.map((call) => {
                const isConnected = call.connectedAt || call.status === "connected";
                const isOutbound = call.direction === "outbound";
                const rawPhone = call.peer.replace("@s.whatsapp.net", "").replace("@lid", "");

                const sess = sessions.find((s) => s.id === call.sessionId);
                const accountPic = call.sessionPictureUrl || sess?.pictureUrl;
                const accountName = call.sessionName || sess?.name || "WhatsApp";
                const accountPhone = call.sessionPhone || sess?.phone || call.sessionId.slice(0, 8);

                return (
                  <tr key={call.callId} className="hover:bg-muted/30 transition-colors">
                    {/* Contato */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-9 w-9 shrink-0 rounded-full overflow-hidden border border-border bg-muted/20 shadow-xs flex items-center justify-center">
                          {call.pictureUrl ? (
                            <img src={call.pictureUrl} alt={call.name || rawPhone} className="h-full w-full rounded-full object-cover" />
                          ) : (
                            <div className="h-full w-full rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold text-xs">
                              {(call.name || rawPhone || "?").charAt(0).toUpperCase()}
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-xs text-foreground truncate">{call.name || "Contato WhatsApp"}</p>
                          <p className="font-mono text-[11px] text-muted-foreground mt-0.5 truncate">{rawPhone}</p>
                        </div>
                      </div>
                    </td>

                    {/* Conta / Linha */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="h-8 w-8 shrink-0 rounded-full overflow-hidden border border-border bg-muted flex items-center justify-center">
                          {accountPic ? (
                            <img src={accountPic} alt={accountName} className="h-full w-full object-cover" />
                          ) : (
                            <div className="h-full w-full bg-blue-500/10 text-blue-600 font-bold text-xs flex items-center justify-center">
                              {accountName.charAt(0).toUpperCase()}
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-xs text-foreground truncate">{accountName}</p>
                          <p className="font-mono text-[10px] text-muted-foreground truncate">{accountPhone}</p>
                        </div>
                      </div>
                    </td>

                    {/* Direção */}
                    <td className="py-3 px-4 whitespace-nowrap">
                      {isOutbound ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-500 bg-rose-500/10 border border-rose-500/20 px-2.5 py-1 rounded-md">
                          <PhoneOutgoing className="w-3.5 h-3.5" /> Saída
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-md">
                          <PhoneIncoming className="w-3.5 h-3.5" /> Entrada
                        </span>
                      )}
                    </td>

                    {/* Agente */}
                    <td className="py-3 px-4 whitespace-nowrap">
                      {call.owner ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-foreground bg-muted px-2.5 py-1 rounded-md border border-border">
                          <UserIcon className="w-3 h-3 text-emerald-500" /> {call.owner}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">Não atribuído</span>
                      )}
                    </td>

                    {/* Duração Ao Vivo */}
                    <td className="py-3 px-4 whitespace-nowrap">
                      <Badge
                        variant="outline"
                        className={
                          isConnected
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 font-mono font-bold text-xs px-2.5 py-0.5"
                            : "bg-blue-500/10 text-blue-500 border-blue-500/30 animate-pulse font-mono text-xs px-2.5 py-0.5"
                        }
                      >
                        {formatCallDuration(call.startedAt, call.status, call.connectedAt)}
                      </Badge>
                    </td>

                    {/* Encerrar */}
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => endCall.mutate({ sid: call.sessionId, callId: call.callId })}
                            className="bg-rose-600 hover:bg-rose-700 text-white gap-1.5 rounded-lg text-xs"
                          >
                            <PhoneOff className="h-3.5 w-3.5" /> Encerrar
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Desconectar chamada agora</TooltipContent>
                      </Tooltip>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
