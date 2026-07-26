import { useState, useEffect } from "react";
import { 
  BarChart3, PhoneCall, PhoneIncoming, PhoneOutgoing, PhoneMissed, Clock, 
  Search, RefreshCw, ChevronLeft, ChevronRight, User as UserIcon,
  CheckCircle2, XCircle, AlertCircle
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { getCallHistoryApi, getCallAnalyticsApi } from "@/services/reports";
import type { CallHistoryItem, CallAnalyticsResponse } from "@/types/call";

export const ReportsPage = () => {
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<CallHistoryItem[]>([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [analytics, setAnalytics] = useState<CallAnalyticsResponse | null>(null);

  // Filters State
  const [search, setSearch] = useState("");
  const [direction, setDirection] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [period, setPeriod] = useState<string>("7d");
  const [page, setPage] = useState(1);
  const limit = 15;

  const getPeriodTimestamps = (p: string) => {
    const now = Date.now();
    if (p === "today") {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      return { startDate: start.getTime(), endDate: now };
    }
    if (p === "7d") {
      return { startDate: now - 7 * 24 * 60 * 60 * 1000, endDate: now };
    }
    if (p === "30d") {
      return { startDate: now - 30 * 24 * 60 * 60 * 1000, endDate: now };
    }
    return { startDate: undefined, endDate: undefined };
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const { startDate, endDate } = getPeriodTimestamps(period);
      
      const [historyRes, analyticsRes] = await Promise.all([
        getCallHistoryApi({
          search: search || undefined,
          direction: direction || undefined,
          status: status || undefined,
          startDate,
          endDate,
          page,
          limit,
        }),
        getCallAnalyticsApi({
          startDate,
          endDate,
        }),
      ]);

      setHistory(historyRes.records);
      setTotalRecords(historyRes.total);
      setAnalytics(analyticsRes);
    } catch (err: any) {
      toast.error(err.message || "Erro ao carregar relatórios.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [page, period, direction, status]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchData();
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds || seconds <= 0) return "00s";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins > 0) {
      return `${mins}m ${secs.toString().padStart(2, "0")}s`;
    }
    return `${secs}s`;
  };

  const formatTimestamp = (ts?: number) => {
    if (!ts) return "--:--";
    return new Date(ts).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const totalPages = Math.ceil(totalRecords / limit) || 1;

  const summary = analytics?.summary;

  return (
    <div className="flex flex-col gap-6 p-6 max-w-7xl mx-auto w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border/40 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2 text-foreground">
            <BarChart3 className="w-7 h-7 text-emerald-500" />
            Relatórios & Analytics de Chamadas
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Acompanhe o desempenho, volume de atendimento, duração e histórico detalhado das ligações.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Período Select */}
          <div className="flex items-center bg-muted rounded-lg p-1 border border-border">
            <button
              onClick={() => { setPeriod("today"); setPage(1); }}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                period === "today" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Hoje
            </button>
            <button
              onClick={() => { setPeriod("7d"); setPage(1); }}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                period === "7d" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              7 Dias
            </button>
            <button
              onClick={() => { setPeriod("30d"); setPage(1); }}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                period === "30d" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              30 Dias
            </button>
            <button
              onClick={() => { setPeriod("all"); setPage(1); }}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                period === "all" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Tudo
            </button>
          </div>

          <Button variant="outline" size="icon" onClick={fetchData} title="Atualizar dados">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Chamadas */}
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total de Ligações</span>
            <div className="p-2.5 bg-emerald-500/10 text-emerald-500 rounded-lg">
              <PhoneCall className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-extrabold tracking-tight text-foreground">
              {summary?.totalCalls || 0}
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-2">
              <span className="flex items-center gap-1 text-emerald-500 font-medium">
                <PhoneIncoming className="w-3.5 h-3.5" /> {summary?.inboundCount || 0} Entrada
              </span>
              <span className="flex items-center gap-1 text-blue-500 font-medium">
                <PhoneOutgoing className="w-3.5 h-3.5" /> {summary?.outboundCount || 0} Saída
              </span>
            </div>
          </div>
        </div>

        {/* Card 2: Chamadas Atendidas */}
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Atendidas</span>
            <div className="p-2.5 bg-emerald-500/10 text-emerald-500 rounded-lg">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-extrabold tracking-tight text-emerald-500">
              {summary?.completedCalls || 0}
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-2">
              <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold px-1.5 py-0.5">
                {(summary?.answerRate || 0).toFixed(1)}% Taxa de Atendimento
              </Badge>
            </div>
          </div>
        </div>

        {/* Card 3: Chamadas Perdidas / Rejeitadas */}
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Perdidas / Rejeitadas</span>
            <div className="p-2.5 bg-rose-500/10 text-rose-500 rounded-lg">
              <PhoneMissed className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-extrabold tracking-tight text-rose-500">
              {(summary?.missedCalls || 0) + (summary?.rejectedCalls || 0)}
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-2">
              <span className="text-rose-400">{summary?.missedCalls || 0} Perdidas</span>
              <span className="text-amber-400">{summary?.rejectedCalls || 0} Rejeitadas</span>
            </div>
          </div>
        </div>

        {/* Card 4: Tempo Médio de Atendimento (TMA) */}
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tempo Médio (TMA)</span>
            <div className="p-2.5 bg-blue-500/10 text-blue-500 rounded-lg">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-extrabold tracking-tight text-foreground">
              {formatDuration(summary?.avgDurationSec)}
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-2">
              <span>TME Médio de Espera: <strong>{summary?.avgWaitSec || 0}s</strong></span>
            </div>
          </div>
        </div>
      </div>

      {/* Desempenho por Agente / Sessão (Se houver dados) */}
      {analytics && analytics.byAgent.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-2">
            <UserIcon className="w-4 h-4 text-emerald-500" />
            Desempenho por Agente / Operador
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {analytics.byAgent.map((agent, idx) => (
              <div key={idx} className="bg-muted/50 border border-border/60 rounded-lg p-4 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-sm text-foreground">{agent.owner || "Sem Agente Atribuído"}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {agent.completedCalls} de {agent.totalCalls} atendidas ({agent.answerRate.toFixed(0)}%)
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-sm font-bold text-emerald-500">{formatDuration(agent.totalDurationSec)}</p>
                  <p className="text-[10px] text-muted-foreground">TMA: {formatDuration(agent.avgDurationSec)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters & History Table */}
      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        {/* Filter Bar */}
        <div className="p-4 border-b border-border bg-muted/30 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <form onSubmit={handleSearchSubmit} className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Buscar por nome ou número..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-background"
            />
          </form>

          <div className="flex flex-wrap items-center gap-2">
            {/* Direção Filter */}
            <select
              value={direction}
              onChange={(e) => { setDirection(e.target.value); setPage(1); }}
              className="h-9 px-3 rounded-md border border-input bg-background text-xs font-medium text-foreground shadow-sm focus:outline-none"
            >
              <option value="">Todas Direções</option>
              <option value="inbound">📥 Entrada (Recebidas)</option>
              <option value="outbound">📤 Saída (Efetuadas)</option>
            </select>

            {/* Status Filter */}
            <select
              value={status}
              onChange={(e) => { setStatus(e.target.value); setPage(1); }}
              className="h-9 px-3 rounded-md border border-input bg-background text-xs font-medium text-foreground shadow-sm focus:outline-none"
            >
              <option value="">Todos os Status</option>
              <option value="connected">✅ Atendidas</option>
              <option value="ended">🏁 Encerradas</option>
              <option value="ringing">🔔 Tocando</option>
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 border-b border-border text-xs uppercase tracking-wider text-muted-foreground font-semibold">
              <tr>
                <th className="py-3 px-4">Contato / Cliente</th>
                <th className="py-3 px-4">Linha Plataforma</th>
                <th className="py-3 px-4">Direção</th>
                <th className="py-3 px-4">Agente</th>
                <th className="py-3 px-4">Horário</th>
                <th className="py-3 px-4">Duração</th>
                <th className="py-3 px-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-muted-foreground">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-500" />
                    Carregando histórico de ligações...
                  </td>
                </tr>
              ) : history.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-muted-foreground">
                    <PhoneCall className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    Nenhuma chamada registrada para os filtros selecionados.
                  </td>
                </tr>
              ) : (
                history.map((call) => {
                  const isConnected = call.connectedAt || call.status === "connected";
                  const isOutbound = call.direction === "outbound";
                  const durationSec = call.connectedAt && call.endedAt 
                    ? Math.max(0, Math.floor((call.endedAt - call.connectedAt) / 1000))
                    : 0;

                  return (
                    <tr key={call.callId} className="hover:bg-muted/30 transition-colors">
                      {/* Contato com Avatar Redondo */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          {call.pictureUrl ? (
                            <img
                              src={call.pictureUrl}
                              alt={call.name || call.peer}
                              className="w-9 h-9 rounded-full object-cover border border-border shadow-xs"
                            />
                          ) : (
                            <div className="w-9 h-9 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold text-xs border border-emerald-500/20">
                              {(call.name || call.peer || "?").charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <p className="font-semibold text-foreground leading-tight">
                              {call.name || "Contato WhatsApp"}
                            </p>
                            <p className="font-mono text-xs text-muted-foreground">
                              {call.peer.replace("@s.whatsapp.net", "").replace("@lid", "")}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Linha Plataforma */}
                      <td className="py-3 px-4">
                        <div className="flex flex-col">
                          <span className="font-semibold text-xs text-foreground">{call.sessionName || "WhatsApp"}</span>
                          <span className="font-mono text-[11px] text-muted-foreground">{call.sessionPhone || call.sessionId.slice(0, 8)}</span>
                        </div>
                      </td>

                      {/* Direção */}
                      <td className="py-3 px-4">
                        {isOutbound ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-rose-500 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded-md">
                            <PhoneOutgoing className="w-3 h-3 text-rose-500" /> Saída
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md">
                            <PhoneIncoming className="w-3 h-3 text-emerald-500" /> Entrada
                          </span>
                        )}
                      </td>

                      {/* Agente */}
                      <td className="py-3 px-4">
                        {call.owner ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-foreground bg-muted px-2.5 py-1 rounded-md border border-border">
                            <UserIcon className="w-3 h-3 text-emerald-500" /> {call.owner}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">Não atribuído</span>
                        )}
                      </td>

                      {/* Horário */}
                      <td className="py-3 px-4 font-mono text-xs text-muted-foreground whitespace-nowrap">
                        {formatTimestamp(call.startedAt)}
                      </td>

                      {/* Duração */}
                      <td className="py-3 px-4 font-mono text-xs font-bold text-foreground">
                        {isConnected ? (
                          <span className="text-emerald-500">{formatDuration(durationSec)}</span>
                        ) : (
                          <span className="text-muted-foreground font-normal">--</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4">
                        {isConnected ? (
                          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 gap-1 font-medium">
                            <CheckCircle2 className="w-3 h-3" /> Atendida
                          </Badge>
                        ) : call.status === "ringing" ? (
                          <Badge variant="secondary" className="bg-blue-500/10 text-blue-500 border-blue-500/30 gap-1 font-medium">
                            <AlertCircle className="w-3 h-3 animate-pulse" /> Tocando
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-rose-500/10 text-rose-500 border-rose-500/30 gap-1 font-medium">
                            <XCircle className="w-3 h-3" /> {call.endReason?.includes("declined") ? "Rejeitada" : "Perdida"}
                          </Badge>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="p-4 border-t border-border bg-muted/20 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            Exibindo <strong>{history.length}</strong> de <strong>{totalRecords}</strong> ligações registradas
          </span>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="h-8 text-xs gap-1"
            >
              <ChevronLeft className="w-4 h-4" /> Anterior
            </Button>
            <span className="text-xs font-mono text-muted-foreground px-2">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="h-8 text-xs gap-1"
            >
              Próxima <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
