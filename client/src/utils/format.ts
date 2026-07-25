import type { CallStatus } from "@/types/call";

export const formatCallDuration = (startedAt: number, status: CallStatus, connectedAt?: number): string => {
  if (status !== "connected") return status;
  const startTime = connectedAt || startedAt;
  const s = Math.floor((Date.now() - startTime) / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

export function formatPhoneBR(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.startsWith("55") && digits.length >= 12) {
    const ddd = digits.slice(2, 4);
    const rest = digits.slice(4);
    if (rest.length === 8) {
      return `+55 (${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
    }
    return `+55 (${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`;
  }
  return raw;
}
