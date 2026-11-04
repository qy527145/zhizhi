import type { User } from "@zhizhi/shared";
import { create } from "zustand";
import { api, setUnauthorizedHandler, tokenStore } from "@/lib/api";

interface AuthState {
  user: User | null;
  /** 首次加载时校验本地 token 的过程 */
  bootstrapping: boolean;
  bootstrap: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, name: string, password: string) => Promise<void>;
  logout: () => void;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  bootstrapping: true,
  bootstrap: async () => {
    if (!tokenStore.get()) return set({ bootstrapping: false });
    try {
      set({ user: await api.me(), bootstrapping: false });
    } catch {
      tokenStore.clear();
      set({ user: null, bootstrapping: false });
    }
  },
  login: async (email, password) => {
    const r = await api.login({ email, password });
    tokenStore.set(r.token);
    set({ user: r.user });
  },
  register: async (email, name, password) => {
    const r = await api.register({ email, name, password });
    tokenStore.set(r.token);
    set({ user: r.user });
  },
  logout: () => {
    tokenStore.clear();
    set({ user: null });
  },
}));

setUnauthorizedHandler(() => useAuth.getState().logout());
