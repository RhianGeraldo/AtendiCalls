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
  Play,
  Clock,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  isPaused = false,
  onResume,
  countdown = 0,
  onSkipCountdown,
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
        const blob = new Blob(recordedChunksRef.current, {
          type: mediaRecorder.mimeType || "audio/webm",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.style.display = "none";
        a.href = url;
        a.download = `chamada_${contactName}_${Date.now()}.${blob.type.includes("mp4") ? "mp4" : "webm"}`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          document.body.removeChild(a);
          window.URL.revokeObjectURL(url);
        }, 100);
        toast.success("Gravação concluída e salva com sucesso!");
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

  const formattedDisplay = formatPhoneBR(phone);
  const activeSession = sessions.find((s) => s.id === currentSid);

  return (
    <div className="w-full h-full rounded-3xl p-4 border-2 border-border bg-card text-foreground flex flex-col justify-between shadow-xl select-none relative overflow-hidden">
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

        {/* Contact Info & Call Status */}
        <div className="space-y-0.5 w-full px-2 shrink-0">
          <h3 className="text-base font-extrabold tracking-tight text-foreground truncate">
            {contactName}
          </h3>
          <p className="text-[11px] text-muted-foreground font-mono">
            {formattedDisplay}
          </p>
          <div className="flex items-center justify-center gap-2 pt-0.5">
            {activeCall ? (
              <Badge variant={statusVariant[activeCall.status as CallStatus]} className="px-2.5 py-0.5 text-[10px] font-semibold">
                {statusLabel[activeCall.status as CallStatus] || activeCall.status}
              </Badge>
            ) : countdown > 0 ? (
              <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/30 gap-1 text-[10px] font-bold">
                <Clock className="w-3 h-3 animate-spin" /> Próxima discagem em {countdown}s
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground text-[10px]">
                Pronto para discar
              </Badge>
            )}

            {activeCall?.status === "connected" && (
              <span className="text-[11px] font-mono font-bold text-emerald-600 dark:text-emerald-400">
                {formatCallDuration(activeCall.startedAt, activeCall.status, activeCall.connectedAt)}
              </span>
            )}
          </div>
        </div>

        {/* Live Audio Waveform Meter */}
        {activeCall?.status === "connected" && (
          <div className="w-full px-4 space-y-0.5 my-1 shrink-0">
            <div className="flex items-center justify-between text-[10px] text-muted-foreground font-medium">
              <span className="flex items-center gap-1">
                <Radio className="h-3 w-3 animate-pulse text-emerald-500" /> Áudio ao vivo
              </span>
              <span>{isMuted ? "Silenciado" : "Ativo"}</span>
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

        {/* CALL CONTROL BUTTONS */}
        {activeCall ? (
          <div className="flex items-center justify-center gap-4 w-full pt-1 mb-1 shrink-0">
            {/* Mute Button */}
            <button
              type="button"
              onClick={toggleMute}
              disabled={activeCall.status !== "connected"}
              className={`flex h-10 w-10 items-center justify-center rounded-full border transition-all ${
                isMuted
                  ? "bg-slate-800 text-white border-slate-800 shadow-md"
                  : "bg-muted/50 hover:bg-muted text-foreground border-muted-foreground/20"
              } disabled:opacity-40 disabled:pointer-events-none`}
              title={isMuted ? "Desmutar Microfone" : "Silenciar Microfone"}
            >
              {isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4 text-emerald-600" />}
            </button>

            {/* Record Button */}
            <button
              type="button"
              onClick={toggleRecording}
              disabled={activeCall.status !== "connected"}
              className={`flex h-10 w-10 items-center justify-center rounded-full border transition-all ${
                isRecording
                  ? "bg-red-600 text-white border-red-600 shadow-md animate-pulse"
                  : "bg-muted/50 hover:bg-muted text-red-500 border-muted-foreground/20"
              } disabled:opacity-40 disabled:pointer-events-none`}
              title={isRecording ? "Parar Gravação" : "Gravar Chamada"}
            >
              {isRecording ? <Square className="h-4 w-4 fill-white" /> : <Disc className="h-4 w-4" />}
            </button>

            {/* Hangup Button */}
            <button
              type="button"
              onClick={handleHangup}
              disabled={endCall.isPending}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-[#ef4444] hover:bg-[#dc2626] text-white shadow-lg shadow-red-500/30 hover:scale-105 active:scale-95 transition-all"
              title="Finalizar Chamada"
            >
              <PhoneOff className="h-5 w-5" />
            </button>
          </div>
        ) : countdown > 0 ? (
          /* Pular Delay Button */
          <Button
            type="button"
            onClick={onSkipCountdown}
            variant="outline"
            className="w-full border-amber-500/30 text-amber-600 hover:bg-amber-500/10 gap-1.5 text-xs font-bold py-4 rounded-xl shrink-0"
          >
            <ChevronRight className="w-4 h-4" /> Pular Delay de {countdown}s
          </Button>
        ) : isPaused ? (
          /* Iniciar Disparo Button */
          <Button
            type="button"
            onClick={onResume}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold gap-2 py-4 text-xs shadow-md rounded-xl shrink-0"
          >
            <Play className="w-4 h-4 fill-white" /> Iniciar Disparo
          </Button>
        ) : (
          /* Discar Agora Button */
          <Button
            type="button"
            onClick={handleCall}
            disabled={startCall.isPending}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-2 py-4 text-xs shadow-md rounded-xl shrink-0"
          >
            <Phone className="w-4 h-4" />
            {startCall.isPending ? "Iniciando..." : "Discar Agora"}
          </Button>
        )}

        <audio ref={audioRef} autoPlay />
      </div>

      {/* DISCAGEM AUTOMÁTICA SWITCH FOOTER */}
      {setAutoDial && (
        <div className="pt-2 border-t border-border/40 flex items-center justify-between px-1 text-xs shrink-0 mt-auto">
          <div className="flex items-center gap-1.5 text-muted-foreground font-semibold">
            <Zap className={`w-3.5 h-3.5 ${autoDial ? "text-emerald-500 fill-emerald-500" : "text-muted-foreground"}`} />
            <span>Discagem Automática:</span>
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
  );
};
