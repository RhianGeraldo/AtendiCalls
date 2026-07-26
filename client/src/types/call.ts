export type CallStatus = "starting" | "ringing" | "connected" | "ended";

export type CallSummary = {
  sessionId: string;
  sessionName?: string;
  sessionPhone?: string;
  sessionPictureUrl?: string;
  callId: string;
  owner: string | null;
  direction: "outbound" | "inbound";
  peer: string;
  name?: string;
  pictureUrl?: string;
  startedAt: number;
  connectedAt?: number;
  status: CallStatus;
  endedAt?: number;
  endReason?: string;
};

export type IncomingPayload = { sessionId: string; callId: string; peer: string; name?: string; pictureUrl?: string; offeredAt: number };

export type CallHistoryItem = {
  sessionId: string;
  sessionName?: string;
  sessionPhone?: string;
  sessionPictureUrl?: string;
  callId: string;
  owner: string | null;
  direction: "outbound" | "inbound";
  peer: string;
  name?: string;
  pictureUrl?: string;
  startedAt: number;
  connectedAt?: number;
  endedAt?: number;
  status: CallStatus;
  endReason?: string;
};

export type CallAnalyticsSummary = {
  totalCalls: number;
  completedCalls: number;
  missedCalls: number;
  rejectedCalls: number;
  inboundCount: number;
  outboundCount: number;
  totalDurationSec: number;
  avgDurationSec: number;
  avgWaitSec: number;
  answerRate: number;
};

export type AgentMetric = {
  owner: string;
  totalCalls: number;
  completedCalls: number;
  totalDurationSec: number;
  avgDurationSec: number;
  answerRate: number;
};

export type SessionMetric = {
  sessionId: string;
  totalCalls: number;
  completedCalls: number;
  missedCalls: number;
};

export type CallAnalyticsResponse = {
  summary: CallAnalyticsSummary;
  byAgent: AgentMetric[];
  bySession: SessionMetric[];
};

export type CallHistoryResponse = {
  records: CallHistoryItem[];
  total: number;
  page: number;
  limit: number;
};
