import type { User, UserRole } from "@/types/user";
import { useAuth } from "@/stores/auth";

const getHeaders = () => {
  const token = useAuth.getState().token;
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

export const listUsersApi = async (): Promise<User[]> => {
  const r = await fetch("/api/users", { headers: getHeaders() });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "Falha ao listar usuários.");
  return data.users ?? [];
};

export const createUserApi = async (payload: { name: string; email: string; password: string; role: UserRole }): Promise<User> => {
  const r = await fetch("/api/users", {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "Falha ao criar usuário.");
  return data.user;
};

export const updateUserApi = async (id: string, payload: { name?: string; email?: string; password?: string; role?: UserRole }): Promise<User> => {
  const r = await fetch(`/api/users/${id}`, {
    method: "PATCH",
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "Falha ao atualizar usuário.");
  return data.user;
};

export const deleteUserApi = async (id: string): Promise<void> => {
  const r = await fetch(`/api/users/${id}`, {
    method: "DELETE",
    headers: getHeaders(),
  });
  if (!r.ok) {
    const data = await r.json().catch(() => ({}));
    throw new Error(data.error || "Falha ao excluir usuário.");
  }
};
