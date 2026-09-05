import { lazy, Suspense, useEffect } from "react";
import { Routes, Route, Navigate, Outlet } from "react-router-dom";

import { hasPermission, useAuthStore } from "@/store/authStore";
import type { AuthUser } from "@/store/authStore";
import { apiClient } from "@/lib/axios";

import AppLayout from "@/components/layout/AppLayout";

import LoginPage from "@/features/auth/LoginPage";
import UserManagementPage from "@/features/system/user/UserManagementPage";
import RolePermissionPage from "@/features/system/role-permission/RolePermissionPage";
import SystemConfigurationPage from "@/features/system/system-configuration/SystemConfigurationPage";
import SystemLogsPage from "@/features/system/logs/SystemLogsPage";
import CatalogModulePage from "@/features/master/CatalogModulePage";
import PricingModulePage from "@/features/pricing/PricingModulePage"; // <--- Import PricingModulePage

// TAMBAHKAN IMPORT INI DI SINI
import SalesModulePage from "@/features/sales/SalesModulePage";
import PurchasingModulePage from "@/features/purchasing/PurchasingModulePage";
import InventoryModulePage from "@/features/inventory/InventoryModulePage";

const FifoModulePage = lazy(() => import("@/features/fifo/FifoModulePage"));

// React StrictMode mounts effects twice in development. Reuse the same
// server-side session check so hydration never creates duplicate /auth/me calls.
let authenticationHydration: Promise<AuthUser> | null = null;
function currentAuthenticatedUser(): Promise<AuthUser> {
  authenticationHydration ??= apiClient
    .get<unknown, { success: boolean; data: AuthUser }>("/auth/me")
    .then((response) => response.data);
  return authenticationHydration;
}

// Guard Component: Melindungi halaman yang butuh login
function ProtectedRoute() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}

// Guard Component: Mencegah user yang sudah login membuka halaman /login
function PublicRoute() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}

export default function App() {
  const authStatus = useAuthStore((state) => state.authStatus);
  const hydrate = useAuthStore((state) => state.hydrate);
  const markUnauthenticated = useAuthStore(
    (state) => state.markUnauthenticated,
  );

  useEffect(() => {
    let active = true;

    currentAuthenticatedUser()
      .then((user) => {
        if (active) hydrate(user);
      })
      .catch(() => {
        if (active) markUnauthenticated();
      });

    return () => {
      active = false;
    };
  }, [hydrate, markUnauthenticated]);

  useEffect(() => {
    const preventNumberWheel = (event: WheelEvent) => {
      const target = event.target as HTMLInputElement | null;
      if (target?.type === "number" && document.activeElement === target) {
        event.preventDefault();
        target.blur();
      }
    };
    const selectZero = (event: FocusEvent) => {
      const target = event.target as HTMLInputElement | null;
      if (target?.type === "number" && Number(target.value) === 0) {
        target.select();
      }
    };
    document.addEventListener("wheel", preventNumberWheel, {
      capture: true,
      passive: false,
    });
    document.addEventListener("focusin", selectZero);
    return () => {
      document.removeEventListener("wheel", preventNumberWheel, true);
      document.removeEventListener("focusin", selectZero);
    };
  }, []);

  if (authStatus === "INITIALIZING") {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-slate-50 text-sm font-medium text-slate-600">
        Memverifikasi session...
      </div>
    );
  }

  return (
    <Routes>
      {/* Root redirect ke /dashboard atau /login */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />

      {/* Rute Publik (Hanya bisa diakses jika BELUM login) */}
      <Route element={<PublicRoute />}>
        <Route path="/login" element={<LoginPage />} />
      </Route>

      {/* Rute Terproteksi (Wajib Login) */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route element={<PermissionRoute permission="DASHBOARD_VIEW" />}>
            <Route
              path="/dashboard"
              element={
                <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-100">
                  <h2 className="text-2xl font-bold text-slate-800 mb-2">
                    Selamat Datang di Dashboard!
                  </h2>
                  <p className="text-slate-500">
                    Anda berhasil login ke sistem ERP Grosir Wijaya.
                  </p>
                </div>
              }
            />
          </Route>

          <Route
            path="/access-denied"
            element={
              <div className="m-8 rounded-xl border border-amber-200 bg-white p-8 shadow-sm">
                <h2 className="text-xl font-bold text-slate-800">
                  Akses tidak tersedia
                </h2>
                <p className="mt-2 text-sm text-slate-600">
                  Permission akun Anda belum mengizinkan akses ke halaman ini.
                </p>
              </div>
            }
          />

          {/* FR-SYS-002: Hanya Role 1 (Super Owner) & 2 (Owner) yang boleh akses */}
          <Route element={<RoleGuard allowedRoles={["1", "2"]} />}>
            <Route path="/system/users" element={<UserManagementPage />} />
          </Route>

          {/* Rute Role & Permission (Eksklusif Super Owner) */}
          <Route element={<RoleGuard allowedRoles={["1"]} />}>
            <Route
              path="/system/role-permissions"
              element={<RolePermissionPage />}
            />
          </Route>

          {/* Log sistem bersifat read-only untuk Super Owner dan Owner */}
          <Route element={<RoleGuard allowedRoles={["1", "2"]} />}>
            <Route path="/system/logs" element={<SystemLogsPage />} />
          </Route>

          {/* Rute System Configuration (Eksklusif Super Owner) */}
          <Route element={<RoleGuard allowedRoles={["1"]} />}>
            <Route
              path="/system/configuration"
              element={<SystemConfigurationPage />}
            />
          </Route>

          {/* Rute Khusus Sales & Customer */}
          <Route element={<PermissionRoute permission="SALES_VIEW" />}>
            <Route path="/sales" element={<SalesModulePage />} />
            <Route path="/sales/customers" element={<SalesModulePage />} />
          </Route>

          <Route element={<PermissionRoute permission="PURCHASE_VIEW" />}>
            <Route path="/purchasing" element={<PurchasingModulePage />} />
          </Route>

          <Route element={<PermissionRoute permission="INVENTORY_VIEW" />}>
            <Route path="/inventory" element={<InventoryModulePage />} />
          </Route>

          <Route element={<PermissionRoute permission="FIFO_VIEW" />}>
            <Route
              path="/fifo"
              element={
                <Suspense
                  fallback={
                    <div className="flex min-h-64 items-center justify-center text-sm text-slate-500">
                      Memuat FIFO &amp; Cost...
                    </div>
                  }
                >
                  <FifoModulePage />
                </Suspense>
              }
            />
          </Route>

          <Route element={<PermissionRoute permission="MASTER_VIEW" />}>
            <Route path="/catalog" element={<CatalogModulePage />} />
          </Route>

          {/* Rute Pricing Module */}
          <Route element={<PermissionRoute permission="PRICING_VIEW" />}>
            <Route path="/pricing" element={<PricingModulePage />} />
          </Route>
        </Route>
      </Route>

      {/* Rute 404 (Fallback untuk URL yang tidak terdaftar) */}
      <Route
        path="*"
        element={
          <div className="flex h-screen w-full items-center justify-center flex-col gap-2">
            <h1 className="text-4xl font-bold text-slate-800">404</h1>
            <p className="text-slate-500">Halaman tidak ditemukan.</p>
          </div>
        }
      />
    </Routes>
  );
}

// GUARD BARU: Mencegah selain role yang diizinkan untuk masuk
function RoleGuard({ allowedRoles }: { allowedRoles: string[] }) {
  const user = useAuthStore((state) => state.user);
  if (!user || !allowedRoles.includes(user.roleId)) {
    return <Navigate to="/dashboard" replace />;
  }
  return <Outlet />;
}

function PermissionRoute({ permission }: { permission: string }) {
  const user = useAuthStore((state) => state.user);
  if (!hasPermission(user, permission)) {
    return <Navigate to="/access-denied" replace />;
  }
  return <Outlet />;
}
