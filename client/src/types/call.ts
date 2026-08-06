export type CallStatus = "starting" | "ringing" | "connected" | "ended";

export type TranscriptUtterance = {
  speaker: "atendente" | "cliente";
  start: number;
  end: number;
  text: string;
};

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
  recordingPath?: string;
  transcriptJson?: string;
  transcriptSummary?: string;
  transcriptionStatus?: string;
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
  recordingPath?: string;
  transcriptJson?: string;
  transcriptSummary?: string;
  transcriptionStatus?: string;
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
  sessionName?: string;
  sessionPhone?: string;
  sessionPictureUrl?: string;
  totalCalls: number;
  completedCalls: number;
  missedCalls: number;
  avgDurationSec: number;
  answerRate: number;
};

export type DailyMetric = {
  date: string;
  totalCalls: number;
  completedCalls: number;
  inboundCount: number;
  outboundCount: number;
  avgDurationSec: number;
};

export type CallAnalyticsResponse = {
  summary: CallAnalyticsSummary;
  byAgent: AgentMetric[];
  bySession: SessionMetric[];
  byDaily: DailyMetric[];
};

export type CallHistoryResponse = {
  records: CallHistoryItem[];
  total: number;
  page: number;
  limit: number;
};
