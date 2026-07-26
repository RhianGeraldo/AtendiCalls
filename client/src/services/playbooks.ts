import { buildApiUrl, getHeaders } from "@/lib/api";
import type { Playbook } from "@/types/playbook";

export const getPlaybooksApi = async (): Promise<Playbook[]> => {
  const res = await fetch(buildApiUrl("/api/playbooks"), { headers: getHeaders() });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Erro ao listar playbooks.");
  }
  return res.json();
};

export const createPlaybookApi = async (data: Partial<Playbook>): Promise<Playbook> => {
  const res = await fetch(buildApiUrl("/api/playbooks"), {
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
  const res = await fetch(buildApiUrl(`/api/playbooks/${id}`), {
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
  const res = await fetch(buildApiUrl(`/api/playbooks/${id}`), {
    method: "DELETE",
    headers: getHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Erro ao excluir playbook.");
  }
};
