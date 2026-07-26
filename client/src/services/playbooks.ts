import { useAuth } from "@/stores/auth";
import type { Playbook } from "@/types/playbook";

const getHeaders = () => {
  let token = useAuth.getState().token;
  if (!token) {
    try {
      const raw = localStorage.getItem("atendicalls_auth");
      if (raw) token = JSON.parse(raw)?.state?.token;
    } catch {}
  }
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

export const getPlaybooksApi = async (): Promise<Playbook[]> => {
  const res = await fetch("/api/playbooks", { headers: getHeaders() });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Erro ao listar playbooks.");
  }
  return res.json();
};

export const createPlaybookApi = async (data: Partial<Playbook>): Promise<Playbook> => {
  const res = await fetch("/api/playbooks", {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Erro ao criar playbook.");
  }
  return res.json();
};

export const updatePlaybookApi = async (id: string, data: Partial<Playbook>): Promise<Playbook> => {
  const res = await fetch(`/api/playbooks/${id}`, {
    method: "PUT",
    headers: getHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Erro ao atualizar playbook.");
  }
  return res.json();
};

export const deletePlaybookApi = async (id: string): Promise<void> => {
  const res = await fetch(`/api/playbooks/${id}`, {
    method: "DELETE",
    headers: getHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Erro ao excluir playbook.");
  }
};
