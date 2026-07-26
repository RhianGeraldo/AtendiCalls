import { create } from "zustand";
import type { Campaign, CampaignItem } from "@/types/campaign";
import { claimNextCampaignItemApi, updateCampaignItemApi, updateCampaignStatusApi } from "@/services/campaigns";
import { useAuth } from "@/stores/auth";

interface CampaignRunnerState {
  activeCampaign: Campaign | null;
  claimedItem: CampaignItem | null;
  agentSessionId: string;
  isOpen: boolean;
  isPaused: boolean;
  countdown: number; // Seconds until next auto-dial
  callState: "idle" | "calling" | "connected" | "ended";
  notes: string;

  // Actions
  startRunner: (campaign: Campaign, selectedSessionId?: string) => Promise<void>;
  claimNext: () => Promise<boolean>;
  pauseRunner: () => void;
  resumeRunner: () => void;
  closeRunner: () => void;
  setCountdown: (sec: number) => void;
  setCallState: (state: "idle" | "calling" | "connected" | "ended") => void;
  setNotes: (notes: string) => void;
  finishCurrentItem: (status: "answered" | "rejected" | "no_answer" | "failed", endReason?: string) => Promise<void>;
}

export const useCampaignRunner = create<CampaignRunnerState>((set, get) => ({
  activeCampaign: null,
  claimedItem: null,
  agentSessionId: "",
  isOpen: false,
  isPaused: false,
  countdown: 0,
  callState: "idle",
  notes: "",

  startRunner: async (campaign: Campaign, selectedSessionId?: string) => {
    const activeLine = selectedSessionId || campaign.sessionId;
    set({
      activeCampaign: campaign,
      claimedItem: null,
      agentSessionId: activeLine,
      isOpen: true,
      isPaused: false,
      countdown: 0,
      callState: "idle",
      notes: "",
    });

    updateCampaignStatusApi(campaign.id, "running").catch(() => {});
    await get().claimNext();
  },

  claimNext: async () => {
    const { activeCampaign } = get();
    if (!activeCampaign) return false;

    const user = useAuth.getState().user;
    const agentName = user?.name || user?.email || "Agente";

    try {
      const res = await claimNextCampaignItemApi(activeCampaign.id, agentName);
      if (res.completed || !res.item) {
        set({ claimedItem: null, callState: "idle", countdown: 0 });
        return false;
      }

      set({ claimedItem: res.item, callState: "idle", countdown: 0, notes: "" });
      return true;
    } catch (err) {
      console.error("Error claiming next campaign item:", err);
      return false;
    }
  },

  pauseRunner: () => {
    const { activeCampaign } = get();
    set({ isPaused: true, countdown: 0 });
    if (activeCampaign) {
      updateCampaignStatusApi(activeCampaign.id, "paused").catch(() => {});
    }
  },

  resumeRunner: () => {
    const { activeCampaign } = get();
    set({ isPaused: false });
    if (activeCampaign) {
      updateCampaignStatusApi(activeCampaign.id, "running").catch(() => {});
    }
  },

  closeRunner: () => {
    set({ isOpen: false, activeCampaign: null, claimedItem: null, countdown: 0, callState: "idle" });
  },

  setCountdown: (sec: number) => set({ countdown: sec }),
  setCallState: (state) => set({ callState: state }),
  setNotes: (notes) => set({ notes }),

  finishCurrentItem: async (status, endReason = "") => {
    const { activeCampaign, claimedItem, notes } = get();
    if (!activeCampaign || !claimedItem) return;

    try {
      await updateCampaignItemApi(activeCampaign.id, claimedItem.id, {
        status,
        endReason,
        notes,
      });
    } catch (e) {
      console.error("Error saving campaign item status:", e);
    }
  },
}));
