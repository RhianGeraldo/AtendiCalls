import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Mic, Bot, Search, RefreshCw, Volume2, UserCheck, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { getCallAudioUrl, getCallTranscript, transcribeCall } from "@/services/calls";
import type { CallHistoryItem, TranscriptUtterance } from "@/types/call";

interface CallTranscriptModalProps {
  call: CallHistoryItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const CallTranscriptModal = ({ call, open, onOpenChange }: CallTranscriptModalProps) => {
  const [loading, setLoading] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [summary, setSummary] = useState<string>("");
  const [utterances, setUtterances] = useState<TranscriptUtterance[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (open && call?.callId) {
      loadTranscript(call.callId);
    } else {
      setSummary("");
      setUtterances([]);
      setSearchQuery("");
    }
  }, [open, call?.callId]);

  const loadTranscript = async (callId: string) => {
    setLoading(true);
    try {
      const data = await getCallTranscript(callId);
      setSummary(data.transcriptSummary || "");
      if (data.transcriptJson) {
        try {
          const parsed = JSON.parse(data.transcriptJson);
          if (Array.isArray(parsed)) setUtterances(parsed);
        } catch {
          setUtterances([]);
        }
      }
    } catch (e: any) {
      toast.error("Não foi possível carregar a transcrição.");
    } finally {
      setLoading(false);
    }
  };

  const handleTranscribe = async () => {
    if (!call?.callId) return;
    setTranscribing(true);
    try {
      const res = await transcribeCall(call.callId);
      setSummary(res.transcriptSummary || "");
      if (res.transcriptJson) {
        try {
          const parsed = JSON.parse(res.transcriptJson);
          if (Array.isArray(parsed)) setUtterances(parsed);
        } catch {
          setUtterances([]);
        }
      }
      toast.success("Transcrição concluída com sucesso!");
    } catch (e: any) {
      toast.error(e.message || "Erro ao gerar transcrição por IA.");
    } finally {
      setTranscribing(false);
    }
  };

  const filteredUtterances = utterances.filter((u) =>
    searchQuery.trim() === "" ? true : u.text.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  if (!call) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col p-6 overflow-hidden">
        <DialogHeader className="border-b pb-4">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-lg font-bold flex items-center gap-2 text-foreground">
              <Bot className="h-5 w-5 text-emerald-500" /> Transcrição & Gravação por IA
            </DialogTitle>
            <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
              Estéreo Dual-Channel
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Chamada realizada em {new Date(call.startedAt).toLocaleString("pt-BR")} — {call.name || call.peer}
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-5 py-3 pr-1">
          {/* Audio Player Card */}
          <div className="rounded-xl border border-border/80 bg-muted/30 p-4 space-y-2 shadow-sm">
            <div className="flex items-center justify-between text-xs font-semibold text-foreground">
              <span className="flex items-center gap-1.5">
                <Volume2 className="h-4 w-4 text-emerald-500" /> Player da Gravação
              </span>
              <span className="text-[11px] text-muted-foreground">Canal L: Cliente (Esq) | Canal R: Atendente (Dir)</span>
            </div>
            <audio controls src={getCallAudioUrl(call.callId)} className="w-full h-10 rounded-lg" />
          </div>

          {/* AI Executive Summary Card */}
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                <Bot className="h-4 w-4" /> Resumo Executivo da Ligação
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleTranscribe}
                disabled={transcribing}
                className="h-7 text-xs gap-1.5 text-emerald-600 hover:text-emerald-700"
              >
                {transcribing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Re-gerar IA
              </Button>
            </div>
            <p className="text-xs text-foreground/90 leading-relaxed italic">
              {summary || "Processando resumo inteligente do atendimento..."}
            </p>
          </div>

          {/* Dialogue Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Mic className="h-4 w-4 text-emerald-500" /> Diálogo Transcrito por Canal
              </h3>

              <div className="relative w-48">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar no texto..."
                  className="h-8 pl-8 text-xs"
                />
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-8 text-xs text-muted-foreground gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-emerald-500" /> Carregando áudio e transcrição...
              </div>
            ) : filteredUtterances.length === 0 ? (
              <div className="rounded-xl border border-dashed p-6 text-center text-xs text-muted-foreground space-y-3">
                <p>Nenhuma transcrição encontrada para esta gravação.</p>
                <Button size="sm" onClick={handleTranscribe} disabled={transcribing} className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
                  {transcribing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
                  Gerar Transcrição com IA
                </Button>
              </div>
            ) : (
              <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
                {filteredUtterances.map((u, i) => {
                  const isAttendant = u.speaker === "atendente";
                  return (
                    <div
                      key={i}
                      className={`flex gap-3 text-xs ${isAttendant ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-2xl p-3 space-y-1 shadow-sm ${
                          isAttendant
                            ? "bg-emerald-500/10 border border-emerald-500/20 rounded-tr-none text-foreground"
                            : "bg-blue-500/10 border border-blue-500/20 rounded-tl-none text-foreground"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-4 text-[10px]">
                          <span className={`font-bold flex items-center gap-1 ${isAttendant ? "text-emerald-600 dark:text-emerald-400" : "text-blue-600 dark:text-blue-400"}`}>
                            {isAttendant ? <UserCheck className="h-3 w-3" /> : <Smartphone className="h-3 w-3" />}
                            {isAttendant ? "Atendente" : "Cliente"}
                          </span>
                          <span className="text-muted-foreground font-mono">
                            {formatTime(u.start)} - {formatTime(u.end)}
                          </span>
                        </div>
                        <p className="leading-normal">{u.text}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
