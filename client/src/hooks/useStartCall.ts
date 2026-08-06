import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { openCall } from "@/lib/webrtc";
import { startCall } from "@/services/calls";
import { registerOwnConnection } from "@/stores/calls";

export const useStartCall = (sid: string, micId: string | null) =>
  useMutation({
    mutationFn: async (vars: { phone: string; record: boolean }) => {
      const { call } = await startCall(sid, vars.phone, vars.record);
      try {
        const conn = await openCall(sid, call.callId, micId);
        registerOwnConnection(call.callId, conn);
        return call.callId;
      } catch (err: any) {
        if (err?.message?.includes("no such call") || err?.message?.includes("404")) {
          throw new Error("Linha ocupada ou chamada encerrada pelo destinatário.");
        }
        throw err;
      }
    },
    onError: (e: Error) => {
      const m = e.message;
      if (m.includes("429")) toast.error("Limite atingido: máximo de chamadas simultâneas.");
      else if (m.includes("503")) toast.error("WhatsApp não emparelhado.");
      else toast.error(m);
    },
  });
