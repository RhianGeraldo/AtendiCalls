import type { User } from "@/types/user";

const API_BASE = "";

export const loginApi = async (email: string, password: string): Promise<{ token: string; user: User }> => {
  const r = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await r.json();
  if (!r.ok) {
    throw new Error(data.error || "Falha ao realizar login.");
  }
  return data;
};

export const getMeApi = async (token: string): Promise<{ user: User }> => {
  const r = await fetch(`${API_BASE}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await r.json();
  if (!r.ok) {
    throw new Error(data.error || "Sessão expirada.");
  }
  return data;
};
