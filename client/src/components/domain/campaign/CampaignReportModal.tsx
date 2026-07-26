import { useEffect, useState, useMemo } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getCampaignDetailsApi } from "@/services/campaigns";
import type { Campaign } from "@/types/campaign";
import { 
  BarChart, 
  Users, 
  PhoneCall, 
  PhoneMissed, 
  XOctagon, 
  ListOrdered,
  FileText,
  AlertTriangle,
  ChevronDown
} from "lucide-react";
import { formatPhoneBR } from "@/utils/format";
import { parsePlaybookContent, PlaybookStage } from "@/types/playbook";
import { Fragment } from "react";

interface CampaignReportModalProps {
  campaignId: string | null;
  onClose: () => void;
}

export const CampaignReportModal = ({ campaignId, onClose }: CampaignReportModalProps) => {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  useEffect(() => {
    if (!campaignId) {
      setCampaign(null);
      return;
    }
    const loadCampaign = async () => {
      setLoading(true);
      setError("");
      try {
        const data = await getCampaignDetailsApi(campaignId);
        setCampaign(data);
      } catch (err: any) {
        setError(err.message || "Erro ao carregar o relatório da campanha.");
      } finally {
        setLoading(false);
      }
    };
    loadCampaign();
  }, [campaignId]);

  // Compute metrics from items
  const stats = useMemo(() => {
    if (!campaign || !campaign.items) return null;
    
    const items = campaign.items;
    const total = items.length;
    let pending = 0;
    let answered = 0;
    let no_answer = 0;
    let rejected = 0;
    let failed = 0;

    // Parse playbook
    const isStagesMode = campaign.playbook?.startsWith("STG:");
    let pbStages: PlaybookStage[] = [];
    if (isStagesMode && campaign.playbook) {
      try {
        const parsed = parsePlaybookContent(campaign.playbook);
        pbStages = parsed.stages || [];
      } catch (e) {
        // ignore
      }
    }

    // Initialize funnel counts for ALL stages in order
    const funnel: Record<string, number> = {};
    if (isStagesMode) {
      pbStages.forEach(stg => {
        funnel[stg.title] = 0;
      });
    }

    items.forEach(it => {
      if (it.status === "pending" || it.status === "calling") pending++;
      else if (it.status === "answered") answered++;
      else if (it.status === "no_answer") no_answer++;
      else if (it.status === "rejected") rejected++;
      else if (it.status === "failed") failed++;

      if (it.status === "answered" && it.notes) {
        const matches = [...it.notes.matchAll(/\[Atingiu:\s*(.+?)\]/g)];
        if (matches.length > 0) {
          const lastMatch = matches[matches.length - 1];
          if (lastMatch && lastMatch[1]) {
            const reachedStage = lastMatch[1].trim();
            
            if (isStagesMode) {
              const reachedIdx = pbStages.findIndex(s => s.title === reachedStage);
              if (reachedIdx !== -1) {
                // Increment count for this stage and ALL PREVIOUS stages
                for (let i = 0; i <= reachedIdx; i++) {
                  const stageTitle = pbStages[i].title;
                  funnel[stageTitle] = (funnel[stageTitle] || 0) + 1;
                }
              }
            } else {
              funnel[reachedStage] = (funnel[reachedStage] || 0) + 1;
            }
          }
        }
      }
    });

    const funnelEntries = isStagesMode
      ? pbStages.map(stg => [stg.title, funnel[stg.title]]) as [string, number][] // Keep exact order from playbook
      : Object.entries(funnel).sort((a, b) => b[1] - a[1]);

    return { total, pending, answered, no_answer, rejected, failed, funnelEntries };
  }, [campaign]);

  const getStatusBadge = (status: string) => {
    switch(status) {
      case "answered": return <Badge variant="success" className="text-[10px]">Atendido</Badge>;
      case "no_answer": return <Badge variant="secondary" className="text-[10px]">Não Atendeu</Badge>;
      case "rejected": return <Badge variant="destructive" className="text-[10px] bg-rose-500">Rejeitado</Badge>;
      case "failed": return <Badge variant="destructive" className="text-[10px]">Falhou</Badge>;
      case "pending": return <Badge variant="outline" className="text-[10px]">Pendente</Badge>;
      default: return <Badge variant="outline" className="text-[10px]">{status}</Badge>;
    }
  };

  return (
    <Dialog open={!!campaignId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-5xl h-[700px] max-h-[95vh] p-0 overflow-hidden flex flex-col bg-card border-border shadow-2xl">
        
        {/* Header */}
        <div className="p-4 border-b border-border bg-muted/30 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-emerald-600/10 text-emerald-600 rounded-xl flex items-center justify-center">
              <BarChart className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-foreground leading-none">
                Relatório da Campanha
              </h2>
              {campaign && (
                <p className="text-xs text-muted-foreground mt-1">
                  {campaign.name} • {campaign.totalItems} contatos
                </p>
              )}
            </div>
          </div>
        </div>
        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 bg-background">
          {loading ? (
            <div className="h-full flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
            </div>
          ) : error ? (
            <div className="h-full flex items-center justify-center text-rose-500 flex-col gap-2">
              <XOctagon className="w-8 h-8" />
              <span className="font-bold">{error}</span>
            </div>
          ) : !campaign || !stats ? (
            <div className="h-full flex items-center justify-center text-muted-foreground">
              Nenhum dado encontrado.
            </div>
          ) : (
            <div className="space-y-6">
              
              {/* TOP METRICS CARDS */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-card border border-border p-4 rounded-2xl shadow-sm space-y-1">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs font-semibold uppercase tracking-wider">
                    <Users className="w-4 h-4" /> Total
                  </div>
                  <div className="text-3xl font-black text-foreground">{stats.total}</div>
                </div>
                
                <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-2xl shadow-sm space-y-1">
                  <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-xs font-semibold uppercase tracking-wider">
                    <PhoneCall className="w-4 h-4" /> Atendidos
                  </div>
                  <div className="flex items-baseline gap-2">
                    <div className="text-3xl font-black text-emerald-600 dark:text-emerald-400">{stats.answered}</div>
                    <div className="text-xs font-bold text-emerald-600/70">({stats.total > 0 ? Math.round((stats.answered / stats.total) * 100) : 0}%)</div>
                  </div>
                </div>

                <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-2xl shadow-sm space-y-1">
                  <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 text-xs font-semibold uppercase tracking-wider">
                    <PhoneMissed className="w-4 h-4" /> Não Atendeu
                  </div>
                  <div className="flex items-baseline gap-2">
                    <div className="text-3xl font-black text-amber-600 dark:text-amber-400">{stats.no_answer}</div>
                    <div className="text-xs font-bold text-amber-600/70">({stats.total > 0 ? Math.round((stats.no_answer / stats.total) * 100) : 0}%)</div>
                  </div>
                </div>

                <div className="bg-rose-500/10 border border-rose-500/20 p-4 rounded-2xl shadow-sm space-y-1">
                  <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400 text-xs font-semibold uppercase tracking-wider">
                    <XOctagon className="w-4 h-4" /> Rejeitados / Falhas
                  </div>
                  <div className="flex items-baseline gap-2">
                    <div className="text-3xl font-black text-rose-600 dark:text-rose-400">{stats.rejected + stats.failed}</div>
                    <div className="text-xs font-bold text-rose-600/70">({stats.total > 0 ? Math.round(((stats.rejected + stats.failed) / stats.total) * 100) : 0}%)</div>
                  </div>
                </div>
              </div>

              {/* FUNNEL SECTION (If stages were tracked) */}
              {stats.funnelEntries.length > 0 && (
                <div className="bg-card border border-border p-5 rounded-2xl shadow-sm space-y-4">
                  <h3 className="text-sm font-extrabold flex items-center gap-2 text-foreground">
                    <ListOrdered className="w-4 h-4 text-emerald-500" /> Etapas Alcançadas (Apenas Atendidos)
                  </h3>
                  <div className="space-y-3">
                    {stats.funnelEntries.map(([stageName, count], idx) => {
                      const percentage = Math.round((count / Math.max(1, stats.answered)) * 100);
                      return (
                        <div key={idx} className="flex flex-col gap-1">
                          <div className="flex items-center justify-between text-xs font-bold">
                            <span className="text-foreground truncate">{stageName}</span>
                            <span className="text-emerald-600 tabular-nums">{count} contatos ({percentage}%)</span>
                          </div>
                          <div className="w-full bg-muted h-2 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-emerald-500 rounded-full" 
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* DETAILED TABLE */}
              <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden flex flex-col">
                <div className="p-4 border-b border-border bg-muted/20">
                  <h3 className="text-sm font-extrabold flex items-center gap-2 text-foreground">
                    <FileText className="w-4 h-4 text-emerald-500" /> Detalhamento de Contatos
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="bg-muted/40 text-muted-foreground text-[10px] uppercase tracking-wider font-bold">
                      <tr>
                        <th className="px-4 py-3">Contato</th>
                        <th className="px-4 py-3">Telefone</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Etapa</th>
                        <th className="px-4 py-3">Anotações</th>
                        <th className="px-4 py-3"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {campaign.items?.map((item) => {
                        let displayNotes = item.notes || "-";
                        let reachedStage = "-";
                        if (item.notes) {
                          const matches = [...item.notes.matchAll(/\[Atingiu:\s*(.+?)\]/g)];
                          if (matches.length > 0) {
                            const lastMatch = matches[matches.length - 1];
                            if (lastMatch && lastMatch[1]) {
                              reachedStage = lastMatch[1].trim();
                            }
                          }
                          // Remove the tags from the notes to clean it up for display
                          displayNotes = item.notes.replace(/\[Atingiu:\s*.+?\]/g, "").trim();
                          if (!displayNotes) displayNotes = "-";
                        }
                        
                        return (
                          <Fragment key={item.id}>
                            <tr className={`transition-colors ${expandedRow === item.id ? "bg-muted/10" : "hover:bg-muted/20"}`}>
                              <td className="px-4 py-3 font-semibold text-foreground">{item.name}</td>
                              <td className="px-4 py-3 font-mono text-xs">{formatPhoneBR(item.phone)}</td>
                              <td className="px-4 py-3">{getStatusBadge(item.status)}</td>
                              <td className="px-4 py-3">
                                {reachedStage !== "-" ? (
                                  <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-500/20">{reachedStage}</Badge>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <div className="max-w-[200px] truncate text-xs text-muted-foreground font-medium">
                                  {displayNotes}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-right">
                                {(item.notes) && (
                                  <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="h-7 text-[10px]"
                                    onClick={() => setExpandedRow(expandedRow === item.id ? null : item.id)}
                                  >
                                    Ver Tudo <ChevronDown className={`ml-1 w-3 h-3 transition-transform ${expandedRow === item.id ? 'rotate-180' : ''}`} />
                                  </Button>
                                )}
                              </td>
                            </tr>
                            {expandedRow === item.id && (
                              <tr className="bg-muted/10">
                                <td colSpan={6} className="p-4 px-6 border-t border-border/50">
                                  <h4 className="text-xs font-bold mb-2 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> Notas Completas</h4>
                                  <div className="p-3 bg-background rounded-xl text-xs text-foreground whitespace-pre-wrap font-sans border border-border/50 shadow-sm">
                                    {displayNotes}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
