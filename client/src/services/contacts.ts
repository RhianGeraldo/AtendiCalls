import { useAuth } from "@/stores/auth";
import type { Contact, ContactListResponse } from "@/types/contact";

const getHeaders = () => {
  const token = useAuth.getState().token;
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

export const getContactsApi = async (params: { search?: string; page?: number; limit?: number } = {}): Promise<ContactListResponse> => {
  const query = new URLSearchParams();
  if (params.search) query.set("search", params.search);
  if (params.page) query.set("page", params.page.toString());
  if (params.limit) query.set("limit", params.limit.toString());

  const res = await fetch(`/api/contacts?${query.toString()}`, { headers: getHeaders() });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Erro ao listar contatos.");
  }
  return res.json();
};

export const createContactApi = async (data: Partial<Contact>): Promise<Contact> => {
  const res = await fetch("/api/contacts", {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Erro ao criar contato.");
  }
  return res.json();
};

export const updateContactApi = async (id: string, data: Partial<Contact>): Promise<Contact> => {
  const res = await fetch(`/api/contacts/${id}`, {
    method: "PUT",
    headers: getHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Erro ao atualizar contato.");
  }
  return res.json();
};

export const deleteContactApi = async (id: string): Promise<void> => {
  const res = await fetch(`/api/contacts/${id}`, {
    method: "DELETE",
    headers: getHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Erro ao excluir contato.");
  }
};
