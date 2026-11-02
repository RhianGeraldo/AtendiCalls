import { apiGet, apiPost } from "@/lib/api";
import { getClientId } from "@/lib/client-id";

export interface AIAgent {
  id: string;
  name: string;
  description: string;
  provider: "openrouter" | "openai_realtime" | "gemini_live" | string;
  model: string;
  voice: string;
  systemPrompt: string;
  firstMessage: string;
  autoAnswer: boolean;
  autoAnswerDelaySec: number;
  assignedSessions: string[];
  callWebhookUrl?: string;
  enableHangup: boolean;
  hangupDelaySec: number;
  enableWhatsAppMessage: boolean;
  whatsappMessageRules?: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export const listAIAgents = async (): Promise<AIAgent[]> => {
  const r = await apiGet<{ agents: AIAgent[] }>("/api/ai/agents");
  return r.agents ?? [];
};

export const getAIAgent = (id: string): Promise<AIAgent> => {
  return apiGet<AIAgent>(`/api/ai/agents/${id}`);
};

export const createAIAgent = (agent: Partial<AIAgent>): Promise<AIAgent> => {
  return apiPost<AIAgent>("/api/ai/agents", agent);
};

export const updateAIAgent = async (id: string, agent: Partial<AIAgent>): Promise<AIAgent> => {
  const r = await fetch(`/api/ai/agents/${id}`, {
    method: "PUT",
    headers: {
      "X-Client-Id": getClientId(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(agent),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.error || `Falha ao atualizar agente: ${r.status}`);
  }
  return r.json();
};

export const deleteAIAgent = async (id: string): Promise<void> => {
  const r = await fetch(`/api/ai/agents/${id}`, {
    method: "DELETE",
    headers: {
      "X-Client-Id": getClientId(),
    },
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.error || `Falha ao excluir agente: ${r.status}`);
  }
};
