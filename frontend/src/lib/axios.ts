import axios, { AxiosError } from "axios";
import { ENV } from "../config/env";
import { useAuthStore } from "../store/authStore";

export const apiClient = axios.create({
  baseURL: ENV.API_URL,
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true, // Wajib agar HttpOnly Cookie dikirim ke backend
});

let ephemeralDeviceIdentifier: string | null = null;

function createDeviceIdentifier(): string {
  ephemeralDeviceIdentifier ??= globalThis.crypto.randomUUID();
  return ephemeralDeviceIdentifier;
}

function getDeviceIdentifier(): string {
  const storageKey = 'erp_device_id';
  try {
    const existing = localStorage.getItem(storageKey);
    if (existing) return existing;

    const identifier = createDeviceIdentifier();
    localStorage.setItem(storageKey, identifier);
    return identifier;
  } catch {
    return createDeviceIdentifier();
  }
}

apiClient.interceptors.request.use((config) => {
  config.headers.set('X-Device-Id', getDeviceIdentifier());
  return config;
});

interface BackendErrorResponse {
  message: string;
  category: string;
}

apiClient.interceptors.response.use(
  (response) => response.data,
  (error: AxiosError) => {
    const status = error.response?.status;
    const responseData = error.response?.data as BackendErrorResponse;
    const message = responseData?.message;

    const authStore = useAuthStore.getState();

    // Penanganan Session Lock (FR-SYS-001)
    if (status === 403 && message === "Session_Locked_Idle") {
      // Menggunakan lockSession (sesuai method yang ada di authStore)
      authStore.lockSession(message);
      return Promise.reject(error);
    }

    if (status === 403 && message === "Session_Locked_Absolute") {
      authStore.setForceLogout(
        'Batas waktu maksimum session telah berakhir. Silakan Login kembali.',
      );
      return Promise.reject(error);
    }

    // Penanganan Force Logout (FR-SYS-001)
    if (status === 401) {
      if (authStore.authStatus === 'AUTHENTICATED') {
        authStore.setForceLogout(
          'Session Anda tidak valid atau telah berakhir. Silakan Login kembali.',
        );
      } else {
        authStore.markUnauthenticated();
      }
    }

    return Promise.reject(error);
  },
);
