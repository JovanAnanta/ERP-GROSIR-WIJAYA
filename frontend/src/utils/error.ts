import { AxiosError } from 'axios';

export interface BackendErrorResponse {
  success: false;
  category: string;
  message: string;
}

export const parseApiError = (error: unknown): string => {
  if (error instanceof AxiosError) {
    // Menangkap format error dari NestJS GlobalExceptionFilter kita
    const backendError = error.response?.data as BackendErrorResponse;
    if (backendError && backendError.message) {
      return backendError.message;
    }
    return error.message || 'Terjadi kesalahan pada jaringan.';
  }
  
  if (error instanceof Error) return error.message;
  return 'Terjadi kesalahan yang tidak diketahui.';
};