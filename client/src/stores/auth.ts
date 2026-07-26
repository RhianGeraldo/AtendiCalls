import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { User } from "@/types/user";
import { loginApi, getMeApi } from "@/services/auth";

type AuthState = {
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
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
      },

      logout: () => {
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
        } catch {
          set({ token: null, user: null, isAuthenticated: false, isLoading: false });
        }
      },
    }),
    {
      name: "atendicalls_auth",
      partialize: (state) => ({ token: state.token, user: state.user }),
    }
  )
);
