import { create } from "zustand";

interface DialerState {
  isOpen: boolean;
  selectedSid: string | null;
  initialPhone: string;
  openDialer: (sid?: string, phone?: string) => void;
  closeDialer: () => void;
  setSelectedSid: (sid: string) => void;
}

export const useDialerStore = create<DialerState>((set) => ({
  isOpen: false,
  selectedSid: null,
  initialPhone: "",
  openDialer: (sid, phone = "") => set({ isOpen: true, selectedSid: sid ?? null, initialPhone: phone }),
  closeDialer: () => set({ isOpen: false }),
  setSelectedSid: (sid) => set({ selectedSid: sid }),
}));
