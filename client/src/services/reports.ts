import { useAuth } from "@/stores/auth";
import type { CallHistoryResponse, CallAnalyticsResponse } from "@/types/call";

const getHeaders = () => {
  const token = useAuth.getState().token;
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

export type HistoryFilterParams = {
  sessionId?: string;
  owner?: string;
  direction?: string;
  status?: string;
  search?: string;
  startDate?: number;
  endDate?: number;
  page?: number;
  limit?: number;
};

export const getCallHistoryApi = async (params: HistoryFilterParams = {}): Promise<CallHistoryResponse> => {
  const query = new URLSearchParams();
  if (params.sessionId) query.set("sessionId", params.sessionId);
  if (params.owner) query.set("owner", params.owner);
  if (params.direction) query.set("direction", params.direction);
  if (params.status) query.set("status", params.status);
  if (params.search) query.set("search", params.search);
  if (params.startDate) query.set("startDate", params.startDate.toString());
  if (params.endDate) query.set("endDate", params.endDate.toString());
  if (params.page) query.set("page", params.page.toString());
  if (params.limit) query.set("limit", params.limit.toString());

  const res = await fetch(`/api/calls/history?${query.toString()}`, { headers: getHeaders() });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Erro ao carregar histórico de chamadas.");
  }
  return res.json();
};

export const getCallAnalyticsApi = async (params: HistoryFilterParams = {}): Promise<CallAnalyticsResponse> => {
  const query = new URLSearchParams();
  if (params.sessionId) query.set("sessionId", params.sessionId);
  if (params.owner) query.set("owner", params.owner);
  if (params.startDate) query.set("startDate", params.startDate.toString());
  if (params.endDate) query.set("endDate", params.endDate.toString());

  const res = await fetch(`/api/calls/analytics?${query.toString()}`, { headers: getHeaders() });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Erro ao carregar relatório analítico.");
  }
  return res.json();
};
