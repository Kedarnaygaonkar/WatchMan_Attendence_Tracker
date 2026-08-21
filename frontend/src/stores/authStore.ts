import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface WatchmanProfile {
  id: string;
  employee_id: string;
  full_name: string;
  phone: string;
  profile_photo_url: string | null;
  status: string;
}

export interface AuthUser {
  id: string;
  email: string;
  role: 'super_admin' | 'agency_admin' | 'watchman';
  name: string;
  phone: string | null;
  agencyId: string | null;
  agencyName: string | null;
  watchman: WatchmanProfile | null;
}

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;

  setAuth: (user: AuthUser, accessToken: string, refreshToken: string) => void;
  setTokens: (accessToken: string, refreshToken: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,

      setAuth: (user, accessToken, refreshToken) =>
        set({ user, accessToken, refreshToken, isAuthenticated: true }),

      setTokens: (accessToken, refreshToken) =>
        set({ accessToken, refreshToken }),

      logout: () =>
        set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false }),
    }),
    {
      name: 'watchman-auth',
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
