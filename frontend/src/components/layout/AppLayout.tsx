import { useEffect, useRef, useCallback, useState } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { hasPermission, useAuthStore } from "@/store/authStore";
import type { AuthUser } from "@/store/authStore";
import { apiClient } from "@/lib/axios";
import SessionLockPopup from "./SessionLockPopup";
import { Button } from "@/components/ui/button";
import {
  LogOut,
  LayoutDashboard,
  ShoppingCart,
  PackageOpen,
  Tags,
  Boxes,
  Wallet,
  Users,
  ShieldCheck,
  CircleDollarSign,
  Settings,
  FileClock,
  Menu,
  X,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import logoImage from "../../assets/WIJAYA LOGISTICS.png";

const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const ACTIVITY_SYNC_INTERVAL_MS = 5 * 60 * 1000;

export default function AppLayout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { user, logout, lockSession, isLocked, hydrate } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  const refreshPermissions = useCallback(() => {
    if (user?.roleId !== "3") return;
    void apiClient
      .get<unknown, { success: boolean; data: AuthUser }>("/auth/me")
      .then((response) => hydrate(response.data))
      .catch(() => undefined);
  }, [hydrate, user?.roleId]);

  useEffect(() => {
    refreshPermissions();
  }, [location.pathname, refreshPermissions]);

  useEffect(() => {
    window.addEventListener("focus", refreshPermissions);
    return () => window.removeEventListener("focus", refreshPermissions);
  }, [refreshPermissions]);

  // =========================================================================
  // ENTERPRISE IDLE DETECTOR (FR-SYS-001)
  // =========================================================================
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastActivitySyncRef = useRef(0);

  const triggerIdleLock = useCallback(() => {
    lockSession("Session_Locked_Idle");
  }, [lockSession]);

  const resetIdleTimer = useCallback(() => {
    if (isLocked) return;
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(triggerIdleLock, IDLE_TIMEOUT_MS);
  }, [triggerIdleLock, isLocked]);

  const syncBackendActivity = useCallback(() => {
    const now = Date.now();
    if (now - lastActivitySyncRef.current < ACTIVITY_SYNC_INTERVAL_MS) return;

    lastActivitySyncRef.current = now;
    void apiClient.post('/auth/activity').catch(() => undefined);
  }, []);

  useEffect(() => {
    resetIdleTimer();
    const activityEvents = [
      "mousemove",
      "mousedown",
      "keydown",
      "touchstart",
      "scroll",
    ];
    let throttleTimer: ReturnType<typeof setTimeout> | null = null;

    const handleUserActivity = () => {
      if (throttleTimer) return;
      throttleTimer = setTimeout(() => {
        resetIdleTimer();
        syncBackendActivity();
        throttleTimer = null;
      }, 1000);
    };

    activityEvents.forEach((event) => {
      window.addEventListener(event, handleUserActivity, { passive: true });
    });

    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      if (throttleTimer) clearTimeout(throttleTimer);
      activityEvents.forEach((event) =>
        window.removeEventListener(event, handleUserActivity),
      );
    };
  }, [resetIdleTimer, syncBackendActivity]);
  // =========================================================================

  const handleLogout = async () => {
    try {
      await apiClient.post("/auth/logout");
    } catch {
      // Abaikan error jaringan saat logout
    } finally {
      logout();
      navigate("/login", { replace: true });
    }
  };

  const isActive = (path: string) => location.pathname.startsWith(path);

  // Helper untuk menentukan nama role berdasarkan ID yang tersimpan di state
  const getRoleName = (roleId?: string) => {
    if (roleId === "1") return "Super Owner";
    if (roleId === "2") return "Owner";
    return "Admin";
  };

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-slate-50 font-sans">
      <SessionLockPopup />

      {mobileMenuOpen && (
        <button
          type="button"
          aria-label="Tutup menu navigasi"
          className="fixed inset-0 z-30 bg-slate-950/60 backdrop-blur-[1px] lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar Berbasis Kategori (Enterprise Grade) */}
      <aside onClickCapture={() => setMobileMenuOpen(false)} className={`fixed inset-y-0 left-0 z-40 flex w-[min(18rem,86vw)] flex-col bg-slate-900 text-slate-300 shadow-2xl transition-transform duration-300 lg:relative lg:z-10 lg:w-64 lg:shrink-0 lg:translate-x-0 ${mobileMenuOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="h-20 flex items-center justify-start px-6 bg-slate-950 border-b border-slate-800">
          <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center overflow-hidden mr-3">
            <img
              src={logoImage}
              alt="Logo"
              className="w-8 h-8 object-contain"
            />
          </div>
          <div>
            <h2 className="text-white font-bold tracking-wide text-sm">
              GROSIR WIJAYA
            </h2>
            <p className="text-slate-500 text-xs">Enterprise Edition</p>
          </div>
          <button
            type="button"
            aria-label="Tutup menu"
            onClick={() => setMobileMenuOpen(false)}
            className="ml-auto rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-6 px-4 custom-scrollbar">
          {/* GROUP 1: MENU UTAMA */}
          <div className="mb-6">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 px-2">
              Menu Utama
            </p>
            {hasPermission(user, "DASHBOARD_VIEW") && <div
              onClick={() => navigate("/dashboard")}
              className={`flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer mb-1 ${isActive("/dashboard") ? "bg-[#326dc8] text-white shadow-md" : "hover:bg-slate-800 hover:text-white"}`}
            >
              <LayoutDashboard className="w-5 h-5 mr-3 opacity-80" /> Dashboard
            </div>}
          </div>

          {/* GROUP 2: OPERASIONAL TOKO */}
          <div className="mb-6">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 px-2">
              Operasional
            </p>

            {hasPermission(user, "SALES_VIEW") && <div
              onClick={() => navigate("/sales/customers")}
              className={`flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer mb-1 ${isActive("/sales/customers") ? "bg-[#326dc8] text-white shadow-md" : "hover:bg-slate-800 hover:text-white"}`}
            >
              <ShoppingCart className="w-5 h-5 mr-3 opacity-80" /> Sales & Customers
            </div>}

            {hasPermission(user, "PURCHASE_VIEW") && <div
              onClick={() => navigate("/purchasing")}
              className={`flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer mb-1 ${isActive("/purchasing") ? "bg-[#326dc8] text-white shadow-md" : "hover:bg-slate-800 hover:text-white"}`}
            >
              <PackageOpen className="w-5 h-5 mr-3 opacity-80" /> Purchases & Suppliers
            </div>}

            {hasPermission(user, "MASTER_VIEW") && <div
              onClick={() => navigate("/catalog")}
              className={`flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer mb-1 ${isActive("/catalog") ? "bg-[#326dc8] text-white shadow-md" : "hover:bg-slate-800 hover:text-white"}`}
            >
              <Tags className="w-5 h-5 mr-3 opacity-80" /> Catalog & Pricing
            </div>}

            {/* ... Menu Catalog & Pricing yang sudah ada ... */}

            {hasPermission(user, "PRICING_VIEW") && <div
              onClick={() => navigate("/pricing")}
              className={`flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer mb-1 ${
                isActive("/pricing") 
                  ? "bg-[#326dc8] text-white shadow-md" 
                  : "hover:bg-slate-800 hover:text-white"
              }`}
            >
              <CircleDollarSign className="w-5 h-5 mr-3 opacity-80" /> Pricing Workspace
            </div>}

            {hasPermission(user, "INVENTORY_VIEW") && <div
              onClick={() => navigate("/inventory")}
              className={`flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer mb-1 ${isActive("/inventory") ? "bg-[#326dc8] text-white shadow-md" : "hover:bg-slate-800 hover:text-white"}`}
            >
              <Boxes className="w-5 h-5 mr-3 opacity-80" /> Inventory & Warehouse
            </div>}

            {hasPermission(user, "FINANCIAL_VIEW") && <div className="flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer mb-1 hover:bg-slate-800 hover:text-white">
              <Wallet className="w-5 h-5 mr-3 opacity-80" /> Finance & Accounting
            </div>}
          </div>

          {/* GROUP 3: PENGATURAN SISTEM */}
          {(user?.roleId === "1" || user?.roleId === "2") && (
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 px-2">
                Sistem
              </p>

              <div
                onClick={() => navigate("/system/users")}
                className={`flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer mb-1 ${isActive("/system/users") ? "bg-[#326dc8] text-white shadow-md" : "hover:bg-slate-800 hover:text-white"}`}
              >
                <Users className="w-5 h-5 mr-3 opacity-80" /> User Management
              </div>

              {user?.roleId === "1" && (
                <div
                  onClick={() => navigate("/system/role-permissions")}
                  className={`flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer mb-1 ${isActive("/system/role-permissions") ? "bg-[#326dc8] text-white shadow-md" : "hover:bg-slate-800 hover:text-white"}`}
                >
                  <ShieldCheck className="w-5 h-5 mr-3 opacity-80" /> Role & Permission
                </div>
              )}

              <div
                onClick={() => navigate("/system/logs")}
                className={`flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer mb-1 ${isActive("/system/logs") ? "bg-[#326dc8] text-white shadow-md" : "hover:bg-slate-800 hover:text-white"}`}
              >
                <FileClock className="w-5 h-5 mr-3 opacity-80" /> System Logs
              </div>

              {user?.roleId === "1" && (
                <div
                  onClick={() => navigate("/system/configuration")}
                  className={`flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer mb-1 ${isActive("/system/configuration") ? "bg-[#326dc8] text-white shadow-md" : "hover:bg-slate-800 hover:text-white"}`}
                >
                  <Settings className="w-5 h-5 mr-3 opacity-80" /> System Configuration
                </div>
              )}
            </div>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-slate-50">
        <header className="z-20 flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-3 shadow-sm sm:px-4 md:h-20 md:px-8">
          <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
            <button
              type="button"
              aria-label="Buka menu navigasi"
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen(true)}
              className="shrink-0 rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0">
            <h1 className="truncate text-sm font-extrabold tracking-tight text-slate-800 sm:text-base md:text-xl">
              {isActive("/system/users")
                ? "User Management"
                : isActive("/system/role-permissions")
                  ? "Role & Permission"
                  : isActive("/system/logs")
                    ? "System Logs"
                    : isActive("/system/configuration")
                      ? "System Configuration"
                    : isActive("/sales/customers")
                      ? "Sales & Customers"
                    : isActive("/inventory")
                      ? "Inventory & Warehouse"
                    : "Dashboard"
                    }
            </h1>
            <p className="hidden text-[10px] font-medium uppercase tracking-wider text-slate-500 sm:block md:text-xs">
              Modul ERP Terintegrasi
            </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-3 md:gap-6">
            <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 p-1 sm:px-3 sm:py-1.5 md:gap-3 md:px-4 md:py-2">
              <div className="w-8 h-8 rounded-full bg-[#326dc8] text-white flex items-center justify-center font-bold text-sm">
                {user?.fullName?.charAt(0).toUpperCase() || "A"}
              </div>
              <div className="hidden flex-col sm:flex">
                <span className="text-sm font-bold text-slate-900 leading-none">
                  {user?.fullName || "Administrator"}
                </span>
                <span className="text-xs text-slate-500 font-medium mt-0.5">
                  {getRoleName(user?.roleId)}
                </span>
              </div>
            </div>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  className="text-slate-500 hover:bg-rose-50 hover:text-rose-600 rounded-full w-10 h-10 p-0"
                >
                  <LogOut className="w-5 h-5" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="bg-white border-slate-200">
                <AlertDialogHeader>
                  <AlertDialogTitle>Logout dari Sistem?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Pastikan Anda telah menyimpan seluruh pekerjaan sebelum
                    keluar dari sistem ERP Grosir Wijaya.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Batal</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => void handleLogout()}
                    className="bg-rose-600 text-white hover:bg-rose-700"
                  >
                    Ya, Logout Sekarang
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </header>

        <div className="erp-content relative min-w-0 flex-1 overflow-auto overscroll-contain">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
