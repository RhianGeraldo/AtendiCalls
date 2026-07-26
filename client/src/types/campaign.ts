export type CampaignStatus = "pending" | "running" | "paused" | "completed";

export type CampaignItemStatus = "pending" | "calling" | "answered" | "rejected" | "no_answer" | "failed";

export type CampaignItem = {
  id: string;
  campaignId: string;
  contactId?: string;
  name: string;
  phone: string;
  pictureUrl?: string;
  status: CampaignItemStatus;
  startedAt?: number;
  endedAt?: number;
  endReason?: string;
  notes?: string;
};

export type Campaign = {
  id: string;
  name: string;
  sessionId: string;
  sessionName?: string;
  sessionPhone?: string;
  playbook: string;
  delaySeconds: number;
  status: CampaignStatus;
  totalItems: number;
  doneItems: number;
  items?: CampaignItem[];
  createdAt: number;
  updatedAt: number;
};
