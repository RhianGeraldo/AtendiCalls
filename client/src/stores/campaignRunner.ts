import { create } from "zustand";
import type { Campaign } from "@/types/campaign";
import { updateCampaignItemApi, updateCampaignStatusApi } from "@/services/campaigns";

interface CampaignRunnerState {
  activeCampaign: Campaign | null;
  currentIndex: number;
  isOpen: boolean;
  isPaused: boolean;
  countdown: number; // Seconds until next auto-dial (default 5)
  callState: "idle" | "calling" | "connected" | "ended";
  notes: string;

  // Actions
  startRunner: (campaign: Campaign) => void;
  pauseRunner: () => void;
  resumeRunner: () => void;
  closeRunner: () => void;
  setCountdown: (sec: number) => void;
  setCallState: (state: "idle" | "calling" | "connected" | "ended") => void;
  setNotes: (notes: string) => void;
  nextContact: () => void;
  finishCurrentItem: (status: "answered" | "rejected" | "no_answer" | "failed", endReason?: string) => Promise<void>;
}

export const useCampaignRunner = create<CampaignRunnerState>((set, get) => ({
  activeCampaign: null,
  currentIndex: 0,
  isOpen: false,
  isPaused: false,
  countdown: 0,
  callState: "idle",
  notes: "",

  startRunner: (campaign: Campaign) => {
    // Find first pending item index
    const items = campaign.items || [];
    const pendingIdx = items.findIndex((it) => it.status === "pending" || it.status === "calling");
    const startIndex = pendingIdx !== -1 ? pendingIdx : 0;

    set({
      activeCampaign: campaign,
      currentIndex: startIndex,
      isOpen: true,
      isPaused: true, // Require seller to click Iniciar Campanha before dialing starts
      countdown: 0,
      callState: "idle",
      notes: "",
    });

    updateCampaignStatusApi(campaign.id, "running").catch(() => {});
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
    set({ isOpen: false, activeCampaign: null, countdown: 0, callState: "idle" });
  },

  setCountdown: (sec: number) => set({ countdown: sec }),
  setCallState: (state) => set({ callState: state }),
  setNotes: (notes) => set({ notes }),

  nextContact: () => {
    const { activeCampaign, currentIndex } = get();
    if (!activeCampaign || !activeCampaign.items) return;

    const nextIdx = currentIndex + 1;
    if (nextIdx >= activeCampaign.items.length) {
      // Completed all items in campaign
      set({ callState: "idle", countdown: 0 });
      updateCampaignStatusApi(activeCampaign.id, "completed").catch(() => {});
    } else {
      set({ currentIndex: nextIdx, callState: "idle", countdown: 0, notes: "" });
    }
  },

  finishCurrentItem: async (status, endReason = "") => {
    const { activeCampaign, currentIndex, notes } = get();
    if (!activeCampaign || !activeCampaign.items || !activeCampaign.items[currentIndex]) return;

    const item = activeCampaign.items[currentIndex];
    item.status = status;
    item.endReason = endReason;
    item.notes = notes;

    try {
      await updateCampaignItemApi(activeCampaign.id, item.id, {
        status,
        endReason,
        notes,
      });
    } catch (e) {
      console.error("Error saving campaign item status:", e);
    }
  },
}));
