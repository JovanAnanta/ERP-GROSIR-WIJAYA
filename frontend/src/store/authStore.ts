import { create } from 'zustand';

export interface AuthUser {
  userId: string;
  username: string;
  fullName: string;
  roleId: string;
  permissions: string[];
}

export type AuthStatus =
  | 'INITIALIZING'
  | 'AUTHENTICATED'
  | 'UNAUTHENTICATED';

function clearCachedUser(): void {
  try {
    localStorage.removeItem('erp_user');
  } catch {
    // Browser storage is optional; backend session remains authoritative.
  }
}

function writeCachedUser(user: AuthUser): void {
  try {
    localStorage.setItem('erp_user', JSON.stringify(user));
  } catch {
    // A cache failure must never block authentication.
  }
}

function readCachedUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem('erp_user');
    if (!raw) return null;

    const value = JSON.parse(raw) as Partial<AuthUser> | null;
    if (
      !value ||
      typeof value.userId !== 'string' ||
      typeof value.username !== 'string' ||
      typeof value.fullName !== 'string' ||
      typeof value.roleId !== 'string'
    ) {
      clearCachedUser();
      return null;
    }

    return {
      ...(value as Omit<AuthUser, 'permissions'>),
      permissions: Array.isArray(value.permissions)
        ? value.permissions.filter((permission): permission is string =>
            typeof permission === 'string',
          )
        : [],
    };
  } catch {
    clearCachedUser();
    return null;
  }
}

const cachedUser = readCachedUser();

interface AuthState {
  user: AuthUser | null;
  authStatus: AuthStatus;
  isAuthenticated: boolean;
  isLocked: boolean; // True jika sesi terkunci karena idle timeout
  lockReason: string | null;
  forceLogoutMessage: string | null; // Pesan aman saat backend mengakhiri sesi
  
  // Actions
  login: (user: AuthUser) => void;
  hydrate: (user: AuthUser) => void;
  markUnauthenticated: () => void;
  logout: () => void;
  lockSession: (reason: string) => void;
  unlockSession: () => void;
  setForceLogout: (message: string) => void;
  clearForceLogout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: cachedUser,
  authStatus: 'INITIALIZING',
  isAuthenticated: false,
  isLocked: false,
  lockReason: null,
  forceLogoutMessage: null,

  login: (user) => {
    writeCachedUser(user);
    set({
      user,
      authStatus: 'AUTHENTICATED',
      isAuthenticated: true,
      forceLogoutMessage: null,
    });
  },
  hydrate: (user) => {
    writeCachedUser(user);
    set({ user, authStatus: 'AUTHENTICATED', isAuthenticated: true });
  },
  markUnauthenticated: () => {
    clearCachedUser();
    set({
      user: null,
      authStatus: 'UNAUTHENTICATED',
      isAuthenticated: false,
      isLocked: false,
      lockReason: null,
    });
  },
  logout: () => {
    clearCachedUser();
    set({
      user: null,
      authStatus: 'UNAUTHENTICATED',
      isAuthenticated: false,
      isLocked: false,
      lockReason: null,
    });
  },
  lockSession: (reason) => {
    set({ isLocked: true, lockReason: reason });
  },
  unlockSession: () => {
    set({ isLocked: false, lockReason: null });
  },
  setForceLogout: (message) => {
    clearCachedUser();
    set({
      user: null,
      authStatus: 'UNAUTHENTICATED',
      isAuthenticated: false,
      isLocked: false,
      lockReason: null,
      forceLogoutMessage: message,
    });
  },
  clearForceLogout: () => {
    set({ forceLogoutMessage: null });
  }
}));

export function hasPermission(
  user: AuthUser | null | undefined,
  permission: string,
): boolean {
  if (!user) return false;
  if (user.roleId === '1' || user.roleId === '2') return true;
  return user.permissions.includes('*') || user.permissions.includes(permission);
}
