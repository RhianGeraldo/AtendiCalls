import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/api";

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
  return apiPut<AIAgent>(`/api/ai/agents/${id}`, agent);
};

export const deleteAIAgent = async (id: string): Promise<void> => {
  return apiDelete(`/api/ai/agents/${id}`);
};
