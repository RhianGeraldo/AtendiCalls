export type UserRole = "admin" | "user";

export interface Plan {
  id: string;
  name: string;
  description: string;
  priceCents: number;
  maxInstances: number;
  maxConcurrentCalls: number;
  trialDays: number;
  hasVoiceAi: boolean;
  hasApiAccess: boolean;
  hasCampaigns: boolean;
  isDefault: boolean;
  isActive: boolean;
  createdAt: number;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  planId?: string;
  planName?: string;
  customMaxInstances?: number;
  maxInstances?: number;
  currentInstances?: number;
  status?: "active" | "suspended";
  trialEndsAt?: number;
  createdAt: number;
}
