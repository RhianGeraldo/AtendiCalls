export type Contact = {
  id: string;
  name: string;
  phone: string;
  company?: string;
  notes?: string;
  pictureUrl?: string;
  createdAt: number;
  updatedAt: number;
};

export type ContactListResponse = {
  contacts: Contact[];
  total: number;
  page: number;
  limit: number;
};
