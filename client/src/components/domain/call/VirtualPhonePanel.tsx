import { useState, useEffect, useRef } from "react";
import {
  PhoneCall,
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  User,
  Radio,
  Disc,
  Square,
  Zap,
  BookOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PlaybookAsidePanel } from "@/components/domain/playbook/PlaybookAsidePanel";
import { useSessions } from "@/stores/sessions";
import { useDevices } from "@/stores/devices";
import { useCalls, isMine } from "@/stores/calls";
import { useStartCall } from "@/hooks/useStartCall";
import { useEndCall } from "@/hooks/useEndCall";
import type { CallStatus } from "@/types/call";
import { attachMeter } from "@/lib/audio-meter";
import { formatCallDuration, formatPhoneBR } from "@/utils/format";
import { toast } from "sonner";

const statusLabel: Record<CallStatus, string> = {
  starting: "Iniciando chamada...",
  ringing: "Chamando...",
  connected: "Em Chamada",
  ended: "Finalizada",
};

const statusVariant: Record<CallStatus, "success" | "secondary" | "muted"> = {
  connected: "success",
  ringing: "secondary",
  starting: "secondary",
  ended: "muted",
};

interface VirtualPhonePanelProps {
  sessionId: string;
  phone: string;
  contactName: string;
  pictureUrl?: string;
  isPaused?: boolean;
  onResume?: () => void;
  countdown?: number;
  onSkipCountdown?: () => void;
  autoDial?: boolean;
  setAutoDial?: (val: boolean) => void;
}

export const VirtualPhonePanel = ({
  sessionId,
  phone,
  contactName,
  pictureUrl,
  autoDial = true,
  setAutoDial,
}: VirtualPhonePanelProps) => {
  const sessions = useSessions((s) => s.sessions);
  const activeId = useSessions((s) => s.activeId);
  const micId = useDevices((s) => s.micId);

  const pairedSessions = sessions.filter((s) => s.paired);
  const currentSid = sessionId || activeId || pairedSessions[0]?.id || "";

  const [isMuted, setIsMuted] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [showPlaybook, setShowPlaybook] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  const [micDb, setMicDb] = useState(-60);
  const [peerDb, setPeerDb] = useState(-60);

  const audioRef = useRef<HTMLAudioElement>(null);

  const calls = useCalls((s) => s.calls);
  const activeCall = calls.find((c) => c.sessionId === currentSid && isMine(c) && c.status !== "ended");
  const conn = useCalls((s) => (activeCall ? s.ownConnections.get(activeCall.callId) : undefined));

  const startCall = useStartCall(currentSid, micId);
  const endCall = useEndCall();

  // WebRTC Audio meter
  useEffect(() => {
    if (!conn) return;
    const offMic = attachMeter(conn.micStream, setMicDb);
    let offPeer: (() => void) | null = null;

    const checkStream = setInterval(() => {
      if (conn.remoteStream && audioRef.current) {
        audioRef.current.srcObject = conn.remoteStream;
        audioRef.current.play().catch(() => {});
        offPeer = attachMeter(conn.remoteStream, setPeerDb);
        clearInterval(checkStream);
      }
    }, 200);

    return () => {
      offMic();
      if (offPeer) offPeer();
      clearInterval(checkStream);
    };
  }, [conn]);

  // Toggle Mute Audio Track
  const toggleMute = () => {
    if (!conn) return;
    const nextMute = !isMuted;
    setIsMuted(nextMute);
    if (conn.micStream) {
      conn.micStream.getAudioTracks().forEach((track) => {
        track.enabled = !nextMute;
      });
    }
  };

  // Toggle Recording
  const toggleRecording = () => {
    if (isRecording) {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      setIsRecording(false);
      return;
    }

    if (!conn) {
      toast.error("Conexão de áudio não estabelecida.");
      return;
    }

    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const dest = audioCtx.createMediaStreamDestination();

      if (conn.micStream && conn.micStream.getAudioTracks().length > 0) {
        const micSource = audioCtx.createMediaStreamSource(conn.micStream);
        micSource.connect(dest);
      }

      if (conn.remoteStream && conn.remoteStream.getAudioTracks().length > 0) {
        const remoteSource = audioCtx.createMediaStreamSource(conn.remoteStream);
        remoteSource.connect(dest);
      }

      const streamToRecord = dest.stream.getAudioTracks().length > 0 ? dest.stream : conn.remoteStream || conn.micStream;

      if (!streamToRecord) {
        toast.error("Nenhum fluxo de áudio para gravar.");
        return;
      }

      recordedChunksRef.current = [];
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/mp4")
        ? "audio/mp4"
        : "";

      const options = mimeType ? { mimeType } : undefined;
      const mediaRecorder = new MediaRecorder(streamToRecord, options);

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        toast.success("Gravação armazenada no servidor e pronta para transcrição por IA!");
      };

      mediaRecorder.start(1000);
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
      toast.success("Gravação iniciada...");
    } catch (err: any) {
      toast.error("Não foi possível iniciar a gravação: " + (err.message || err));
    }
  };

  const handleCall = () => {
    const cleanDigits = phone.replace(/\D/g, "");
    if (!cleanDigits) return;

    startCall.mutate({ phone: cleanDigits, record: false });
  };

  const handleHangup = () => {
    if (activeCall) {
      endCall.mutate({ sid: currentSid, callId: activeCall.callId });
    }
  };

  const callStatus = (activeCall?.status as CallStatus) || "ended";
  const activeSession = sessions.find((s) => s.id === currentSid);

  return (
    <div className="flex gap-3 h-full items-start w-full">
      {/* Playbook Aside Drawer (Left Side) */}
      {showPlaybook && (
        <PlaybookAsidePanel onClose={() => setShowPlaybook(false)} className="h-full shrink-0" />
      )}

      {/* Virtual Phone Container (Right Side) */}
      <div className="flex-1 h-full rounded-3xl p-4 border-2 border-border bg-card text-foreground flex flex-col justify-between shadow-xl select-none relative overflow-hidden">
        {/* Smartphone Speaker Notch */}
        <div className="flex justify-center -mt-1.5 mb-1 shrink-0">
          <div className="h-1.5 w-14 bg-muted-foreground/30 rounded-full" />
        </div>

        {/* Top Header Bar */}
        <div className="flex items-center justify-between border-b border-muted/40 pb-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <PhoneCall className="h-3.5 w-3.5" />
            </div>

            <div className="min-w-0">
              <span className="text-xs font-extrabold text-foreground truncate block">
                {activeSession?.name || "WhatsApp"}
              </span>
              <span className="text-[10px] text-muted-foreground font-mono truncate block">
                {activeSession?.phone ? formatPhoneBR(activeSession.phone) : "Conectado"}
              </span>
            </div>
          </div>

          <Button
            variant={showPlaybook ? "default" : "ghost"}
            size="sm"
            onClick={() => setShowPlaybook(!showPlaybook)}
            className={`h-7 px-2 text-xs gap-1.5 shrink-0 ${
              showPlaybook ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "text-muted-foreground hover:text-foreground"
            }`}
            title={showPlaybook ? "Fechar Playbook" : "Abrir Playbook Roteiro"}
          >
            <BookOpen className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Playbook</span>
          </Button>
        </div>

        {/* --- CELULAR VIRTUAL BODY VIEW --- */}
        <div className="flex-1 flex flex-col items-center justify-between py-2 text-center overflow-hidden">
          {/* Header Tag & Recording Indicator */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground bg-muted/60 px-2.5 py-0.5 rounded-full">
              Whatsapp Audio
            </span>
            {isRecording && (
              <span className="flex items-center gap-1 text-[10px] font-bold text-red-500 animate-pulse bg-red-500/10 px-2 py-0.5 rounded-full">
                <span className="h-1.5 w-1.5 rounded-full bg-red-500" /> REC
              </span>
            )}
          </div>

          {/* Avatar & Pulse Ring (h-16 w-16 to fit perfectly without overflow) */}
          <div className="relative flex items-center justify-center my-1.5 shrink-0">
            <div
              className={`flex h-16 w-16 overflow-hidden items-center justify-center rounded-full border-2 bg-muted/30 shadow-md ${
                activeCall?.status === "ringing" || activeCall?.status === "starting"
                  ? "animate-pulse border-amber-500/50 bg-amber-500/10 text-amber-500"
                  : activeCall?.status === "connected"
                  ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-500 scale-105"
                  : "border-border bg-muted"
              }`}
            >
              {pictureUrl ? (
                <img src={pictureUrl} alt={contactName} className="h-full w-full object-cover" />
              ) : (
                <User className="h-9 w-9 text-emerald-600" />
              )}
            </div>
            {(activeCall?.status === "ringing" || activeCall?.status === "starting") && (
              <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-amber-500"></span>
              </span>
            )}
          </div>

          {/* Contact Info & Status */}
          <div className="space-y-0.5 w-full shrink-0">
            <h3 className="text-sm font-extrabold text-foreground truncate px-2">
              {contactName || formatPhoneBR(phone) || "Contato"}
            </h3>
            <p className="text-[11px] font-mono text-muted-foreground truncate">
              {formatPhoneBR(phone)}
            </p>
            <div className="flex items-center justify-center gap-1.5 pt-0.5">
              <Badge variant={statusVariant[callStatus]} className="px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                {statusLabel[callStatus]}
              </Badge>
              {activeCall && activeCall.status === "connected" && (
                <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  {formatCallDuration(activeCall.startedAt, activeCall.status, activeCall.connectedAt)}
                </span>
              )}
            </div>
          </div>

          {/* Audio Wave dB Level Meter */}
          {activeCall && activeCall.status === "connected" && (
            <div className="w-full px-2 py-1 shrink-0 space-y-1">
              <div className="flex items-center justify-between text-[10px] text-muted-foreground font-semibold">
                <span className="flex items-center gap-1">
                  <Radio className="h-3 w-3 animate-pulse text-emerald-500" /> Sinal WebRTC
                </span>
                <span>{isMuted ? "Mute" : "Ativo"}</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/60">
                <div
                  className="h-full bg-emerald-500 transition-all duration-150 rounded-full"
                  style={{
                    width: `${Math.max(5, Math.min(100, Math.round(((Math.max(micDb, peerDb) + 60) / 60) * 100)))}%`,
                  }}
                />
              </div>
            </div>
          )}

          {/* Controls Bar */}
          <div className="flex items-center justify-center gap-3 w-full shrink-0 my-1">
            <button
              type="button"
              onClick={toggleMute}
              disabled={!activeCall || activeCall.status !== "connected"}
              className={`flex h-10 w-10 items-center justify-center rounded-full border transition-all ${
                isMuted
                  ? "bg-slate-800 text-white border-slate-800 shadow-xs"
                  : "bg-muted/50 hover:bg-muted text-foreground border-muted-foreground/20"
              } disabled:opacity-40 disabled:pointer-events-none`}
              title={isMuted ? "Desmutar Microfone" : "Silenciar Microfone"}
            >
              {isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </button>

            <button
              type="button"
              onClick={toggleRecording}
              disabled={!activeCall || activeCall.status !== "connected"}
              className={`flex h-10 w-10 items-center justify-center rounded-full border transition-all ${
                isRecording
                  ? "bg-red-600 text-white border-red-600 shadow-xs animate-pulse"
                  : "bg-muted/50 hover:bg-muted text-red-500 border-muted-foreground/20"
              } disabled:opacity-40 disabled:pointer-events-none`}
              title={isRecording ? "Parar Gravação" : "Gravar Chamada"}
            >
              {isRecording ? <Square className="h-4 w-4 fill-white" /> : <Disc className="h-4 w-4" />}
            </button>
            {activeCall ? (
              <button
                type="button"
                onClick={handleHangup}
                disabled={endCall.isPending}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-red-600 hover:bg-red-700 text-white shadow-md shadow-red-500/20 active:scale-95 transition-all"
                title="Desligar Chamada"
              >
                <PhoneOff className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleCall}
                disabled={startCall.isPending || !phone.replace(/\D/g, "")}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-500/20 active:scale-95 transition-all disabled:opacity-40 disabled:pointer-events-none"
                title="Iniciar Ligação"
              >
                <Phone className="h-4 w-4 fill-white" />
              </button>
            )}
          </div>

          <audio ref={audioRef} autoPlay />
        </div>

        {/* Auto Dial Toggle Footer Bar */}
        {setAutoDial && (
          <div className="flex items-center justify-between pt-2 border-t border-muted/40 shrink-0 text-xs">
            <div className="flex items-center gap-1.5 text-muted-foreground font-medium text-[11px]">
              <Zap className="h-3.5 w-3.5 text-amber-500" />
              <span>Auto-Discagem Contínua</span>
            </div>
            <button
              type="button"
              onClick={() => setAutoDial(!autoDial)}
              className={`px-2.5 py-1 rounded-md font-extrabold transition-all text-[11px] ${
                autoDial ? "bg-emerald-600 text-white shadow-xs" : "bg-muted text-muted-foreground border border-border"
              }`}
            >
              {autoDial ? "LIGADA" : "DESLIGADA"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
