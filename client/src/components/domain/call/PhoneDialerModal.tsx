import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  PhoneCall,
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  Delete,
  X,
  ChevronDown,
  User,
  Radio,
  GripHorizontal,
  Disc,
  Square,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useDialerStore } from "@/stores/dialer";
import { useSessions } from "@/stores/sessions";
import { useDevices } from "@/stores/devices";
import { useCalls, isMine } from "@/stores/calls";
import { useStartCall } from "@/hooks/useStartCall";
import { useEndCall } from "@/hooks/useEndCall";
import { useAcceptCall } from "@/hooks/useAcceptCall";
import { useRejectCall } from "@/hooks/useRejectCall";
import type { CallStatus } from "@/types/call";
import { attachMeter } from "@/lib/audio-meter";
import { formatCallDuration } from "@/utils/format";
import { toast } from "sonner";

const KEYPAD = [
  { key: "1", sub: "" },
  { key: "2", sub: "ABC" },
  { key: "3", sub: "DEF" },
  { key: "4", sub: "GHI" },
  { key: "5", sub: "JKL" },
  { key: "6", sub: "MNO" },
  { key: "7", sub: "PQRS" },
  { key: "8", sub: "TUV" },
  { key: "9", sub: "WXYZ" },
  { key: "*", sub: "" },
  { key: "0", sub: "+" },
  { key: "#", sub: "" },
];

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

function formatPhoneBR(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.startsWith("55") && digits.length >= 12) {
    const ddd = digits.slice(2, 4);
    const rest = digits.slice(4);
    if (rest.length === 8) {
      return `+55 (${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
    }
    return `+55 (${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`;
  }
  return raw;
}

export const PhoneDialerModal = () => {
  const { isOpen, closeDialer, selectedSid, setSelectedSid, initialPhone } = useDialerStore();
  const sessions = useSessions((s) => s.sessions);
  const activeId = useSessions((s) => s.activeId);
  const micId = useDevices((s) => s.micId);
  const outDeviceId = useDevices((s) => s.outId);

  const pairedSessions = sessions.filter((s) => s.paired);
  const currentSid = selectedSid || activeId || (pairedSessions[0]?.id ?? "");

  const [phone, setPhone] = useState(initialPhone);
  const [isMuted, setIsMuted] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  const [micDb, setMicDb] = useState(-60);
  const [peerDb, setPeerDb] = useState(-60);
  const [, forceUpdate] = useState(0);

  // Drag-and-drop state & container ref
  const containerRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const isDraggingRef = useRef(false);
  const dragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const audioRef = useRef<HTMLAudioElement>(null);

  // Active call for current session
  const calls = useCalls((s) => s.calls);
  const activeCall = calls.find((c) => c.sessionId === currentSid && isMine(c));
  const conn = useCalls((s) => (activeCall ? s.ownConnections.get(activeCall.callId) : undefined));

  const activeSession = sessions.find((s) => s.id === currentSid);
  const startCall = useStartCall(currentSid, micId);
  const endCall = useEndCall();

  // Incoming call
  const incoming = useCalls((s) => s.incoming);
  const accept = useAcceptCall(micId);
  const reject = useRejectCall();
  const isIncomingForSession = incoming && incoming.sessionId === currentSid;

  // Ring tone logic for incoming calls
  useEffect(() => {
    if (!incoming) return;
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    let ctx: AudioContext;
    try {
      ctx = new AC();
    } catch {
      return;
    }
    let cancelled = false;
    const playToneAt = (when: number, durationSec: number, freq: number, gainVal = 0.18) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const t = ctx.currentTime + when;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(gainVal, t + 0.02);
      gain.gain.linearRampToValueAtTime(gainVal, t + durationSec - 0.02);
      gain.gain.linearRampToValueAtTime(0, t + durationSec);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + durationSec + 0.05);
    };
    const scheduleCycle = () => {
      if (cancelled) return;
      playToneAt(0, 1.0, 440);
      playToneAt(0, 1.0, 480);
      setTimeout(scheduleCycle, 3000);
    };
    scheduleCycle();
    return () => {
      cancelled = true;
      void ctx.close().catch(() => {});
    };
  }, [incoming]);

  // Open dialer automatically when incoming call arrives
  useEffect(() => {
    if (incoming) {
      useDialerStore.getState().openDialer(incoming.sessionId);
    }
  }, [incoming]);

  // Reset or preset phone when opened
  useEffect(() => {
    if (isOpen && initialPhone) {
      setPhone(initialPhone);
    }
  }, [isOpen, initialPhone]);

  // Set default initial position (fixed bottom-6 right-6) when opened
  useEffect(() => {
    if (isOpen && pos === null && typeof window !== "undefined") {
      setPos({
        x: Math.max(16, window.innerWidth - 360),
        y: Math.max(16, window.innerHeight - 580),
      });
    }
  }, [isOpen, pos]);

  // Timer updater for active call
  useEffect(() => {
    if (!activeCall) return;
    const interval = setInterval(() => forceUpdate((n) => n + 1), 1000);
    return () => clearInterval(interval);
  }, [activeCall]);

  // Stop recording automatically when call ends or status changes
  useEffect(() => {
    if (!activeCall || activeCall.status !== "connected") {
      if (isRecording && mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current = null;
        setIsRecording(false);
      }
    }
  }, [activeCall?.status, isRecording]);

  // Meter & Remote Stream setup
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
      offPeer?.();
      clearInterval(checkStream);
    };
  }, [conn]);

  // Sink ID for audio output
  useEffect(() => {
    const el = audioRef.current as (HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }) | null;
    if (!el || !outDeviceId || typeof el.setSinkId !== "function") return;
    el.setSinkId(outDeviceId).catch(() => {});
  }, [outDeviceId, conn]);

  const handleKeyPress = (key: string) => {
    setPhone((prev) => prev + key);
  };

  const handleBackspace = () => {
    setPhone((prev) => prev.slice(0, -1));
  };

  const toggleMute = () => {
    if (conn?.micStream) {
      const nextMuted = !isMuted;
      conn.micStream.getAudioTracks().forEach((track) => {
        track.enabled = !nextMuted;
      });
      setIsMuted(nextMuted);
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current = null;
        setIsRecording(false);
      }
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
        toast.error("Nenhum fluxo de áudio disponível para gravar.");
        return;
      }

      const recorder = new MediaRecorder(streamToRecord, { mimeType: "audio/webm" });
      recordedChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        if (recordedChunksRef.current.length === 0) return;
        const blob = new Blob(recordedChunksRef.current, { type: "audio/webm" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.style.display = "none";
        a.href = url;
        const peerName = activeCall?.name || activeCall?.peer || "chamada";
        const cleanName = peerName.replace(/[^a-zA-Z0-9]/g, "_");
        a.download = `gravacao_${cleanName}_${Date.now()}.webm`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }, 100);
        toast.success("Gravação da chamada salva!");
      };

      recorder.start(1000);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      toast.success("Gravação da chamada iniciada!");
    } catch (err: any) {
      toast.error("Não foi possível iniciar a gravação: " + (err.message || err));
    }
  };

  const handleCall = () => {
    if (!currentSid) {
      toast.error("Nenhuma conta selecionada.");
      return;
    }
    if (!activeSession?.paired) {
      toast.error("A conta selecionada não está pareada.");
      return;
    }
    const cleanDigits = phone.replace(/\D/g, "");
    if (cleanDigits.length < 8) {
      toast.error("Digite um número válido com no mínimo 8 dígitos.");
      return;
    }

    startCall.mutate(
      { phone: cleanDigits, record: false },
      {
        onSuccess: () => {
          toast.success("Iniciando chamada...");
        },
        onError: (err) => {
          toast.error(err.message || "Falha ao iniciar chamada");
        },
      }
    );
  };

  const handleHangup = () => {
    if (activeCall) {
      endCall.mutate({ sid: activeCall.sessionId, callId: activeCall.callId });
    }
  };

  // Seamless Dragging Handlers with getBoundingClientRect
  const handleMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest("select") || target.closest("button") || target.closest("input")) return;

    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    isDraggingRef.current = true;
    dragOffsetRef.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };

    const onMouseMove = (ev: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const newX = Math.max(8, Math.min(window.innerWidth - 348, ev.clientX - dragOffsetRef.current.x));
      const newY = Math.max(8, Math.min(window.innerHeight - 558, ev.clientY - dragOffsetRef.current.y));
      setPos({ x: newX, y: newY });
    };

    const onMouseUp = () => {
      isDraggingRef.current = false;
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  // Keyboard Event Listener
  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && target.tagName === "SELECT") return;

      if (e.key === "Enter") {
        e.preventDefault();
        if (activeCall) {
          handleHangup();
        } else {
          handleCall();
        }
      } else if (e.key === "Escape") {
        closeDialer();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, phone, currentSid, activeSession?.paired, activeCall]);

  if (!isOpen) return null;

  const stylePosition = pos
    ? { left: `${pos.x}px`, top: `${pos.y}px`, right: "auto", bottom: "auto" }
    : undefined;

  const formattedDisplay = formatPhoneBR(phone);
  const cleanPhoneDigits = phone.replace(/\D/g, "");

  return createPortal(
    <div
      ref={containerRef}
      style={stylePosition}
      className={`fixed z-[100] w-[340px] h-[550px] rounded-3xl p-5 shadow-2xl border bg-background text-foreground flex flex-col justify-between select-none transition-shadow ${
        !pos ? "bottom-6 right-6 top-auto left-auto" : ""
      }`}
    >
      {/* Top Drag Bar & Header */}
      <div
        onMouseDown={handleMouseDown}
        className="flex flex-col gap-1 pb-2 cursor-grab active:cursor-grabbing border-b border-muted/40"
      >
        {/* Drag Handle Bar */}
        <div className="flex justify-center -mt-2 -mb-1 opacity-50 hover:opacity-100 transition-opacity">
          <GripHorizontal className="h-4 w-7 text-muted-foreground" />
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <PhoneCall className="h-4 w-4" />
            </div>

            {/* Instance Selector Dropdown */}
            <div className="relative flex-1 min-w-0">
              <select
                value={currentSid}
                onChange={(e) => setSelectedSid(e.target.value)}
                disabled={!!activeCall}
                className="w-full appearance-none rounded-xl border border-input bg-muted/40 px-2.5 py-1.5 pr-7 text-xs font-medium focus:bg-background focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer truncate disabled:opacity-75"
              >
                {pairedSessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.jid ? s.jid.split("@")[0] : s.id.slice(0, 6)})
                  </option>
                ))}
                {pairedSessions.length === 0 && (
                  <option value="" disabled>
                    Nenhuma conta pareada
                  </option>
                )}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            </div>
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={closeDialer}
            className="h-8 w-8 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground shrink-0"
            aria-label="Fechar celular virtual"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* --- VIEW B: ACTIVE CALL INTERFACE --- */}
      {(() => {
        const displayCall = activeCall || (isIncomingForSession ? {
          status: "ringing_incoming",
          peer: incoming.peer,
          name: incoming.name || "",
          pictureUrl: incoming.pictureUrl || "",
          startedAt: incoming.offeredAt,
          connectedAt: 0,
        } : null) as any;

        if (!displayCall) return null;
        
        return (
        <div className="flex-1 flex flex-col items-center justify-between py-3 text-center">
          {/* Header Tag & Recording Indicator */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold tracking-widest uppercase text-muted-foreground bg-muted/50 px-2.5 py-0.5 rounded-full">
              Whatsapp Audio
            </span>
            {isRecording && (
              <span className="flex items-center gap-1 text-[10px] font-bold text-red-500 animate-pulse bg-red-500/10 px-2 py-0.5 rounded-full">
                <span className="h-1.5 w-1.5 rounded-full bg-red-500" /> REC
              </span>
            )}
          </div>

          {/* Avatar & Pulse Ring */}
          <div className="relative flex items-center justify-center my-2">
            <div
              className={`flex h-24 w-24 overflow-hidden items-center justify-center rounded-full border-2 bg-muted/30 shadow-md ${
                displayCall.status === "ringing" || displayCall.status === "starting" || displayCall.status === "ringing_incoming"
                  ? "animate-pulse border-amber-500/50 bg-amber-500/10 text-amber-500"
                  : displayCall.status === "connected"
                  ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-500"
                  : "border-muted text-muted-foreground"
              }`}
            >
              {displayCall.pictureUrl ? (
                <img src={displayCall.pictureUrl} alt={displayCall.name || displayCall.peer} className="h-full w-full object-cover" />
              ) : (
                <User className="h-12 w-12" />
              )}
            </div>
            {(displayCall.status === "ringing" || displayCall.status === "starting" || displayCall.status === "ringing_incoming") && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-4 w-4 bg-amber-500"></span>
              </span>
            )}
          </div>

          {/* Peer Info & Status */}
          <div className="space-y-1 w-full px-2">
            <h3 className="text-xl font-bold tracking-tight text-foreground truncate">
              {displayCall.name || (displayCall.peer ? formatPhoneBR(displayCall.peer.split("@")[0]) : formattedDisplay || phone)}
            </h3>
            {displayCall.name && (
              <p className="text-xs text-muted-foreground font-mono">
                {formatPhoneBR(displayCall.peer.split("@")[0])}
              </p>
            )}
            <div className="flex items-center justify-center gap-2">
              <Badge variant={displayCall.status === "ringing_incoming" ? "secondary" : statusVariant[displayCall.status as CallStatus]} className="px-3 py-0.5 text-xs font-medium">
                {displayCall.status === "ringing_incoming" ? "Recebendo chamada..." : (statusLabel[displayCall.status as CallStatus] || displayCall.status)}
              </Badge>
              {displayCall.status === "connected" && (
                <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  {formatCallDuration(displayCall.startedAt, displayCall.status, displayCall.connectedAt)}
                </span>
              )}
            </div>
          </div>

          {/* Audio Meter */}
          {displayCall.status === "connected" && (
            <div className="w-full px-4 space-y-1">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground font-medium">
                <span className="flex items-center gap-1.5">
                  <Radio className="h-3.5 w-3.5 animate-pulse text-emerald-500" /> Áudio ao vivo
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

          {/* Call Controls */}
          {displayCall.status === "ringing_incoming" ? (
            <div className="flex items-center justify-center gap-6 mb-2 w-full pt-2">
              <Button
                variant="destructive"
                size="icon"
                className="flex h-14 w-14 items-center justify-center rounded-full bg-[#ef4444] hover:bg-[#dc2626] text-white shadow-lg shadow-red-500/30 hover:scale-105 active:scale-95 transition-all"
                disabled={accept.isPending || reject.isPending}
                onClick={() => incoming && reject.mutate({ sid: incoming.sessionId, callId: incoming.callId })}
              >
                <PhoneOff className="h-6 w-6" />
              </Button>
              <Button
                size="icon"
                className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 hover:bg-emerald-600 shadow-lg shadow-emerald-500/30 hover:scale-105 active:scale-95 transition-all text-white"
                disabled={accept.isPending || reject.isPending}
                onClick={() => incoming && accept.mutate({ sid: incoming.sessionId, callId: incoming.callId })}
              >
                <Phone className="h-6 w-6" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-5 mb-2 w-full pt-2">
              <button
                type="button"
                onClick={toggleMute}
                disabled={displayCall.status !== "connected"}
                className={`flex h-12 w-12 items-center justify-center rounded-full border transition-all ${
                  isMuted
                    ? "bg-slate-800 text-white border-slate-800 shadow-md"
                    : "bg-muted/50 hover:bg-muted text-foreground border-muted-foreground/20"
                } disabled:opacity-40 disabled:pointer-events-none`}
                title={isMuted ? "Desmutar Microfone" : "Silenciar Microfone"}
              >
                {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
              </button>

              <button
                type="button"
                onClick={toggleRecording}
                disabled={displayCall.status !== "connected"}
                className={`flex h-12 w-12 items-center justify-center rounded-full border transition-all ${
                  isRecording
                    ? "bg-red-600 text-white border-red-600 shadow-md animate-pulse"
                    : "bg-muted/50 hover:bg-muted text-red-500 border-muted-foreground/20"
                } disabled:opacity-40 disabled:pointer-events-none`}
                title={isRecording ? "Parar Gravação" : "Gravar Chamada"}
              >
                {isRecording ? <Square className="h-5 w-5 fill-white" /> : <Disc className="h-5 w-5" />}
              </button>

              <button
                type="button"
                onClick={handleHangup}
                disabled={endCall.isPending}
                className="flex h-14 w-14 items-center justify-center rounded-full bg-[#ef4444] hover:bg-[#dc2626] text-white shadow-lg shadow-red-500/30 hover:scale-105 active:scale-95 transition-all"
                title="Finalizar Chamada"
              >
                <PhoneOff className="h-6 w-6" />
              </button>
            </div>
          )}

          <audio ref={audioRef} autoPlay />
        </div>
        );
      })()}
      {!activeCall && !isIncomingForSession && (
        /* --- VIEW A: KEYPAD DIALER INTERFACE --- */
        <div className="flex-1 flex flex-col justify-between pt-2">
          {/* Number Display & Input Area */}
          <div className="flex items-center justify-between px-3.5 py-2.5 rounded-2xl bg-muted/30 border border-muted/50 min-h-[58px]">
            <input
              type="text"
              value={formattedDisplay}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
              placeholder="Digite..."
              autoFocus
              className="w-full bg-transparent text-xl font-bold tracking-wider text-foreground placeholder:text-muted-foreground/40 placeholder:font-light focus:outline-none"
            />
          </div>

          {/* 3x4 Keypad Grid (Circular 56px buttons) */}
          <div className="grid grid-cols-3 gap-2.5 py-2 px-1">
            {KEYPAD.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => handleKeyPress(item.key)}
                className="group flex flex-col items-center justify-center h-[56px] w-[56px] mx-auto rounded-full bg-[#f3f4f6] dark:bg-muted/40 hover:bg-[#e5e7eb] dark:hover:bg-accent active:bg-[#d1d5db] active:scale-95 transition-all border border-muted/20"
              >
                <span className="text-lg font-medium text-foreground group-hover:scale-105 transition-transform">
                  {item.key}
                </span>
                {item.sub ? (
                  <span className="text-[8px] font-bold tracking-widest text-muted-foreground/70 uppercase">
                    {item.sub}
                  </span>
                ) : (
                  <span className="h-2" />
                )}
              </button>
            ))}
          </div>

          {/* Bottom Actions Row: Call Button + Backspace Button */}
          <div className="flex items-center justify-center relative py-1 min-h-[60px]">
            {/* Centered Green Call Button */}
            <button
              type="button"
              onClick={handleCall}
              disabled={startCall.isPending || cleanPhoneDigits.length < 8 || !activeSession?.paired}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-[#10b981] hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/30 hover:scale-105 active:scale-95 disabled:opacity-40 disabled:pointer-events-none transition-all"
              aria-label="Fazer chamada"
            >
              <Phone className="h-6 w-6 fill-white" />
            </button>

            {/* Backspace Button positioned to the right */}
            {phone.length > 0 && (
              <button
                type="button"
                onClick={handleBackspace}
                className="absolute right-4 flex h-10 w-10 items-center justify-center rounded-full bg-slate-800 text-white hover:bg-slate-700 active:scale-95 transition-all shadow-sm"
                aria-label="Apagar dígito"
              >
                <Delete className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>,
    document.body
  );
};
