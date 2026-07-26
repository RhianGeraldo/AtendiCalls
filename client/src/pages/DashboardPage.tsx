import { useEffect, useState, useMemo } from "react";
import {
  PhoneCall,
  PhoneIncoming,
  PhoneOutgoing,
  Clock,
  CheckCircle2,
  Smartphone,
  TrendingUp,
  Users,
  BarChart3,
  PieChart,
  PhoneMissed,
  XCircle,
} from "lucide-react";
import { useCalls } from "@/stores/calls";
import { useSessions } from "@/stores/sessions";
import { getCallAnalyticsApi } from "@/services/reports";
import type { CallAnalyticsResponse } from "@/types/call";

export const DashboardPage = () => {
  const calls = useCalls((s) => s.calls);
  const sessions = useSessions((s) => s.sessions);

  const [analytics, setAnalytics] = useState<CallAnalyticsResponse | null>(null);

  const activeSessions = sessions.filter((s) => s.paired);
  const activeCalls = calls.filter((c) => c.status === "connected" || c.status === "ringing");

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const res = await getCallAnalyticsApi();
        setAnalytics(res);
      } catch (e) {
        console.error("Error fetching dashboard analytics:", e);
      }
    };
    fetchAnalytics();
  }, [calls.length]);

  // Fallback summary computation
  const summary = useMemo(() => {
    if (analytics?.summary && analytics.summary.totalCalls > 0) {
      return analytics.summary;
    }
    const totalCalls = calls.length;
    const completedCalls = calls.filter((c) => c.connectedAt || c.status === "connected").length;
    const missedCalls = calls.filter((c) => c.status === "ended" && !c.connectedAt).length;
    const rejectedCalls = calls.filter((c) => c.endReason?.includes("declined")).length;
    const inboundCount = calls.filter((c) => c.direction === "inbound").length;
    const outboundCount = calls.filter((c) => c.direction === "outbound").length;
    
    let totalDur = 0;
    let countDur = 0;
    calls.forEach((c) => {
      if (c.connectedAt && c.endedAt) {
        totalDur += Math.max(0, Math.floor((c.endedAt - c.connectedAt) / 1000));
        countDur++;
      }
    });

    const avgDurationSec = countDur > 0 ? Math.floor(totalDur / countDur) : 0;
    const answerRate = totalCalls > 0 ? (completedCalls / totalCalls) * 100 : 0;

    return {
      totalCalls,
      completedCalls,
      missedCalls,
      rejectedCalls,
      inboundCount,
      outboundCount,
      totalDurationSec: totalDur,
      avgDurationSec,
      avgWaitSec: 0,
      answerRate,
    };
  }, [analytics, calls]);

  // Fallback agent performance computation
  const byAgent = useMemo(() => {
    if (analytics?.byAgent && analytics.byAgent.length > 0) {
      return analytics.byAgent;
    }
    const map = new Map<string, { owner: string; totalCalls: number; completedCalls: number; totalDurationSec: number }>();
    calls.forEach((c) => {
      const owner = c.owner || "Sem Agente";
      const item = map.get(owner) || { owner, totalCalls: 0, completedCalls: 0, totalDurationSec: 0 };
      item.totalCalls++;
      if (c.connectedAt || c.status === "connected") {
        item.completedCalls++;
        if (c.connectedAt && c.endedAt) {
          item.totalDurationSec += Math.max(0, Math.floor((c.endedAt - c.connectedAt) / 1000));
        }
      }
      map.set(owner, item);
    });

    return Array.from(map.values()).map((ag) => ({
      ...ag,
      avgDurationSec: ag.completedCalls > 0 ? Math.floor(ag.totalDurationSec / ag.completedCalls) : 0,
      answerRate: ag.totalCalls > 0 ? (ag.completedCalls / ag.totalCalls) * 100 : 0,
    }));
  }, [analytics, calls]);

  // Fallback session traffic distribution computation
  const bySession = useMemo(() => {
    if (analytics?.bySession && analytics.bySession.length > 0) {
      return analytics.bySession;
    }
    const map = new Map<string, { sessionId: string; sessionName?: string; sessionPhone?: string; sessionPictureUrl?: string; totalCalls: number; completedCalls: number; missedCalls: number; totalDur: number }>();
    calls.forEach((c) => {
      const sid = c.sessionId;
      const sessStore = sessions.find((s) => s.id === sid);
      const item = map.get(sid) || {
        sessionId: sid,
        sessionName: c.sessionName || sessStore?.name || "WhatsApp",
        sessionPhone: c.sessionPhone || sessStore?.phone || sid.slice(0, 8),
        sessionPictureUrl: c.sessionPictureUrl || sessStore?.pictureUrl,
        totalCalls: 0,
        completedCalls: 0,
        missedCalls: 0,
        totalDur: 0,
      };
      item.totalCalls++;
      if (c.connectedAt || c.status === "connected") {
        item.completedCalls++;
        if (c.connectedAt && c.endedAt) {
          item.totalDur += Math.max(0, Math.floor((c.endedAt - c.connectedAt) / 1000));
        }
      } else {
        item.missedCalls++;
      }
      map.set(sid, item);
    });

    return Array.from(map.values()).map((sm) => ({
      ...sm,
      avgDurationSec: sm.completedCalls > 0 ? Math.floor(sm.totalDur / sm.completedCalls) : 0,
      answerRate: sm.totalCalls > 0 ? (sm.completedCalls / sm.totalCalls) * 100 : 0,
    }));
  }, [analytics, calls, sessions]);

  // Fallback daily volume computation
  const byDaily = useMemo(() => {
    if (analytics?.byDaily && analytics.byDaily.length > 0) {
      return analytics.byDaily;
    }
    const map = new Map<string, { date: string; totalCalls: number; completedCalls: number; inboundCount: number; outboundCount: number; totalDur: number }>();
    calls.forEach((c) => {
      if (!c.startedAt) return;
      const d = new Date(c.startedAt);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      const dateKey = `${yyyy}-${mm}-${dd}`;

      const item = map.get(dateKey) || { date: dateKey, totalCalls: 0, completedCalls: 0, inboundCount: 0, outboundCount: 0, totalDur: 0 };
      item.totalCalls++;
      if (c.direction === "inbound") item.inboundCount++;
      if (c.direction === "outbound") item.outboundCount++;
      if (c.connectedAt || c.status === "connected") {
        item.completedCalls++;
        if (c.connectedAt && c.endedAt) {
          item.totalDur += Math.max(0, Math.floor((c.endedAt - c.connectedAt) / 1000));
        }
      }
      map.set(dateKey, item);
    });

    return Array.from(map.values())
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((dm) => ({
        ...dm,
        avgDurationSec: dm.completedCalls > 0 ? Math.floor(dm.totalDur / dm.completedCalls) : 0,
      }));
  }, [analytics, calls]);

  const formatDuration = (sec?: number) => {
    if (!sec || sec <= 0) return "0s";
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  const formatDateLabel = (dateStr: string) => {
    if (!dateStr) return "";
    const parts = dateStr.split("-");
    if (parts.length === 3) return `${parts[2]}/${parts[1]}`;
    return dateStr;
  };

  // Find max daily count for SVG scaling
  const maxDailyCalls = Math.max(...byDaily.map((d) => d.totalCalls), 5);

  return (
    <div className="mx-auto max-w-7xl space-y-6 select-none">
      {/* Top KPI Cards Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Contas Ativas */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Contas WhatsApp</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
              <Smartphone className="h-4 w-4" />
            </div>
          </div>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl font-extrabold tracking-tight text-foreground">{activeSessions.length}</span>
            <span className="text-xs text-muted-foreground">de {sessions.length} cadastradas</span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-emerald-500 font-medium mt-1">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>{activeSessions.length > 0 ? "Sessões operacionais" : "Nenhuma conta pronta"}</span>
          </div>
        </div>

        {/* Card 2: Chamadas Ativas Agora */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Em Chamada Agora</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
              <PhoneCall className="h-4 w-4 animate-pulse" />
            </div>
          </div>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl font-extrabold tracking-tight text-amber-500">{activeCalls.length}</span>
            <span className="text-xs text-muted-foreground">ao vivo</span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-amber-500 font-medium mt-1">
            <TrendingUp className="h-3.5 w-3.5" />
            <span>{activeCalls.length > 0 ? "Monitoramento em tempo real" : "Linhas livres"}</span>
          </div>
        </div>

        {/* Card 3: Chamadas Totais Registradas */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Total de Chamadas</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-500">
              <PhoneOutgoing className="h-4 w-4" />
            </div>
          </div>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl font-extrabold tracking-tight text-foreground">{summary?.totalCalls || calls.length}</span>
            <span className="text-xs text-muted-foreground">histórico geral</span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-blue-500 font-medium mt-1">
            <Clock className="h-3.5 w-3.5" />
            <span>{summary?.completedCalls || 0} finalizadas</span>
          </div>
        </div>

        {/* Card 4: Taxa de Atendimento Geral */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Taxa de Atendimento</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl font-extrabold tracking-tight text-emerald-500">
              {(summary?.answerRate || 0).toFixed(1)}%
            </span>
            <span className="text-xs text-muted-foreground">aproveitamento</span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-emerald-500 font-medium mt-1">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>TMA Médio: {formatDuration(summary?.avgDurationSec)}</span>
          </div>
        </div>
      </div>

      {/* Row 1: Charts - Daily Evolution & Status Distribution */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Chart 1: Evolução Diária de Ligações (Volume por Dia) */}
        <div className="lg:col-span-2 rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4 flex flex-col justify-between">
          <div className="flex items-center justify-between border-b border-border/60 pb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-emerald-500/10 text-emerald-500 rounded-lg">
                <BarChart3 className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-foreground">Evolução Diária de Ligações</h3>
                <p className="text-[11px] text-muted-foreground">Volume de chamadas por dia (Entrada vs Saída)</p>
              </div>
            </div>

            <div className="flex items-center gap-3 text-xs font-medium">
              <span className="flex items-center gap-1 text-emerald-500 font-semibold">
                <PhoneIncoming className="w-3.5 h-3.5" /> Entrada
              </span>
              <span className="flex items-center gap-1 text-rose-500 font-semibold">
                <PhoneOutgoing className="w-3.5 h-3.5" /> Saída
              </span>
            </div>
          </div>

          {byDaily.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-xs flex flex-col items-center justify-center gap-2">
              <BarChart3 className="w-8 h-8 opacity-30" />
              <span>Sem dados de chamadas registrados nos últimos dias.</span>
            </div>
          ) : (
            <div className="space-y-2 pt-2">
              {/* Visual Bars Container */}
              <div className="h-44 flex items-end gap-2 sm:gap-4 pt-6 pb-2 px-2 border-b border-border/50">
                {byDaily.slice().reverse().map((day, idx) => {
                  const inboundPct = Math.round((day.inboundCount / maxDailyCalls) * 100);
                  const outboundPct = Math.round((day.outboundCount / maxDailyCalls) * 100);

                  return (
                    <div key={idx} className="flex-1 flex flex-col items-center h-full justify-end group relative">
                      {/* Tooltip Hover Card */}
                      <div className="absolute -top-12 opacity-0 group-hover:opacity-100 transition-opacity bg-popover text-popover-foreground text-[10px] font-mono px-2 py-1 rounded-md shadow-md border border-border pointer-events-none z-20 whitespace-nowrap">
                        <div className="font-bold">{day.date}</div>
                        <div>Total: {day.totalCalls} ({day.inboundCount} In / {day.outboundCount} Out)</div>
                      </div>

                      {/* Dual Vertical Bars */}
                      <div className="flex items-end justify-center gap-1 w-full h-full">
                        {/* Inbound Bar */}
                        <div
                          className="w-full max-w-[16px] bg-emerald-500 hover:bg-emerald-400 rounded-t-sm transition-all duration-300 relative"
                          style={{ height: `${Math.max(8, inboundPct)}%` }}
                        />
                        {/* Outbound Bar */}
                        <div
                          className="w-full max-w-[16px] bg-rose-500 hover:bg-rose-400 rounded-t-sm transition-all duration-300 relative"
                          style={{ height: `${Math.max(8, outboundPct)}%` }}
                        />
                      </div>

                      <span className="text-[10px] font-mono text-muted-foreground mt-2 truncate w-full text-center">
                        {formatDateLabel(day.date)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Chart 2: Status Operacional das Chamadas */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4 flex flex-col justify-between">
          <div className="flex items-center justify-between border-b border-border/60 pb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-blue-500/10 text-blue-500 rounded-lg">
                <PieChart className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-foreground">Status das Chamadas</h3>
                <p className="text-[11px] text-muted-foreground">Distribuição de chamadas por resultado</p>
              </div>
            </div>
          </div>

          <div className="space-y-4 my-auto py-2">
            {/* Call Status Breakdown List */}
            <div className="space-y-3">
              {/* Atendidas */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className="flex items-center gap-1.5 text-emerald-500">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Atendidas
                  </span>
                  <span className="font-mono text-foreground">{summary?.completedCalls || 0}</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 transition-all rounded-full"
                    style={{
                      width: `${summary?.totalCalls ? Math.round((summary.completedCalls / summary.totalCalls) * 100) : 0}%`,
                    }}
                  />
                </div>
              </div>

              {/* Perdidas */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className="flex items-center gap-1.5 text-rose-500">
                    <PhoneMissed className="w-3.5 h-3.5" /> Perdidas / Não Atendidas
                  </span>
                  <span className="font-mono text-foreground">{summary?.missedCalls || 0}</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-rose-500 transition-all rounded-full"
                    style={{
                      width: `${summary?.totalCalls ? Math.round((summary.missedCalls / summary.totalCalls) * 100) : 0}%`,
                    }}
                  />
                </div>
              </div>

              {/* Rejeitadas */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className="flex items-center gap-1.5 text-amber-500">
                    <XCircle className="w-3.5 h-3.5" /> Rejeitadas pelo Cliente
                  </span>
                  <span className="font-mono text-foreground">{summary?.rejectedCalls || 0}</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-amber-500 transition-all rounded-full"
                    style={{
                      width: `${summary?.totalCalls ? Math.round((summary.rejectedCalls / summary.totalCalls) * 100) : 0}%`,
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Answer Rate Big Banner */}
            <div className="p-3 rounded-xl bg-muted/40 border border-border/50 flex items-center justify-between">
              <span className="text-xs text-muted-foreground font-medium">Aproveitamento Global</span>
              <span className="text-lg font-black text-emerald-500 font-mono">
                {(summary?.answerRate || 0).toFixed(1)}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Row 2: Charts - Agent Productivity & Account Traffic Distribution */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Chart 3: Desempenho por Agente / Operador */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-border/60 pb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-emerald-500/10 text-emerald-500 rounded-lg">
                <Users className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-foreground">Desempenho por Agente</h3>
                <p className="text-[11px] text-muted-foreground">Volume de ligações e tempo falado por operador</p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {byAgent.length === 0 ? (
              <p className="py-8 text-center text-xs text-muted-foreground">Nenhum agente registrado ainda.</p>
            ) : (
              byAgent.map((ag, i) => (
                <div key={i} className="p-3 rounded-xl border border-border/60 bg-muted/20 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="h-7 w-7 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold text-xs flex items-center justify-center border border-emerald-500/20">
                        {(ag.owner || "A").charAt(0).toUpperCase()}
                      </div>
                      <span className="font-bold text-xs text-foreground truncate">{ag.owner || "Sem Agente"}</span>
                    </div>

                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-bold text-emerald-500 font-mono">{ag.completedCalls} atendidas</span>
                      <span className="text-muted-foreground text-[11px]">de {ag.totalCalls}</span>
                    </div>
                  </div>

                  {/* Progress Bar of Answer Rate */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
                      <span>Taxa: {(ag.answerRate || 0).toFixed(1)}%</span>
                      <span>TMA: {formatDuration(ag.avgDurationSec)}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full transition-all"
                        style={{ width: `${Math.min(100, ag.answerRate || 0)}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Chart 4: Tráfego por Conta de WhatsApp (Linhas da Empresa) */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-border/60 pb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-blue-500/10 text-blue-500 rounded-lg">
                <Smartphone className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-foreground">Tráfego por Linha WhatsApp</h3>
                <p className="text-[11px] text-muted-foreground">Volume de ligações recebidas/efetuadas por conta</p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {bySession.length === 0 ? (
              <p className="py-8 text-center text-xs text-muted-foreground">Nenhuma conta com chamadas registradas.</p>
            ) : (
              bySession.map((sessItem, i) => {
                const sessStore = sessions.find((s) => s.id === sessItem.sessionId);
                const name = sessItem.sessionName || sessStore?.name || "WhatsApp";
                const phone = sessItem.sessionPhone || sessStore?.phone || sessItem.sessionId.slice(0, 8);
                const pic = sessItem.sessionPictureUrl || sessStore?.pictureUrl;
                const pct = summary?.totalCalls ? Math.round((sessItem.totalCalls / summary.totalCalls) * 100) : 0;

                return (
                  <div key={i} className="p-3 rounded-xl border border-border/60 bg-muted/20 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="h-8 w-8 shrink-0 rounded-full overflow-hidden border border-border bg-muted flex items-center justify-center">
                          {pic ? (
                            <img src={pic} alt={name} className="h-full w-full object-cover" />
                          ) : (
                            <div className="h-full w-full bg-blue-500/10 text-blue-600 font-bold text-xs flex items-center justify-center">
                              {name.charAt(0).toUpperCase()}
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-xs text-foreground truncate">{name}</p>
                          <p className="font-mono text-[10px] text-muted-foreground truncate">{phone}</p>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="font-extrabold text-xs text-foreground font-mono">{sessItem.totalCalls} chamadas</span>
                        <p className="text-[10px] text-muted-foreground">{pct}% do tráfego</p>
                      </div>
                    </div>

                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
