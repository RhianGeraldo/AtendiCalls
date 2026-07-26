import { getClientId } from "./client-id";
import { useAuth } from "@/stores/auth";

const metaEnv = (import.meta as any).env || {};
export const API_BASE = metaEnv.VITE_API_URL || (metaEnv.DEV ? "http://127.0.0.1:3001" : "");

export const buildApiUrl = (path: string): string => {
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE}${cleanPath}`;
};

export const getHeaders = (): Record<string, string> => {
  let token = useAuth.getState().token;
  const user = useAuth.getState().user;

  if (!token) {
    try {
      const raw = localStorage.getItem("atendicalls_auth");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.state?.token) token = parsed.state.token;
      }
    } catch {}
  }

  const headers: Record<string, string> = {
    "X-Client-Id": user?.id || getClientId(),
    "Content-Type": "application/json",
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  return headers;
};

export const apiGet = async <T>(path: string): Promise<T> => {
  const r = await fetch(buildApiUrl(path), { headers: getHeaders() });
  if (!r.ok) throw new Error(`${path} ${r.status}`);
  return r.json() as Promise<T>;
};

export const apiPost = async <T>(path: string, body: unknown): Promise<T> => {
  const r = await fetch(buildApiUrl(path), { method: "POST", headers: getHeaders(), body: JSON.stringify(body) });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`${path} ${r.status} ${text}`);
  }
  return r.json() as Promise<T>;
};

export const apiDelete = async (path: string): Promise<void> => {
  const r = await fetch(buildApiUrl(path), { method: "DELETE", headers: getHeaders() });
  if (!r.ok) throw new Error(`${path} ${r.status}`);
};
