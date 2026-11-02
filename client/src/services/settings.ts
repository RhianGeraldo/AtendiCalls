import { apiGet, apiPost } from "@/lib/api";

export interface AISettings {
  groqApiKey?: string;
  openaiApiKey?: string;
  whisperModel?: string;
  openrouterApiKey?: string;
  googleApiKey?: string;
  systemApiKey?: string;
  defaultProvider?: string;
  defaultModel?: string;
  defaultVoice?: string;
  defaultPrompt?: string;
  defaultFirstMessage?: string;
  agentName?: string;
  aiSessionId?: string;
  autoAnswerAi?: string;
  autoAnswerDelaySec?: string;
  messageWebhookUrl?: string;
  callWebhookUrl?: string;
}

export const getAISettings = () => apiGet<AISettings>("/api/settings");

export const saveAISettings = (settings: AISettings) =>
  apiPost<{ message: string }>("/api/settings", settings);
