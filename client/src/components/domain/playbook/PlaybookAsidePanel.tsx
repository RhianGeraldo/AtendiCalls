import { useState, useEffect } from "react";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  X,
  FileText,
  Loader2,
  StickyNote,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getPlaybooksApi } from "@/services/playbooks";
import { parsePlaybookContent, Playbook, PlaybookStage } from "@/types/playbook";

interface PlaybookAsidePanelProps {
  onClose: () => void;
  className?: string;
}

export const PlaybookAsidePanel = ({ onClose, className = "" }: PlaybookAsidePanelProps) => {
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlaybookId, setSelectedPlaybookId] = useState<string>("");
  const [activeStageIdx, setActiveStageIdx] = useState(0);
  const [expandedObjectionIdx, setExpandedObjectionIdx] = useState<number | null>(null);
  const [callNotes, setCallNotes] = useState("");

  useEffect(() => {
    setLoading(true);
    getPlaybooksApi()
      .then((data) => {
        setPlaybooks(data);
        if (data.length > 0) {
          setSelectedPlaybookId(data[0].id);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const selectedPlaybook = playbooks.find((p) => p.id === selectedPlaybookId);
  const parsedPb = selectedPlaybook ? parsePlaybookContent(selectedPlaybook.content) : null;
  const isStagesMode = parsedPb?.mode === "stages" && parsedPb.stages.length > 0;
  const stages: PlaybookStage[] = isStagesMode ? parsedPb!.stages : [];
  const currentStage: PlaybookStage | undefined = isStagesMode ? stages[activeStageIdx] : undefined;

  // Reset stage index on playbook change
  useEffect(() => {
    setActiveStageIdx(0);
    setExpandedObjectionIdx(null);
  }, [selectedPlaybookId]);

  return (
    <div
      className={`w-[340px] h-[550px] rounded-3xl border-2 border-border bg-card text-foreground flex flex-col justify-between shadow-xl overflow-hidden shrink-0 animate-in fade-in slide-in-from-left-4 duration-200 ${className}`}
    >
      {/* Panel Header */}
      <div className="p-3.5 border-b border-border/60 bg-muted/20 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shrink-0">
            <BookOpen className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-xs font-bold text-foreground truncate">Playbook de Atendimento</h3>
            <p className="text-[10px] text-muted-foreground truncate">Roteiro interativo de vendas</p>
          </div>
        </div>

        <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7 rounded-full text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Select Playbook Dropdown */}
      <div className="p-2.5 border-b border-border/40 bg-muted/10 shrink-0">
        <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 block">
          Selecionar Playbook
        </label>
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-500" /> Carregando roteiros...
          </div>
        ) : playbooks.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">Nenhum playbook cadastrado.</p>
        ) : (
          <select
            value={selectedPlaybookId}
            onChange={(e) => setSelectedPlaybookId(e.target.value)}
            className="w-full text-xs bg-background border border-input rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer font-medium"
          >
            {playbooks.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title} {p.category ? `(${p.category})` : ""}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Fixed Stage Header Bar: Index, Title, Navigation & Progress Bar */}
      {isStagesMode && currentStage && (
        <div className="p-2.5 border-b border-border/40 bg-muted/20 shrink-0 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 px-1.5 py-0.5 font-extrabold shrink-0">
                {activeStageIdx + 1}/{stages.length}
              </Badge>
              <h4 className="text-xs font-extrabold text-foreground truncate">
                {currentStage.title}
              </h4>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={activeStageIdx === 0}
                onClick={() => {
                  setActiveStageIdx((prev) => Math.max(0, prev - 1));
                  setExpandedObjectionIdx(null);
                }}
                className="h-6 px-1.5 text-[10px] gap-0.5 border-border/60 font-semibold"
                title="Etapa Anterior"
              >
                <ChevronLeft className="h-3 w-3" />
              </Button>

              <Button
                type="button"
                size="sm"
                disabled={activeStageIdx === stages.length - 1}
                onClick={() => {
                  setActiveStageIdx((prev) => Math.min(stages.length - 1, prev + 1));
                  setExpandedObjectionIdx(null);
                }}
                className="h-6 px-2 text-[10px] gap-0.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold"
                title="Próxima Etapa"
              >
                Próxima <ChevronRight className="h-3 w-3" />
              </Button>
            </div>
          </div>

          <div className="w-full h-1.5 bg-muted/80 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 transition-all duration-300 rounded-full"
              style={{ width: `${((activeStageIdx + 1) / stages.length) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Body: Scrollable from Roteiro Sugerido Downwards (Dark Custom Scrollbar) */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3 text-xs [scrollbar-width:thin] [scrollbar-color:hsl(var(--muted-foreground)/0.3)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-muted-foreground/50">
        {!selectedPlaybook ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground space-y-2 py-8">
            <FileText className="h-8 w-8 text-muted-foreground/40" />
            <p>Selecione um playbook para visualizar o roteiro da chamada.</p>
          </div>
        ) : isStagesMode && currentStage ? (
          <>
            {/* Script Box */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                Roteiro Sugerido
              </label>
              <div className="p-2.5 rounded-xl bg-emerald-500/5 border border-emerald-500/20 text-foreground leading-relaxed text-xs font-medium whitespace-pre-wrap">
                {currentStage.script}
              </div>
            </div>

            {/* Objections Accordion */}
            {currentStage.objections && currentStage.objections.length > 0 && (
              <div className="space-y-1.5 pt-1 border-t border-border/40">
                <label className="text-[10px] font-bold uppercase tracking-wider text-amber-500 flex items-center gap-1">
                  <HelpCircle className="h-3.5 w-3.5" /> Objeções Comuns & Respostas
                </label>

                <div className="space-y-1.5">
                  {currentStage.objections.map((obj, idx) => {
                    const isExpanded = expandedObjectionIdx === idx;
                    return (
                      <div key={idx} className="rounded-xl border border-amber-500/20 bg-amber-500/5 overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setExpandedObjectionIdx(isExpanded ? null : idx)}
                          className="w-full p-2 text-left font-semibold text-xs flex items-center justify-between text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 transition-colors"
                        >
                          <span className="truncate pr-2">"{obj.trigger}"</span>
                          <ChevronRight className={`h-3.5 w-3.5 shrink-0 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                        </button>
                        {isExpanded && (
                          <div className="p-2.5 pt-0 text-[11px] text-foreground/90 leading-relaxed border-t border-amber-500/10 bg-background/50 whitespace-pre-wrap">
                            {obj.response}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        ) : (
          /* Plain Text Playbook Content */
          <div className="space-y-2">
            <h4 className="text-sm font-bold text-foreground">{selectedPlaybook.title}</h4>
            <div className="p-3 rounded-xl bg-muted/40 border border-border/60 leading-relaxed whitespace-pre-wrap font-sans text-xs">
              {parsedPb?.text || selectedPlaybook.content}
            </div>
          </div>
        )}
      </div>

      {/* Quick Call Notes Area (Fixed Bottom) */}
      <div className="p-2.5 border-t border-border/40 bg-muted/10 shrink-0 space-y-1">
        <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
          <StickyNote className="h-3.5 w-3.5 text-emerald-500" /> Anotações do Atendimento
        </label>
        <textarea
          value={callNotes}
          onChange={(e) => setCallNotes(e.target.value)}
          placeholder="Digite notas rápidas durante a ligação..."
          className="w-full h-12 text-xs bg-background border border-input rounded-xl p-2 focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-none"
        />
      </div>
    </div>
  );
};
