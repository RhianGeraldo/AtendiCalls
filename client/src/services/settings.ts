import { apiGet, apiPost } from "@/lib/api";

export interface AISettings {
  groqApiKey: string;
  openaiApiKey?: string;
  whisperModel?: string;
}

export const getAISettings = () => apiGet<AISettings>("/api/settings");

export const saveAISettings = (settings: AISettings) =>
  apiPost<{ message: string }>("/api/settings", settings);
