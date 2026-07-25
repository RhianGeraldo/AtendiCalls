import { apiPost, apiDelete } from "@/lib/api";
import { getClientId } from "@/lib/client-id";

export const startCall = (sid: string, phone: string, record: boolean) =>
  apiPost<{ call: { callId: string } }>(`/api/sessions/${sid}/calls`, {
    phone,
    duration_ms: 300_000,
    record,
  });

export const acceptCall = (sid: string, callId: string) =>
  apiPost<{ call: { callId: string } }>(`/api/sessions/${sid}/calls/${callId}/accept`, {});

import { useAuth } from "@/stores/auth";

export const rejectCall = async (sid: string, callId: string): Promise<void> => {
  const token = useAuth.getState().token;
  const user = useAuth.getState().user;
  const headers: Record<string, string> = { 
    "X-Client-Id": user?.id || getClientId(), 
    "Content-Type": "application/json" 
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const r = await fetch(`/api/sessions/${sid}/calls/${callId}/reject`, {
    method: "POST",
    headers,
    body: "{}",
  });
  if (!r.ok) throw new Error(`reject ${r.status}`);
};

export const endCall = (sid: string, callId: string) =>
  apiDelete(`/api/sessions/${sid}/calls/${callId}`);
