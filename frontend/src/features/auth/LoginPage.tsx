import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useNavigate } from "react-router-dom";
import { apiClient } from "@/lib/axios";
import { useAuthStore } from "@/store/authStore";
import type { AuthUser } from "@/store/authStore";
import { parseApiError } from "@/utils/error";
import logoImage from "../../assets/WIJAYA LOGISTICS.png";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { AlertOctagon, Timer } from "lucide-react";

const loginSchema = z.object({
  username: z.string().min(1, "Username wajib diisi"),
  password: z.string().min(1, "Password wajib diisi"),
});

type LoginForm = z.infer<typeof loginSchema>;

interface LoginResponse {
  success: boolean;
  message: string;
  data: AuthUser;
}

export default function LoginPage() {
  const navigate = useNavigate();
  const login = useAuthStore((state) => state.login);
  const { forceLogoutMessage, clearForceLogout, isAuthenticated } =
    useAuthStore();

  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // State untuk Timer Countdown Lock
  const [lockExpiryTime, setLockExpiryTime] = useState<number | null>(null);
  const [countdownText, setCountdownText] = useState<string>("");

  useEffect(() => {
    if (isAuthenticated) navigate("/dashboard", { replace: true });
  }, [isAuthenticated, navigate]);

  // Efek khusus untuk menghitung mundur secara real-time
  useEffect(() => {
    if (!lockExpiryTime) return;

    const interval = setInterval(() => {
      const now = new Date().getTime();
      const diff = lockExpiryTime - now;

      if (diff <= 0) {
        clearInterval(interval);
        setLockExpiryTime(null);
        setErrorMsg(null); // Otomatis membuka blokir di UI
      } else {
        const m = Math.floor(diff / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        setCountdownText(`${m} Menit ${s} Detik`);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [lockExpiryTime]);

  const {
    register,
    handleSubmit,
    resetField,
    reset,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginForm) => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const response = await apiClient.post<unknown, LoginResponse>(
        "/auth/login",
        data,
      );
      login(response.data);
      navigate("/dashboard", { replace: true });
    } catch (error: unknown) {
      const msg = parseApiError(error);

      // UX Cerdas: Tangkap informasi menit dari Backend dan jalankan Countdown
      if (msg.toLowerCase().includes("terkunci")) {
        const match = msg.match(/dalam (\d+) menit/i);
        const minutesToWait = match ? parseInt(match[1], 10) : 10;

        // Menggunakan new Date().getTime() untuk menghindari isu purity linter
        const expiryTime = new Date().getTime() + minutesToWait * 60 * 1000;

        setLockExpiryTime(expiryTime);
        setErrorMsg("Sistem mendeteksi percobaan login yang tidak wajar.");
        resetField("password");
      } else {
        setErrorMsg(msg);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-[100dvh] w-full items-center justify-center overflow-y-auto bg-slate-50 px-4 py-6">
      {/* Pop-up Force Logout */}
      <AlertDialog
        open={!!forceLogoutMessage}
        onOpenChange={() => clearForceLogout()}
      >
        <AlertDialogContent className="bg-white border border-slate-200">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-rose-600 font-bold">
              Session Telah Berakhir
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-600 font-medium">
              {forceLogoutMessage}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              onClick={() => clearForceLogout()}
              className="bg-slate-900 text-white"
            >
              OK Mengerti
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* POPUP BLOKIR SEMENTARA */}
      <AlertDialog open={!!lockExpiryTime}>
        <AlertDialogContent
          className="bg-white border border-slate-200 shadow-2xl sm:max-w-md"
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <AlertDialogHeader>
            <AlertDialogTitle className="text-rose-600 font-extrabold flex items-center gap-2 text-xl">
              <AlertOctagon className="w-6 h-6" /> Akses Diblokir Sementara
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-700 font-medium text-base mt-3 leading-relaxed">
              {errorMsg}
              <div className="mt-4 p-4 bg-rose-50 text-rose-800 rounded-lg border border-rose-100 flex flex-col items-center justify-center space-y-2">
                <Timer className="w-8 h-8 text-rose-500 animate-pulse" />
                <span className="text-sm text-center">
                  Popup ini akan menghilang otomatis dalam:
                </span>
                <span className="text-2xl font-black font-mono tracking-widest text-rose-700">
                  {countdownText}
                </span>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-2 flex-col sm:flex-col items-center justify-center">
            <Button
              variant="outline"
              className="w-full text-slate-600 border-slate-300"
              onClick={() => {
                setLockExpiryTime(null);
                setErrorMsg(null);
                reset({ username: "", password: "" });
              }}
            >
              Batalkan, Saya ingin menggunakan Username Lain
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="w-full max-w-sm mx-auto flex flex-col items-center">
        <div className="w-32 h-32 p-0 rounded-xl flex items-center justify-center mb-3 overflow-hidden bg-transparent">
          <img
            src={logoImage}
            alt="Logo Wijaya Logistics"
            className="w-full h-full object-contain drop-shadow-sm"
          />
        </div>

        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 mb-1">
          ERP Grosir Wijaya
        </h1>
        <p className="text-slate-500 font-medium text-sm mb-6 text-center">
          Masukkan Username dan Password untuk mengakses sistem
        </p>

        <form onSubmit={handleSubmit(onSubmit)} className="w-full space-y-4">
          <div className="space-y-1.5 text-left w-full">
            <Label htmlFor="username" className="text-slate-700 font-bold">
              Username
            </Label>
            <Input
              id="username"
              type="text"
              disabled={isLoading}
              placeholder="Masukkan username"
              className={`bg-white border-slate-300 placeholder:text-slate-400 focus-visible:ring-slate-900 shadow-sm ${errors.username ? "border-rose-500" : ""}`}
              {...register("username")}
            />
            {errors.username && (
              <p className="text-sm text-rose-600 font-medium">
                {errors.username.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5 text-left w-full">
            <Label htmlFor="password" className="text-slate-700 font-bold">
              Password
            </Label>
            <Input
              id="password"
              type="password"
              disabled={isLoading}
              placeholder="••••••••"
              className={`bg-white border-slate-300 placeholder:text-slate-400 focus-visible:ring-slate-900 shadow-sm ${errors.password ? "border-rose-500" : ""}`}
              {...register("password")}
            />
            {errors.password && (
              <p className="text-sm text-rose-600 font-medium">
                {errors.password.message}
              </p>
            )}
          </div>

          {errorMsg && !lockExpiryTime && (
            <div className="p-3 rounded-lg flex items-start gap-2 border w-full text-left bg-rose-50 border-rose-200 text-rose-700">
              <div className="text-sm font-semibold leading-snug">
                {errorMsg}
              </div>
            </div>
          )}

          <Button
            type="submit"
            className="w-full py-6 text-md font-bold text-white bg-[#326dc8] hover:bg-[#2858a6] shadow-md hover:shadow-lg transition-all mt-2"
            disabled={isLoading}
          >
            {isLoading ? "Memverifikasi..." : "Login"}
          </Button>
        </form>
      </div>
    </div>
  );
}
