import { create } from 'zustand';

export interface AuthUser {
  userId: string;
  username: string;
  fullName: string;
  roleId: string;
}

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLocked: boolean; // True jika kena Idle/Absolute Timeout
  lockReason: string | null;
  forceLogoutMessage: string | null; // Untuk pesan "Akun Anda telah digunakan di device lain"
  
  // Actions
  login: (user: AuthUser) => void;
  logout: () => void;
  lockSession: (reason: string) => void;
  unlockSession: () => void;
  setForceLogout: (message: string) => void;
  clearForceLogout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: JSON.parse(localStorage.getItem('erp_user') || 'null'),
  isAuthenticated: !!localStorage.getItem('erp_user'),
  isLocked: false,
  lockReason: null,
  forceLogoutMessage: null,

  login: (user) => {
    localStorage.setItem('erp_user', JSON.stringify(user));
    set({ user, isAuthenticated: true, forceLogoutMessage: null });
  },
  logout: () => {
    localStorage.removeItem('erp_user');
    set({ user: null, isAuthenticated: false, isLocked: false });
  },
  lockSession: (reason) => {
    set({ isLocked: true, lockReason: reason });
  },
  unlockSession: () => {
    set({ isLocked: false, lockReason: null });
  },
  setForceLogout: (message) => {
    localStorage.removeItem('erp_user');
    set({ user: null, isAuthenticated: false, isLocked: false, forceLogoutMessage: message });
  },
  clearForceLogout: () => {
    set({ forceLogoutMessage: null });
  }
}));