export type CallStatus = "starting" | "ringing" | "connected" | "ended";

export type CallSummary = {
  sessionId: string;
  callId: string;
  owner: string | null;
  direction: "outbound" | "inbound";
  peer: string;
  name?: string;
  pictureUrl?: string;
  startedAt: number;
  connectedAt?: number;
  status: CallStatus;
};

export type IncomingPayload = { sessionId: string; callId: string; peer: string; name?: string; pictureUrl?: string; offeredAt: number };
