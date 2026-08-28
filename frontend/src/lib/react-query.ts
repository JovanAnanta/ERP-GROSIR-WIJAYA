import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false, // Jangan fetch ulang setiap kali user pindah tab Chrome
      retry: 1, // Hanya coba fetch ulang 1 kali jika gagal
      staleTime: 1000 * 60 * 5, // Data dianggap segar selama 5 menit
    },
    mutations: {
      // Setup global on error untuk mutasi (POST/PUT/DELETE)
      // onError: (error) => { toast.error(parseApiError(error)) }
    }
  },
});