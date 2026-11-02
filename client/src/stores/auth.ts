import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { User } from "@/types/user";
import { loginApi, registerApi, getMeApi, logoutApi } from "@/services/auth";
import { eventStream } from "@/lib/event-stream";
import { useSessions } from "./sessions";
import { useCalls } from "./calls";

type AuthState = {
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<void>;
};

export const useAuth = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      isAuthenticated: false,
      isLoading: true,

      login: async (email, password) => {
        const res = await loginApi(email, password);
        set({
          token: res.token,
          user: res.user,
          isAuthenticated: true,
          isLoading: false,
        });
        eventStream.connect(res.user.id, res.token);
      },

      register: async (name, email, password) => {
        const res = await registerApi(name, email, password);
        set({
          token: res.token,
          user: res.user,
          isAuthenticated: true,
          isLoading: false,
        });
        eventStream.connect(res.user.id, res.token);
      },

      logout: () => {
        const tok = get().token;
        if (tok) {
          logoutApi(tok);
        }
        eventStream.close();
        useSessions.setState({ sessions: [], qrs: {}, activeId: null });
        useCalls.setState({ calls: [], incoming: null });
        set({ token: null, user: null, isAuthenticated: false, isLoading: false });
      },

      checkAuth: async () => {
        const token = get().token;
        if (!token) {
          set({ isAuthenticated: false, user: null, isLoading: false });
          return;
        }
        try {
          const res = await getMeApi(token);
          set({ user: res.user, isAuthenticated: true, isLoading: false });
          eventStream.connect(res.user.id, token);
        } catch {
          // Token is invalid or expired on server
          eventStream.close();
          useSessions.setState({ sessions: [], qrs: {}, activeId: null });
          useCalls.setState({ calls: [], incoming: null });
          set({ token: null, user: null, isAuthenticated: false, isLoading: false });
        }
      },
    }),
    {
      name: "atendicalls_auth",
      partialize: (state) => ({
        token: state.token,
        user: state.user,
        isAuthenticated: !!state.token && !!state.user,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.isLoading = false;
        }
      },
    }
  )
);
