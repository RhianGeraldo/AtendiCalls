import { useState, useEffect } from "react";
import { 
  BarChart3, PhoneCall, PhoneIncoming, PhoneOutgoing, PhoneMissed, Clock, 
  Search, RefreshCw, ChevronLeft, ChevronRight, CheckCircle2, XCircle, AlertCircle, User as UserIcon
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useSessions } from "@/stores/sessions";
import { getCallHistoryApi, getCallAnalyticsApi } from "@/services/reports";
import type { CallHistoryItem, CallAnalyticsResponse } from "@/types/call";

export const ReportsPage = () => {
  const sessions = useSessions((s) => s.sessions);
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

  const formatDuration = (sec?: number) => {
    if (!sec || sec <= 0) return "0s";
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  const formatTimestamp = (ts: number) => {
    if (!ts) return "--";
    const date = new Date(ts);
    return date.toLocaleString("pt-BR", {
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
    <div className="flex flex-col gap-6 p-6 max-w-7xl mx-auto w-full h-[calc(100vh-4rem)] overflow-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border/40 pb-5 shrink-0">
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 shrink-0">
        {/* Card 1: Total Chamadas */}
        <div className="bg-card border border-border rounded-xl p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total de Ligações</span>
            <div className="p-2 bg-emerald-500/10 text-emerald-500 rounded-lg">
              <PhoneCall className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-extrabold tracking-tight text-foreground">
              {summary?.totalCalls || 0}
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1.5">
              <span className="flex items-center gap-1 text-emerald-500 font-medium">
                <PhoneIncoming className="w-3 h-3" /> {summary?.inboundCount || 0} Entrada
              </span>
              <span className="flex items-center gap-1 text-rose-500 font-medium">
                <PhoneOutgoing className="w-3 h-3" /> {summary?.outboundCount || 0} Saída
              </span>
            </div>
          </div>
        </div>

        {/* Card 2: Chamadas Atendidas */}
        <div className="bg-card border border-border rounded-xl p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Atendidas</span>
            <div className="p-2 bg-emerald-500/10 text-emerald-500 rounded-lg">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-extrabold tracking-tight text-emerald-500">
              {summary?.completedCalls || 0}
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1.5">
              <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold px-1.5 py-0.5">
                {(summary?.answerRate || 0).toFixed(1)}% Taxa de Atendimento
              </Badge>
            </div>
          </div>
        </div>

        {/* Card 3: Chamadas Perdidas / Rejeitadas */}
        <div className="bg-card border border-border rounded-xl p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Perdidas / Rejeitadas</span>
            <div className="p-2 bg-rose-500/10 text-rose-500 rounded-lg">
              <PhoneMissed className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-extrabold tracking-tight text-rose-500">
              {(summary?.missedCalls || 0) + (summary?.rejectedCalls || 0)}
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1.5">
              <span className="text-rose-400">{summary?.missedCalls || 0} Perdidas</span>
              <span className="text-amber-400">{summary?.rejectedCalls || 0} Rejeitadas</span>
            </div>
          </div>
        </div>

        {/* Card 4: Tempo Médio de Atendimento (TMA) */}
        <div className="bg-card border border-border rounded-xl p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tempo Médio (TMA)</span>
            <div className="p-2 bg-blue-500/10 text-blue-500 rounded-lg">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-extrabold tracking-tight text-foreground">
              {formatDuration(summary?.avgDurationSec)}
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1.5">
              <span>TME Médio de Espera: <strong>{summary?.avgWaitSec || 0}s</strong></span>
            </div>
          </div>
        </div>
      </div>

      {/* Filters & History Table Container */}
      <div className="bg-card border border-border rounded-xl shadow-sm flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* Filter Bar */}
        <div className="p-4 border-b border-border bg-muted/30 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 shrink-0">
          <form onSubmit={handleSearchSubmit} className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Buscar por contato ou conta..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-background"
            />
          </form>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={direction}
              onChange={(e) => { setDirection(e.target.value); setPage(1); }}
              className="h-9 px-3 rounded-md border border-input bg-background text-xs font-medium text-foreground shadow-sm focus:outline-none"
            >
              <option value="">Todas Direções</option>
              <option value="inbound">📥 Entrada</option>
              <option value="outbound">📤 Saída</option>
            </select>

            <select
              value={status}
              onChange={(e) => { setStatus(e.target.value); setPage(1); }}
              className="h-9 px-3 rounded-md border border-input bg-background text-xs font-medium text-foreground shadow-sm focus:outline-none"
            >
              <option value="">Todos os Status</option>
              <option value="connected">✅ Atendidas</option>
              <option value="ringing">🔔 Tocando</option>
            </select>
          </div>
        </div>

        {/* Table Wrapper with internal scrolling */}
        <div className="overflow-auto flex-1 min-h-0">
          <table className="w-full text-left text-sm relative border-collapse">
            <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur-xs border-b border-border text-xs uppercase tracking-wider text-muted-foreground font-semibold shadow-xs">
              <tr>
                <th className="py-3 px-4">Contato</th>
                <th className="py-3 px-4">Conta</th>
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
                    Carregando histórico...
                  </td>
                </tr>
              ) : history.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-muted-foreground">
                    <PhoneCall className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    Nenhuma chamada encontrada.
                  </td>
                </tr>
              ) : (
                history.map((call) => {
                  const isConnected = call.connectedAt || call.status === "connected";
                  const isOutbound = call.direction === "outbound";
                  const durationSec = call.connectedAt && call.endedAt 
                    ? Math.max(0, Math.floor((call.endedAt - call.connectedAt) / 1000))
                    : 0;

                  const sess = sessions.find((s) => s.id === call.sessionId);
                  const accountPic = call.sessionPictureUrl || sess?.pictureUrl;
                  const accountName = call.sessionName || sess?.name || "WhatsApp";
                  const accountPhone = call.sessionPhone || sess?.phone || (sess?.jid ? sess.jid.split("@")[0] : call.sessionId.slice(0, 8));

                  return (
                    <tr key={call.callId} className="hover:bg-muted/30 transition-colors">
                      {/* Contato com Avatar Redondo h-10 w-10 */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="h-10 w-10 shrink-0 rounded-full overflow-hidden border border-border bg-muted/20 shadow-xs flex items-center justify-center">
                            {call.pictureUrl ? (
                              <img
                                src={call.pictureUrl}
                                alt={call.name || call.peer}
                                className="h-full w-full rounded-full object-cover"
                              />
                            ) : (
                              <div className="h-full w-full rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold text-xs border border-emerald-500/20">
                                {(call.name || call.peer || "?").charAt(0).toUpperCase()}
                              </div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-foreground text-xs leading-tight truncate">
                              {call.name || "Contato WhatsApp"}
                            </p>
                            <p className="font-mono text-[11px] text-muted-foreground mt-0.5 truncate">
                              {call.peer.replace("@s.whatsapp.net", "").replace("@lid", "")}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Conta Plataforma com Avatar Redondo h-10 w-10 */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="h-10 w-10 shrink-0 rounded-full overflow-hidden border border-border bg-muted/20 shadow-xs flex items-center justify-center">
                            {accountPic ? (
                              <img
                                src={accountPic}
                                alt={accountName}
                                className="h-full w-full rounded-full object-cover"
                              />
                            ) : (
                              <div className="h-full w-full rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-xs border border-blue-500/20">
                                {accountName.charAt(0).toUpperCase()}
                              </div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-foreground text-xs leading-tight truncate">
                              {accountName}
                            </p>
                            <p className="font-mono text-[11px] text-muted-foreground mt-0.5 truncate">
                              {accountPhone}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Direção com Ícone / Emoji */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        {isOutbound ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-500 bg-rose-500/10 border border-rose-500/20 px-2.5 py-1 rounded-md">
                            <PhoneOutgoing className="w-3.5 h-3.5 text-rose-500" /> Saída
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-md">
                            <PhoneIncoming className="w-3.5 h-3.5 text-emerald-500" /> Entrada
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

                      {/* Horário */}
                      <td className="py-3 px-4 font-mono text-xs text-muted-foreground whitespace-nowrap">
                        {formatTimestamp(call.startedAt)}
                      </td>

                      {/* Duração */}
                      <td className="py-3 px-4 font-mono text-xs font-bold text-foreground whitespace-nowrap">
                        {isConnected ? (
                          <span className="text-emerald-500">{formatDuration(durationSec)}</span>
                        ) : (
                          <span className="text-muted-foreground font-normal">--</span>
                        )}
                      </td>

                      {/* Status Detalhado (Atendida / Tocando / Rejeitada / Perdida) */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        {isConnected ? (
                          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 gap-1 font-medium px-2.5 py-0.5">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Atendida
                          </Badge>
                        ) : call.status === "ringing" ? (
                          <Badge variant="secondary" className="bg-blue-500/10 text-blue-500 border-blue-500/30 gap-1 font-medium px-2.5 py-0.5">
                            <AlertCircle className="w-3.5 h-3.5 animate-pulse" /> Tocando
                          </Badge>
                        ) : call.endReason?.includes("declined") ? (
                          <Badge variant="outline" className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 gap-1 font-medium px-2.5 py-0.5">
                            <XCircle className="w-3.5 h-3.5" /> Rejeitada
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-rose-500/10 text-rose-500 border-rose-500/30 gap-1 font-medium px-2.5 py-0.5">
                            <XCircle className="w-3.5 h-3.5" /> Perdida
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

        {/* Pagination Footer */}
        <div className="p-4 border-t border-border bg-muted/30 flex items-center justify-between shrink-0">
          <span className="text-xs text-muted-foreground">
            Mostrando {history.length > 0 ? (page - 1) * limit + 1 : 0} até {Math.min(page * limit, totalRecords)} de {totalRecords} registros
          </span>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="h-8 text-xs"
            >
              <ChevronLeft className="w-3.5 h-3.5 mr-1" /> Anterior
            </Button>
            <span className="text-xs font-semibold px-2">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="h-8 text-xs"
            >
              Próximo <ChevronRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
