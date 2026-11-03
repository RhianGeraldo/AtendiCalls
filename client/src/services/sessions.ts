import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api";
import type { SessionInfo } from "@/types/session";

export const listSessions = () =>
  apiGet<{ sessions: SessionInfo[] }>("/api/sessions").then((r) => r.sessions ?? []);

export const createSession = (name: string, token?: string) =>
  apiPost<{ id: string; token: string }>("/api/sessions", { name, token });

export const deleteSession = (id: string) => apiDelete(`/api/sessions/${id}`);

const postVoid = async (path: string): Promise<void> => {
  await apiPost(path, {});
};

export const logoutSession = (id: string) => postVoid(`/api/sessions/${id}/logout`);

export const pairSession = (id: string) => postVoid(`/api/sessions/${id}/pair`);

export const renameSession = async (id: string, name: string): Promise<void> => {
  await apiPatch(`/api/sessions/${id}`, { name });
};
