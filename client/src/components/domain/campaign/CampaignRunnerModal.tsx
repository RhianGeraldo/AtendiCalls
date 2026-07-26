import { useEffect, useRef, useState } from "react";
import { 
  PhoneCall, Play, Pause, FileText, ChevronRight, ChevronLeft, MessageSquare, AlertTriangle, Layers
} from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCampaignRunner } from "@/stores/campaignRunner";
import { useCalls } from "@/stores/calls";
import { useSessions } from "@/stores/sessions";
import { useDevices } from "@/stores/devices";
import { useStartCall } from "@/hooks/useStartCall";
import { useEndCall } from "@/hooks/useEndCall";
import { parsePlaybookContent, PlaybookStage } from "@/types/playbook";
import { VirtualPhonePanel } from "@/components/domain/call/VirtualPhonePanel";

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
  const micId = useDevices((s) => s.micId);

  const countdownTimerRef = useRef<any>(null);

  // Active Embedded Call Hooks
  const startCallMutation = useStartCall(activeCampaign?.sessionId || "", micId);
  const endCallMutation = useEndCall();

  // State
  const [autoDial, setAutoDial] = useState(true); // Auto-dial on by default

  // Playbook Stage State
  const [activeStageIdx, setActiveStageIdx] = useState(0);
  const [maxStageReachedIdx, setMaxStageReachedIdx] = useState(0);
  const [expandedObjectionIdx, setExpandedObjectionIdx] = useState<number | null>(null);

  const currentItem = activeCampaign?.items?.[currentIndex];
  const totalItems = activeCampaign?.items?.length || 0;
  const progressPct = totalItems > 0 ? Math.round(((currentIndex + 1) / totalItems) * 100) : 0;

  const session = sessions.find((s) => s.id === activeCampaign?.sessionId);

  // Find active WebRTC call for current session & contact
  const activeCall = calls.find((c) => c.sessionId === activeCampaign?.sessionId && c.status !== "ended");

  // Parse playbook stages
  const parsedPb = parsePlaybookContent(activeCampaign?.playbook || "");
  const isStagesMode = parsedPb.mode === "stages" && parsedPb.stages.length > 0;
  const currentStage: PlaybookStage | undefined = isStagesMode ? parsedPb.stages[activeStageIdx] : undefined;

  // Reset stage index & call timer when contact changes
  useEffect(() => {
    setActiveStageIdx(0);
    setMaxStageReachedIdx(0);
    setExpandedObjectionIdx(null);
  }, [currentIndex]);

  // Keep track of highest stage reached during campaign run
  useEffect(() => {
    if (activeStageIdx > maxStageReachedIdx) {
      setMaxStageReachedIdx(activeStageIdx);
    }
  }, [activeStageIdx]);

  // Monitor active call status
  useEffect(() => {
    if (!isOpen || !currentItem) return;

    if (activeCall) {
      if (activeCall.status === "connected") {
        setCallState("connected");
        // Stop countdown if connected
        if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
        setCountdown(0);
      } else if (activeCall.status === "ringing" || activeCall.status === "starting") {
        setCallState("calling");
      }
    } else if (callState === "connected" || callState === "calling") {
      setCallState("idle");
    }
  }, [activeCall, isOpen, currentItem]);

  // Track previous call state to detect call termination transitions for auto-progression
  const prevCallStateRef = useRef(callState);

  useEffect(() => {
    if (!isOpen || !currentItem || isPaused) return;

    const prev = prevCallStateRef.current;
    prevCallStateRef.current = callState;

    // AUTO-PROGRESSION WHEN AUTO-DIAL IS ON:
    if (autoDial && countdown === 0) {
      // Transition 1: Call was CONNECTED and now ended (hangup by seller or client)
      if (prev === "connected" && callState === "idle") {
        handleFinishAndNext("answered");
        return;
      }
      // Transition 2: Call was CALLING (discando) and now ended/rejected without connecting
      if (prev === "calling" && callState === "idle") {
        handleFinishAndNext("no_answer");
        return;
      }

      // Transition 3: Auto-dial current contact if idle and no call active
      if (
        callState === "idle" &&
        !startCallMutation.isPending &&
        !activeCall
      ) {
        handleDialCurrentItem();
      }
    }
  }, [isOpen, autoDial, isPaused, currentItem, callState, countdown]);

  // Initiate WebRTC Call directly embedded inside Campaign Runner
  const handleDialCurrentItem = () => {
    if (!activeCampaign || !currentItem || isPaused) return;
    const rawTarget = currentItem.phone.replace(/\D/g, "");
    if (!rawTarget) return;

    setCallState("calling");

    startCallMutation.mutate(
      { phone: rawTarget, record: false },
      {
        onError: () => {
          setCallState("idle");
        },
      }
    );
  };

  // Start 5s countdown between contacts
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
    // Hangup if still in call
    if (activeCall && activeCampaign) {
      endCallMutation.mutate({ sid: activeCampaign.sessionId, callId: activeCall.callId });
    }

    // Record highest stage reached in notes
    let stageNote = "";
    if (isStagesMode && parsedPb.stages[maxStageReachedIdx]) {
      stageNote = ` [Atingiu: ${parsedPb.stages[maxStageReachedIdx].title}]`;
      if (!notes.includes(stageNote)) {
        setNotes((notes || "") + stageNote);
      }
    }

    await finishCurrentItem(status);
    startNextCountdown(activeCampaign?.delaySeconds || 5);
  };

  const handleSkipCountdownNow = () => {
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    setCountdown(0);
    nextContact();
  };

  if (!isOpen || !activeCampaign || !currentItem) return null;

  return (
    <Dialog open={isOpen} onOpenChange={closeRunner}>
      {/* FIXED DIALOG CONTAINER WITH SINGLE DEFAULT CLOSE BUTTON */}
      <DialogContent className="max-w-5xl h-[620px] max-h-[90vh] p-0 overflow-hidden border-border bg-card shadow-2xl flex flex-col justify-between">
        {/* Top Header Bar */}
        <div className="p-3.5 bg-muted/60 border-b border-border flex items-center justify-between gap-4 shrink-0 pr-10">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-9 w-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold text-sm shadow-sm shrink-0">
              <PhoneCall className="w-4 h-4 animate-pulse" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm text-foreground truncate leading-tight">{activeCampaign.name}</h3>
                <Badge variant={isPaused ? "secondary" : "success"} className="text-[10px]">
                  {isPaused ? "Pausada" : "Rodando"}
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                Linha: <strong>{session?.name || activeCampaign.sessionName || "WhatsApp"}</strong> ({session?.phone || activeCampaign.sessionPhone || "Conectada"})
              </p>
            </div>
          </div>

          {/* Action Controls */}
          <div className="flex items-center gap-2">
            {isPaused ? (
              <Button size="sm" onClick={resumeRunner} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 text-xs h-8 font-bold">
                <Play className="w-3.5 h-3.5 fill-white" /> Retomar Disparos
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={pauseRunner} className="gap-1.5 text-xs text-amber-500 border-amber-500/30 h-8 font-bold">
                <Pause className="w-3.5 h-3.5" /> Pausar
              </Button>
            )}
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-muted h-1.5 relative shrink-0">
          <div
            className="bg-emerald-500 h-full transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {/* Main Content Grid (Fixed Height Container) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 flex-1 overflow-hidden">
          {/* Left Column (5/12): FULL-SIZE AUTHENTIC CELULAR VIRTUAL (SOFTPHONE) */}
          <div className="lg:col-span-5 p-3.5 border-r border-border/60 bg-muted/20 flex flex-col justify-between overflow-hidden">
            {/* Progress Counter Badge */}
            <div className="flex items-center justify-between text-xs text-muted-foreground font-semibold mb-2 shrink-0">
              <span>Contato {currentIndex + 1} de {totalItems}</span>
              <span className="font-mono">{progressPct}% Concluído</span>
            </div>

            {/* FULL-SIZE AUTHENTIC CELULAR VIRTUAL */}
            <div className="flex-1 overflow-hidden">
              <VirtualPhonePanel
                sessionId={activeCampaign.sessionId}
                phone={currentItem.phone}
                contactName={currentItem.name}
                pictureUrl={currentItem.pictureUrl}
                isPaused={isPaused}
                onResume={resumeRunner}
                countdown={countdown}
                onSkipCountdown={handleSkipCountdownNow}
                autoDial={autoDial}
                setAutoDial={setAutoDial}
              />
            </div>
          </div>

          {/* Right Column (7/12): FIXED HEIGHT STORIES PLAYBOOK */}
          <div className="lg:col-span-7 p-4 flex flex-col justify-between space-y-3 overflow-hidden">
            {/* Playbook Header Bar */}
            <div className="flex items-center justify-between border-b border-border pb-2 shrink-0">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-emerald-500" />
                <h4 className="font-bold text-xs text-foreground uppercase tracking-wider">Playbook & Roteiro do Vendedor</h4>
              </div>
              {isStagesMode && (
                <Badge variant="outline" className="text-[10px] text-emerald-600 dark:text-emerald-400 border-emerald-500/30 gap-1 font-semibold">
                  <Layers className="w-3 h-3" /> Modo Etapas ({parsedPb.stages.length})
                </Badge>
              )}
            </div>

            {/* IF STAGES MODE: INSTAGRAM STORIES SEGMENTED BAR + FIXED HEIGHT SCRIPT */}
            {isStagesMode ? (
              <div className="space-y-3 flex-1 flex flex-col justify-between overflow-hidden">
                {/* 1. INSTAGRAM STORIES SEGMENTED PROGRESS LINE */}
                <div className="flex items-center gap-1.5 w-full shrink-0">
                  {parsedPb.stages.map((_, idx) => {
                    const active = idx === activeStageIdx;
                    const passed = idx < activeStageIdx;
                    return (
                      <button
                        key={idx}
                        onClick={() => setActiveStageIdx(idx)}
                        className={`h-1.5 flex-1 rounded-full transition-all ${
                          active
                            ? "bg-emerald-500 ring-2 ring-emerald-500/30"
                            : passed
                            ? "bg-emerald-500/50"
                            : "bg-muted"
                        }`}
                        title={`Ir para etapa ${idx + 1}`}
                      />
                    );
                  })}
                </div>

                {/* 2. STAGE TITLE BAR */}
                {currentStage && (
                  <div className="flex items-center justify-between bg-muted/40 px-3 py-1.5 rounded-lg border border-border/60 shrink-0">
                    <span className="font-extrabold text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5" /> {currentStage.title}
                    </span>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      Etapa {activeStageIdx + 1} de {parsedPb.stages.length}
                    </span>
                  </div>
                )}

                {/* 3. ACTIVE STAGE SCRIPT BOX (EXPANDED READING AREA) */}
                {currentStage && (
                  <div className="flex-1 flex flex-col justify-between space-y-2 overflow-hidden">
                    {/* Reading Container */}
                    <div className="flex-1 min-h-[160px] overflow-y-auto bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-3.5 text-xs leading-relaxed text-foreground whitespace-pre-wrap font-sans">
                      {currentStage.script}
                    </div>

                    {/* Objections Accordion */}
                    {currentStage.objections && currentStage.objections.length > 0 && (
                      <div className="space-y-1.5 shrink-0">
                        <span className="text-[10px] font-bold text-amber-500 uppercase tracking-wider flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> Tratativa de Objeções nesta Etapa
                        </span>

                        <div className="max-h-24 overflow-y-auto space-y-1">
                          {currentStage.objections.map((obj, oIdx) => {
                            const isExp = expandedObjectionIdx === oIdx;
                            return (
                              <div key={oIdx} className="rounded-lg border border-amber-500/20 bg-amber-500/5 overflow-hidden text-xs">
                                <button
                                  type="button"
                                  onClick={() => setExpandedObjectionIdx(isExp ? null : oIdx)}
                                  className="w-full text-left p-1.5 font-bold text-amber-600 dark:text-amber-400 flex items-center justify-between hover:bg-amber-500/10 transition-colors"
                                >
                                  <span className="truncate">⚡ Cliente disse: "{obj.trigger}"</span>
                                  <span className="text-[10px] underline shrink-0">{isExp ? "Ocultar" : "Ver resposta"}</span>
                                </button>

                                {isExp && (
                                  <div className="p-2 bg-background border-t border-amber-500/20 text-foreground font-medium whitespace-pre-wrap leading-normal text-[11px]">
                                    💡 <strong>O que responder:</strong> {obj.response}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Stage Navigation Footer */}
                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-border shrink-0">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={activeStageIdx === 0}
                        onClick={() => setActiveStageIdx((i) => Math.max(0, i - 1))}
                        className="text-xs gap-1 h-8"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" /> Etapa Anterior
                      </Button>

                      <Button
                        type="button"
                        size="sm"
                        disabled={activeStageIdx === parsedPb.stages.length - 1}
                        onClick={() => setActiveStageIdx((i) => Math.min(parsedPb.stages.length - 1, i + 1))}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1 font-bold h-8"
                      >
                        Próxima Etapa <ChevronRight className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* PLAIN TEXT MODE */
              <div className="flex-1 overflow-auto bg-muted/40 border border-border/60 rounded-xl p-3 space-y-2 max-h-[280px]">
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
            )}

            {/* Notes Input Field */}
            <div className="space-y-1 pt-1 border-t border-border shrink-0">
              <label className="text-[11px] font-semibold text-foreground flex items-center justify-between">
                <span>Anotações do Atendimento</span>
                <span className="text-[10px] text-muted-foreground font-normal">Salvo automaticamente</span>
              </label>
              <textarea
                rows={2}
                placeholder="Digite detalhes sobre a resposta do cliente..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full p-2 text-xs rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
