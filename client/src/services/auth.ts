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

export const registerApi = async (name: string, email: string, password: string): Promise<{ token: string; user: User }> => {
  const r = await fetch(`${API_BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password }),
  });
  const data = await r.json();
  if (!r.ok) {
    throw new Error(data.error || "Falha ao realizar cadastro.");
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

export const logoutApi = async (token?: string | null): Promise<void> => {
  try {
    await fetch(`${API_BASE}/api/auth/logout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  } catch {
    // ignore network errors on logout
  }
};
