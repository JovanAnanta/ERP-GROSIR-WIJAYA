import { Routes, Route, Navigate, Outlet } from 'react-router-dom';

import { useAuthStore } from '@/store/authStore';

import AppLayout from '@/components/layout/AppLayout';

import LoginPage from '@/features/auth/LoginPage';
import UserManagementPage from '@/features/system/user/UserManagementPage';
import RolePermissionPage from '@/features/system/role-permission/RolePermissionPage';
import SystemConfigurationPage from '@/features/system/system-configuration/SystemConfigurationPage';
import CatalogModulePage from '@/features/master/CatalogModulePage';
import PricingModulePage from '@/features/pricing/PricingModulePage'; // <--- Import PricingModulePage

// TAMBAHKAN IMPORT INI DI SINI
import SalesModulePage from '@/features/sales/SalesModulePage';
import PurchasingModulePage from '@/features/purchasing/PurchasingModulePage';

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
          <Route path="/dashboard" element={
            <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-100">
              <h2 className="text-2xl font-bold text-slate-800 mb-2">Selamat Datang di Dashboard!</h2>
              <p className="text-slate-500">Anda berhasil login ke sistem ERP Grosir Wijaya.</p>
            </div>
          } />

          {/* FR-SYS-002: Hanya Role 1 (Super Owner) & 2 (Owner) yang boleh akses */}
          <Route element={<RoleGuard allowedRoles={['1', '2']} />}>
            <Route path="/system/users" element={<UserManagementPage />} />
          </Route>

          {/* Rute Role & Permission (Eksklusif Super Owner) */}
          <Route element={<RoleGuard allowedRoles={['1']} />}>
            <Route path="/system/role-permissions" element={<RolePermissionPage />} />
          </Route>

          {/* Rute System Configuration (Eksklusif Super Owner) */}
          <Route element={<RoleGuard allowedRoles={['1']} />}>
            <Route path="/system/configuration" element={<SystemConfigurationPage />} />
          </Route>

          {/* Rute Khusus Sales & Customer */}
          <Route element={<RoleGuard allowedRoles={['1', '2', '3']} />}>
            <Route path="/sales/customers" element={<SalesModulePage />} />
          </Route>

          <Route element={<RoleGuard allowedRoles={['1', '2', '3']} />}>
            <Route path="/purchasing" element={<PurchasingModulePage />} />
          </Route>

          <Route element={<RoleGuard allowedRoles={['1', '2', '3']} />}>
            <Route path="/catalog" element={<CatalogModulePage />} />
          </Route>

          {/* Rute Pricing Module */}
          <Route element={<RoleGuard allowedRoles={['1', '2', '3']} />}>
            <Route path="/pricing" element={<PricingModulePage />} />
          </Route>

        </Route>
      </Route>

      {/* Rute 404 (Fallback untuk URL yang tidak terdaftar) */}
      <Route path="*" element={
        <div className="flex h-screen w-full items-center justify-center flex-col gap-2">
          <h1 className="text-4xl font-bold text-slate-800">404</h1>
          <p className="text-slate-500">Halaman tidak ditemukan.</p>
        </div>
      } />
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