import { useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { apiClient } from '@/lib/axios';
import { parseApiError } from '@/utils/error';

import { 
  AlertDialog, 
  AlertDialogContent, 
  AlertDialogHeader, 
  AlertDialogTitle, 
  AlertDialogDescription, 
  AlertDialogFooter 
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Lock, AlertTriangle } from 'lucide-react';

export default function SessionLockPopup() {
  const { isLocked, lockReason, unlockSession, logout, setForceLogout } = useAuthStore();
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isAbsolute = lockReason === 'Session_Locked_Absolute';

  const handleUnlock = async () => {
    if (!password) {
      setErrorMsg('Password wajib diisi');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);
    try {
      await apiClient.post('/auth/unlock', { password });
      unlockSession();
      setPassword('');
    } catch (error: unknown) {
      const msg = parseApiError(error);
      
      // Jika Backend berteriak "Terkunci", langsung eksekusi tendangan keluar!
      if (msg.toLowerCase().includes('terkunci')) {
        unlockSession(); // Tutup popup ini
        logout(); // Hapus state user
        setForceLogout(msg); // Munculkan pesan "Akses Diblokir" di halaman Login
        window.location.href = '/login';
      } else {
        setErrorMsg(msg);
        setPassword(''); // Kosongkan agar user mengetik ulang
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await apiClient.post('/auth/logout');
    } catch {
      // Abaikan error pada logout
    } finally {
      logout();
      unlockSession();
      window.location.href = '/login';
    }
  };

  // Jika tidak terkunci, jangan render apa pun
  if (!isLocked) return null;

  return (
    <AlertDialog open={isLocked}>
      <AlertDialogContent 
        className="max-w-md bg-white border border-slate-200 shadow-2xl" 
        onEscapeKeyDown={(e) => e.preventDefault()} // Mencegah lolos dengan tombol ESC
        // Overlay bawaan RadixUI secara otomatis memblokir klik di luar popup (Background dimatikan/blur)
      >
        <AlertDialogHeader className="flex flex-col items-center space-y-3 pb-2">
          <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mb-2">
            <Lock className="w-8 h-8 text-amber-600" />
          </div>
          <AlertDialogTitle className="text-center text-2xl font-extrabold text-slate-900">
            Sesi Terkunci
          </AlertDialogTitle>
          <AlertDialogDescription className="text-center font-medium text-slate-600 text-sm">
            {isAbsolute 
              ? 'Waktu sesi maksimum (12 jam) telah tercapai.' 
              : 'Sistem mendeteksi tidak ada aktivitas (Idle selama 30 menit).'}
            <br className="mt-2" />
            <span className="text-slate-800">Silakan masukkan Password untuk melanjutkan pekerjaan Anda tanpa me-refresh halaman.</span>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="py-4 space-y-4">
          <Input 
            type="password" 
            placeholder="••••••••" 
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isLoading}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleUnlock();
            }}
            className="text-center text-lg tracking-widest bg-slate-50 border-slate-300 focus-visible:ring-slate-900 h-12"
            autoFocus
          />
          {errorMsg && (
            <div className="bg-rose-50 text-rose-700 p-3 rounded-md text-sm font-medium flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        <AlertDialogFooter className="sm:justify-center flex-col sm:flex-col space-y-3 sm:space-y-3 w-full">
          <Button onClick={() => void handleUnlock()} disabled={isLoading || !password} className="w-full bg-[#326dc8] hover:bg-[#2858a6] text-white py-6 text-md font-bold shadow-md">
            {isLoading ? 'Memverifikasi...' : 'Lanjutkan Pekerjaan'}
          </Button>
          <Button variant="ghost" onClick={() => void handleLogout()} disabled={isLoading} className="w-full text-slate-500 hover:text-slate-800">
            Keluar dari Sistem
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}