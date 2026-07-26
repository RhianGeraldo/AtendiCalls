import { useEffect, useRef, useState } from "react";
import { PhoneOff, PhoneIncoming, PhoneOutgoing, User as UserIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useCalls } from "@/stores/calls";
import { useDevices } from "@/stores/devices";
import { useSessions } from "@/stores/sessions";
import { useEndCall } from "@/hooks/useEndCall";
import { formatCallDuration } from "@/utils/format";
import type { CallSummary } from "@/types/call";

export const CallCard = ({ call }: { call: CallSummary }) => {
  const conn = useCalls((s) => s.ownConnections.get(call.callId));
  const sessions = useSessions((s) => s.sessions);
  const outDeviceId = useDevices((s) => s.outId);
  const endCall = useEndCall();
  const [, force] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);

  const isConnected = call.connectedAt || call.status === "connected";
  const isOutbound = call.direction === "outbound";
  const rawPhone = call.peer.replace("@s.whatsapp.net", "").replace("@lid", "");

  const session = sessions.find((s) => s.id === call.sessionId);
  const accountPic = call.sessionPictureUrl || session?.pictureUrl;
  const accountName = call.sessionName || session?.name || "WhatsApp";
  const accountPhone = call.sessionPhone || session?.phone || call.sessionId.slice(0, 8);

  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!conn) return;
    const wait = setInterval(() => {
      if (conn.remoteStream && audioRef.current) {
        audioRef.current.srcObject = conn.remoteStream;
        audioRef.current.play().catch(() => {});
        clearInterval(wait);
      }
    }, 200);
    return () => {
      clearInterval(wait);
    };
  }, [conn]);

  useEffect(() => {
    const el = audioRef.current as (HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }) | null;
    if (!el || !outDeviceId || typeof el.setSinkId !== "function") return;
    el.setSinkId(outDeviceId).catch(() => {});
  }, [outDeviceId, conn]);

  return (
    <Card className="border border-border/80 shadow-md bg-card overflow-hidden hover:border-emerald-500/30 transition-all">
      <CardContent className="space-y-4 p-4">
        {/* Top Header: Contact Info & End Call Action */}
        <div className="flex items-start justify-between gap-3">
          {/* Contato Avatar & Info */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 shrink-0 rounded-full overflow-hidden border border-border bg-muted/20 shadow-xs flex items-center justify-center">
              {call.pictureUrl ? (
                <img src={call.pictureUrl} alt={call.name || rawPhone} className="h-full w-full rounded-full object-cover" />
              ) : (
                <div className="h-full w-full rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold text-xs border border-emerald-500/20">
                  {(call.name || rawPhone || "?").charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <div className="min-w-0">
              <p className="font-bold text-sm text-foreground truncate leading-tight">
                {call.name || "Contato WhatsApp"}
              </p>
              <p className="font-mono text-xs text-muted-foreground mt-0.5 truncate">
                {rawPhone}
              </p>
            </div>
          </div>

          {/* End Call Action Button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="destructive"
                size="icon"
                onClick={() => endCall.mutate({ sid: call.sessionId, callId: call.callId })}
                className="h-10 w-10 rounded-xl bg-rose-600 hover:bg-rose-700 shadow-md hover:scale-105 active:scale-95 transition-all shrink-0"
                aria-label="Encerrar Chamada"
              >
                <PhoneOff className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Encerrar Chamada</TooltipContent>
          </Tooltip>
        </div>

        {/* Middle Section: Session Line & Badges */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-border/50 text-xs">
          {/* Conta / Linha da Empresa */}
          <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/40 border border-border/40 min-w-0">
            <div className="h-7 w-7 shrink-0 rounded-full overflow-hidden border border-border bg-muted flex items-center justify-center">
              {accountPic ? (
                <img src={accountPic} alt={accountName} className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full bg-blue-500/10 text-blue-600 font-bold text-[10px] flex items-center justify-center">
                  {accountName.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-foreground text-[11px] truncate leading-tight">{accountName}</p>
              <p className="font-mono text-[10px] text-muted-foreground truncate">{accountPhone}</p>
            </div>
          </div>

          {/* Direção, Agente e Status */}
          <div className="flex flex-wrap items-center gap-1.5">
            {/* Direção Badge */}
            {isOutbound ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-500 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded-md">
                <PhoneOutgoing className="w-3 h-3" /> Saída
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md">
                <PhoneIncoming className="w-3 h-3" /> Entrada
              </span>
            )}

            {/* Agente Badge */}
            {call.owner && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-foreground bg-muted px-2 py-0.5 rounded-md border border-border">
                <UserIcon className="w-3 h-3 text-emerald-500" /> {call.owner}
              </span>
            )}

            {/* Live Stopwatch Badge */}
            <Badge
              variant="outline"
              className={
                isConnected
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 font-mono font-bold text-[11px]"
                  : "bg-blue-500/10 text-blue-500 border-blue-500/30 animate-pulse font-mono text-[11px]"
              }
            >
              {formatCallDuration(call.startedAt, call.status, call.connectedAt)}
            </Badge>
          </div>
        </div>

        <audio ref={audioRef} autoPlay className="hidden" />
      </CardContent>
    </Card>
  );
};
