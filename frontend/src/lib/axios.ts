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
    if (
      status === 403 &&
      (message === "Session_Locked_Idle" ||
        message === "Session_Locked_Absolute")
    ) {
      // Menggunakan lockSession (sesuai method yang ada di authStore)
      authStore.lockSession(message);
      return new Promise(() => {}); // Gantung request agar UI form di belakangnya tidak error
    }

    // Penanganan Force Logout (FR-SYS-001)
    if (status === 401) {
      if (authStore.isAuthenticated) {
        authStore.setForceLogout(
          "Akun Anda telah digunakan untuk Login dari device lain. Session telah berakhir.",
        );
      }
    }

    return Promise.reject(error);
  },
);