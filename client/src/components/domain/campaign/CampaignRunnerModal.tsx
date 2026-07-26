import { useEffect, useRef } from "react";
import { 
  PhoneCall, Play, Pause, X, CheckCircle2, AlertCircle, Clock, FileText, ChevronRight, PhoneOff
} from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCampaignRunner } from "@/stores/campaignRunner";
import { useDialerStore } from "@/stores/dialer";
import { useCalls } from "@/stores/calls";
import { useSessions } from "@/stores/sessions";
import { formatPhoneBR } from "@/utils/format";

export const CampaignRunnerModal = () => {
  const {
    activeCampaign,
    currentIndex,
    isOpen,
    isPaused,
    countdown,
    callState,
    notes,
    pauseRunner,
    resumeRunner,
    closeRunner,
    setCountdown,
    setCallState,
    setNotes,
    nextContact,
    finishCurrentItem,
  } = useCampaignRunner();

  const sessions = useSessions((s) => s.sessions);
  const calls = useCalls((s) => s.calls);
  const openDialer = useDialerStore((s) => s.openDialer);

  const countdownTimerRef = useRef<any>(null);

  const currentItem = activeCampaign?.items?.[currentIndex];
  const totalItems = activeCampaign?.items?.length || 0;
  const progressPct = totalItems > 0 ? Math.round(((currentIndex + 1) / totalItems) * 100) : 0;

  const session = sessions.find((s) => s.id === activeCampaign?.sessionId);

  // Monitor live call status in useCalls
  useEffect(() => {
    if (!isOpen || !currentItem || isPaused) return;

    // Find live call matching current item phone
    const rawTarget = currentItem.phone.replace(/\D/g, "");
    const liveCall = calls.find((c) => {
      const p = c.peer.replace(/\D/g, "");
      return (p.includes(rawTarget) || rawTarget.includes(p)) && c.status !== "ended";
    });

    if (liveCall) {
      if (liveCall.status === "connected") {
        setCallState("connected");
        // Clear countdown if connected
        if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
        setCountdown(0);
      } else if (liveCall.status === "ringing" || liveCall.status === "starting") {
        setCallState("calling");
      }
    }
  }, [calls, isOpen, currentItem, isPaused]);

  // Initiate call when item changes and callState is idle
  const handleDialCurrentItem = () => {
    if (!activeCampaign || !currentItem || isPaused) return;
    const rawTarget = currentItem.phone.replace(/\D/g, "");
    if (!rawTarget) return;

    setCallState("calling");
    openDialer(activeCampaign.sessionId, rawTarget);
  };

  // Start 5s countdown between non-answered calls
  const startNextCountdown = (delaySec: number = 5) => {
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    let remaining = delaySec;
    setCountdown(remaining);

    countdownTimerRef.current = setInterval(() => {
      remaining -= 1;
      setCountdown(remaining);
      if (remaining <= 0) {
        clearInterval(countdownTimerRef.current);
        nextContact();
      }
    }, 1000);
  };

  const handleFinishAndNext = async (status: "answered" | "rejected" | "no_answer" | "failed") => {
    await finishCurrentItem(status);

    if (status === "answered") {
      startNextCountdown(activeCampaign?.delaySeconds || 5);
    } else {
      startNextCountdown(activeCampaign?.delaySeconds || 5);
    }
  };

  const handleSkipCountdownNow = () => {
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    setCountdown(0);
    nextContact();
  };

  if (!isOpen || !activeCampaign || !currentItem) return null;

  return (
    <Dialog open={isOpen} onOpenChange={closeRunner}>
      <DialogContent className="max-w-4xl p-0 overflow-hidden border-border bg-card shadow-2xl">
        {/* Top Header Bar */}
        <div className="p-4 bg-muted/60 border-b border-border flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold text-sm shadow-sm shrink-0">
              <PhoneCall className="w-5 h-5 animate-pulse" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base text-foreground truncate leading-tight">{activeCampaign.name}</h3>
                <Badge variant={isPaused ? "secondary" : "success"} className="text-[10px]">
                  {isPaused ? "Pausada" : "Rodando"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                Linha: <strong>{session?.name || activeCampaign.sessionName || "WhatsApp"}</strong> ({session?.phone || activeCampaign.sessionPhone || "Conectada"})
              </p>
            </div>
          </div>

          {/* Action Controls */}
          <div className="flex items-center gap-2">
            {isPaused ? (
              <Button size="sm" onClick={resumeRunner} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 text-xs">
                <Play className="w-4 h-4" /> Retomar
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={pauseRunner} className="gap-1.5 text-xs text-amber-500 border-amber-500/30">
                <Pause className="w-4 h-4" /> Pausar
              </Button>
            )}
            <Button size="icon" variant="ghost" onClick={closeRunner} className="h-8 w-8 text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-muted h-2 relative">
          <div
            className="bg-emerald-500 h-full transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[440px]">
          {/* Left Column (5/12): Contact & Call Status Engine */}
          <div className="lg:col-span-5 p-5 border-r border-border/60 bg-muted/20 flex flex-col justify-between space-y-4">
            {/* Progress Counter Badge */}
            <div className="flex items-center justify-between text-xs text-muted-foreground font-semibold">
              <span>Contato {currentIndex + 1} de {totalItems}</span>
              <span className="font-mono">{progressPct}% Concluído</span>
            </div>

            {/* Current Contact Info Card */}
            <div className="bg-card border border-border/80 rounded-xl p-4 shadow-sm text-center space-y-3 my-auto">
              <div className="h-16 w-16 mx-auto rounded-full overflow-hidden border-2 border-emerald-500/30 bg-muted flex items-center justify-center shadow-md">
                {currentItem.pictureUrl ? (
                  <img src={currentItem.pictureUrl} alt={currentItem.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full bg-emerald-500/10 text-emerald-600 font-extrabold text-xl flex items-center justify-center">
                    {currentItem.name.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>

              <div>
                <h4 className="font-extrabold text-base text-foreground truncate">{currentItem.name}</h4>
                <p className="font-mono text-xs text-muted-foreground mt-0.5">{formatPhoneBR(currentItem.phone)}</p>
              </div>

              {/* Call Status Badge */}
              <div className="pt-1">
                {callState === "connected" ? (
                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 gap-1.5 font-bold px-3 py-1 text-xs animate-pulse">
                    <CheckCircle2 className="w-4 h-4" /> Chamada Conectada / Atendida
                  </Badge>
                ) : callState === "calling" ? (
                  <Badge variant="secondary" className="bg-blue-500/10 text-blue-500 border-blue-500/30 gap-1.5 font-semibold px-3 py-1 text-xs animate-pulse">
                    <AlertCircle className="w-4 h-4" /> Discando para o cliente...
                  </Badge>
                ) : countdown > 0 ? (
                  <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/30 gap-1.5 font-bold px-3 py-1 text-xs">
                    <Clock className="w-4 h-4 animate-spin" /> Próxima discagem em {countdown}s
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground gap-1 text-xs">
                    Pronto para discar
                  </Badge>
                )}
              </div>

              {/* Dial Control Button */}
              {callState === "idle" && countdown === 0 && (
                <Button
                  onClick={handleDialCurrentItem}
                  disabled={isPaused}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-2 mt-2 shadow-xs"
                >
                  <PhoneCall className="w-4 h-4" /> Discar Agora
                </Button>
              )}

              {/* Countdown Skip Button */}
              {countdown > 0 && (
                <Button
                  onClick={handleSkipCountdownNow}
                  variant="outline"
                  className="w-full border-amber-500/30 text-amber-600 hover:bg-amber-500/10 gap-2 mt-2 text-xs"
                >
                  <ChevronRight className="w-4 h-4" /> Pular Delay de {countdown}s & Discar Próximo
                </Button>
              )}
            </div>

            {/* End Call / Result Buttons */}
            <div className="space-y-2 pt-2 border-t border-border/50">
              <span className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider block text-center">
                Registrar Resultado do Atendimento
              </span>

              <div className="grid grid-cols-2 gap-2">
                <Button
                  onClick={() => handleFinishAndNext("answered")}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1.5"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" /> Atendeu
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleFinishAndNext("no_answer")}
                  className="text-rose-500 border-rose-500/30 hover:bg-rose-500/10 text-xs gap-1.5"
                >
                  <PhoneOff className="w-3.5 h-3.5" /> Não Atendeu
                </Button>
              </div>
            </div>
          </div>

          {/* Right Column (7/12): Sales Playbook & Notes */}
          <div className="lg:col-span-7 p-5 flex flex-col justify-between space-y-4">
            {/* Playbook Title */}
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-emerald-500" />
                <h4 className="font-bold text-sm text-foreground">Playbook & Roteiro do Vendedor</h4>
              </div>
              <span className="text-xs text-muted-foreground">Guia de Atendimento</span>
            </div>

            {/* Sales Playbook Script Box */}
            <div className="flex-1 overflow-auto bg-muted/40 border border-border/60 rounded-xl p-4 space-y-2 max-h-[260px]">
              {activeCampaign.playbook ? (
                <div className="text-xs leading-relaxed text-foreground whitespace-pre-wrap font-sans">
                  {activeCampaign.playbook}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">
                  Nenhum roteiro cadastrado nesta campanha. Utilize a conversa livre com o cliente.
                </p>
              )}
            </div>

            {/* Notes Input Field */}
            <div className="space-y-1.5 pt-2 border-t border-border">
              <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                <span>Anotações do Atendimento</span>
                <span className="text-[10px] text-muted-foreground font-normal">Salvo automaticamente</span>
              </label>
              <textarea
                rows={2}
                placeholder="Digite detalhes sobre a resposta do cliente, proposta enviada..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full p-2.5 text-xs rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
