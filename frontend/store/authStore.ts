// frontend/store/authStore.ts
"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type UserRole = "SUPER_ADMIN" | "ADMIN" | "ROUTE_MANAGER" | "CLIENT";

export type AppModuleKey =
  | "OVERVIEW"
  | "ROUTES"
  | "CLIENTS"
  | "LOANS"
  | "PAYMENTS"
  | "TREASURY"
  | "USERS"
  | "NOTIFICATIONS"
  | "BUSINESSES"
  | "ROLE_MODULES";

interface AuthUser {
  id: string;
  name: string;
  email: string;
  roles: UserRole[];
  modules: AppModuleKey[];
  businessId: string | null;
}

interface AuthState {
  user: AuthUser | null;
  setUser: (user: AuthUser) => void;
  clearUser: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      setUser: (user) => set({ user }),
      clearUser: () => {
        if (typeof window !== "undefined") {
          window.localStorage.removeItem("loan-app-access-token");
        }
        set({ user: null });
      }
    }),
    {
      name: "loan-app-auth",
      storage: createJSONStorage(() => localStorage)
    }
  )
);
