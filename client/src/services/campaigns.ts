import { buildApiUrl, getHeaders } from "@/lib/api";
import type { Campaign, CampaignItem, CampaignStatus, CampaignItemStatus } from "@/types/campaign";

export const getCampaignsApi = async (): Promise<Campaign[]> => {
  const res = await fetch(buildApiUrl("/api/campaigns"), { headers: getHeaders() });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Erro ao listar campanhas.");
  }
  return res.json();
};

export const getCampaignDetailsApi = async (id: string): Promise<Campaign> => {
  const res = await fetch(buildApiUrl(`/api/campaigns/${id}`), { headers: getHeaders() });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Erro ao obter detalhes da campanha.");
  }
  return res.json();
};

export type CreateCampaignPayload = {
  name: string;
  sessionId: string;
  playbook: string;
  delaySeconds: number;
  items: Array<{ contactId?: string; name: string; phone: string; pictureUrl?: string }>;
};

export const createCampaignApi = async (data: CreateCampaignPayload): Promise<Campaign> => {
  const res = await fetch(buildApiUrl("/api/campaigns"), {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Erro ao criar campanha.");
  }
  return res.json();
};

export const updateCampaignStatusApi = async (id: string, status: CampaignStatus): Promise<void> => {
  const res = await fetch(buildApiUrl(`/api/campaigns/${id}/status`), {
    method: "PATCH",
    headers: getHeaders(),
    body: JSON.stringify({ status }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Erro ao atualizar status da campanha.");
  }
};

export const updateCampaignItemApi = async (
  campaignId: string,
  itemId: string,
  data: { status: CampaignItemStatus; endReason?: string; notes?: string }
): Promise<void> => {
  const res = await fetch(buildApiUrl(`/api/campaigns/${campaignId}/items/${itemId}`), {
    method: "PATCH",
    headers: getHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Erro ao atualizar item da campanha.");
  }
};

export const claimNextCampaignItemApi = async (
  campaignId: string,
  agentName?: string
): Promise<{ completed: boolean; item: CampaignItem | null }> => {
  const res = await fetch(buildApiUrl(`/api/campaigns/${campaignId}/claim-next`), {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ agentName }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Erro ao reservar próximo contato da fila.");
  }
  return res.json();
};

export const deleteCampaignApi = async (id: string): Promise<void> => {
  const res = await fetch(buildApiUrl(`/api/campaigns/${id}`), {
    method: "DELETE",
    headers: getHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Erro ao excluir campanha.");
  }
};
