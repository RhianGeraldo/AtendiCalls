import { useAuth } from "@/stores/auth";
import type { Plan } from "@/types/user";

const getHeaders = (): HeadersInit => {
  const token = useAuth.getState().token;
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

export const listPlansApi = async (): Promise<Plan[]> => {
  const res = await fetch("/api/plans", { headers: getHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Erro ao carregar planos.");
  return data.plans || [];
};

export const createPlanApi = async (plan: Partial<Plan>): Promise<Plan> => {
  const res = await fetch("/api/plans", {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(plan),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Erro ao criar plano.");
  return data.plan;
};

export const updatePlanApi = async (id: string, plan: Partial<Plan>): Promise<Plan> => {
  const res = await fetch(`/api/plans/${id}`, {
    method: "PUT",
    headers: getHeaders(),
    body: JSON.stringify(plan),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Erro ao atualizar plano.");
  return data.plan;
};

export const deletePlanApi = async (id: string): Promise<void> => {
  const res = await fetch(`/api/plans/${id}`, {
    method: "DELETE",
    headers: getHeaders(),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Erro ao excluir plano.");
  }
};
