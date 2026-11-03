import { Loader2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useSessions } from "@/stores/sessions";
import type { SessionInfo } from "@/types/session";

export const SessionPairing = ({ session }: { session: SessionInfo }) => {
  const qr = useSessions((s) => s.qrs[session.id]);

  return (
    <div className="flex flex-col items-center gap-4 py-2 text-center">
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground leading-relaxed">
          Abra o <strong>WhatsApp</strong> no celular &rarr; Toque em <strong>Aparelhos conectados</strong> &rarr; <strong>Conectar um aparelho</strong> e aponte para o código abaixo:
        </p>
      </div>

      <div className="relative flex items-center justify-center p-3 rounded-2xl bg-white border border-border/80 shadow-md">
        {qr ? (
          <QRCodeSVG value={qr} size={240} marginSize={1} level="M" />
        ) : session.state === "logged_out" ? (
          <div className="h-[240px] w-[240px] flex flex-col items-center justify-center p-4 text-center">
            <Badge variant="destructive" className="mb-2">Desconectado</Badge>
            <p className="text-xs text-muted-foreground">Clique no botão para gerar um novo código.</p>
          </div>
        ) : (
          <div className="h-[240px] w-[240px] flex flex-col items-center justify-center gap-3">
            <Skeleton className="h-[220px] w-[220px] rounded-xl" />
            <div className="absolute flex flex-col items-center gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
              <span className="text-xs font-medium text-foreground bg-background/90 px-2 py-0.5 rounded shadow">
                Gerando QR Code...
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
        <span>Aguardando leitura do código pelo WhatsApp...</span>
      </div>
    </div>
  );
};
