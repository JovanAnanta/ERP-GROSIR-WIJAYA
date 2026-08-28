import { useState, useEffect } from "react";
import { useAuthStore } from "@/store/authStore";
import { userApi, type UserData } from "../user.api";
import { parseApiError } from "@/utils/error";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Plus, ShieldAlert, KeyRound, Ban, Unlock, LogOut } from "lucide-react";

type ModalState = "CREATE" | "EDIT" | "RESET_PW" | "DISABLE" | "FORCE_LOGOUT" | "UNLOCK" | null;

export default function UserManagementPage() {
  const currentUser = useAuthStore((state) => state.user);
  const [users, setUsers] = useState<UserData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [modal, setModal] = useState<{ type: ModalState; data: UserData | null }>({ type: null, data: null });
  const [formData, setFormData] = useState<Record<string, string>>({});

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      const response = await userApi.getAll();
      setUsers(response.data);
    } catch (err) {
      setErrorMsg(parseApiError(err));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchUsers();
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const closeModals = () => {
    setModal({ type: null, data: null });
    setFormData({});
    setErrorMsg(null);
  };

  const handleAction = async () => {
    setErrorMsg(null);
    setIsLoading(true);
    try {
      // Mapping Translasi dari UI (String Deskriptif) ke Backend (Angka/Boolean)
      const mappedRoleId = formData.roleSelect === "SUPER_OWNER" ? "1" : formData.roleSelect === "OWNER" ? "2" : "3";
      const mappedIsActive = formData.statusSelect === "ACTIVE";

      if (modal.type === "CREATE") {
        if (formData.password !== formData.confirmPassword) throw new Error("Password dan Konfirmasi Password tidak cocok.");
        await userApi.create({
          username: formData.username ?? "",
          fullName: formData.fullName ?? "",
          password: formData.password ?? "",
          roleId: mappedRoleId,
        });
      } else if (modal.type === "EDIT" && modal.data) {
        // Fix 409 Conflict: Kembalikan ISO Date menjadi String Timestamp Epoch
        const dbTimestamp = modal.data.updatedAt ? new Date(modal.data.updatedAt).getTime().toString() : "0";
        
        await userApi.update(modal.data.userId, {
          fullName: formData.fullName ?? "",
          roleId: mappedRoleId,
          isActive: mappedIsActive,
          updatedAt: dbTimestamp,
        });
      } else if (modal.type === "RESET_PW" && modal.data) {
        if (formData.newPassword !== formData.confirmPassword) throw new Error("Password dan Konfirmasi Password tidak cocok.");
        await userApi.resetPassword(modal.data.userId, { newPassword: formData.newPassword ?? "" });
      } else if (modal.type === "DISABLE" && modal.data) {
        await userApi.disable(modal.data.userId);
      } else if (modal.type === "FORCE_LOGOUT" && modal.data) {
        await userApi.forceLogout(modal.data.userId);
      } else if (modal.type === "UNLOCK" && modal.data) {
        await userApi.unlockSession(modal.data.userId);
      }

      await fetchUsers();
      closeModals();
    } catch (err) {
      setErrorMsg(parseApiError(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-6 bg-white rounded-xl shadow-sm border border-slate-100 min-h-full">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">User Management</h2>
          <p className="text-slate-500 text-sm">Kelola identitas, role, dan sesi pengguna ERP.</p>
        </div>
        <Button onClick={() => setModal({ type: "CREATE", data: null })} className="bg-slate-900 text-white hover:bg-slate-800">
          <Plus className="w-4 h-4 mr-2" /> User Baru
        </Button>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead>Username</TableHead>
              <TableHead>Nama Lengkap</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last Login</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.userId}>
                <TableCell className="font-medium">{u.username}</TableCell>
                <TableCell>{u.fullName}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="bg-slate-100 text-slate-700">{u.role.roleName}</Badge>
                </TableCell>
                <TableCell>
                  {u.isActive ? (
                    <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border-0">Active</Badge>
                  ) : (
                    <Badge className="bg-rose-100 text-rose-700 hover:bg-rose-200 border-0">Inactive</Badge>
                  )}
                </TableCell>
                <TableCell className="text-slate-500 text-sm">
                  {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString("id-ID") : "-"}
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="h-8 w-8 p-0"><MoreHorizontal className="h-4 w-4" /></Button>
                    </DropdownMenuTrigger>
                    
                    <DropdownMenuContent align="end" className="w-56 bg-white border border-slate-200 shadow-md">
                      
                      {/* FILTER AKSES: Manajemen Akun (Super Owner Atau Diri Sendiri) */}
                      {(currentUser?.roleId === "1" || currentUser?.userId === u.userId) && (
                        <>
                          <DropdownMenuLabel>Manajemen Akun</DropdownMenuLabel>
                          <DropdownMenuItem onClick={() => {
                            setFormData({
                              fullName: u.fullName ?? "",
                              roleSelect: u.roleId === "1" ? "SUPER_OWNER" : u.roleId === "2" ? "OWNER" : "ADMIN",
                              statusSelect: u.isActive ? "ACTIVE" : "INACTIVE",
                            });
                            setModal({ type: "EDIT", data: u });
                          }} className="cursor-pointer">
                            Edit Data
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setModal({ type: "RESET_PW", data: u })} className="cursor-pointer">
                            <KeyRound className="w-4 h-4 mr-2 text-amber-600" /> Reset Password
                          </DropdownMenuItem>
                        </>
                      )}

                      {/* FILTER AKSES: Manajemen Sesi (Super Owner ATAU Owner) */}
                      {(currentUser?.roleId === "1" || currentUser?.roleId === "2") && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuLabel>Manajemen Sesi</DropdownMenuLabel>
                          <DropdownMenuItem onClick={() => setModal({ type: "UNLOCK", data: u })} className="cursor-pointer">
                            <Unlock className="w-4 h-4 mr-2 text-emerald-600" /> Unlock Session
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setModal({ type: "FORCE_LOGOUT", data: u })} className="cursor-pointer">
                            <LogOut className="w-4 h-4 mr-2 text-rose-600" /> Force Logout
                          </DropdownMenuItem>
                        </>
                      )}

                      {/* FILTER AKSES: Disable User (Hanya Super Owner & Tidak bisa disable diri sendiri) */}
                      {u.isActive && currentUser?.roleId === "1" && currentUser?.userId !== u.userId && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => setModal({ type: "DISABLE", data: u })} className="text-rose-600 font-medium cursor-pointer">
                            <Ban className="w-4 h-4 mr-2" /> Nonaktifkan User
                          </DropdownMenuItem>
                        </>
                      )}
                      
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
            {users.length === 0 && !isLoading && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-6 text-slate-500">Tidak ada data user.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={modal.type === "CREATE" || modal.type === "EDIT" || modal.type === "RESET_PW"} onOpenChange={closeModals}>
        <DialogContent className="bg-white border border-slate-200 shadow-xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-slate-900 font-bold text-lg">
              {modal.type === "CREATE" ? "Buat User Baru" : modal.type === "EDIT" ? "Edit User" : "Reset Password"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {errorMsg && <div className="text-sm font-medium text-rose-600 bg-rose-50 p-3 rounded-md">{errorMsg}</div>}

            {(modal.type === "CREATE" || modal.type === "EDIT") && (
              <>
                <div className="space-y-2">
                  <Label className="text-slate-700">Username {modal.type === "EDIT" && "(Read Only)"}</Label>
                  <Input
                    disabled={modal.type === "EDIT" || isLoading}
                    value={modal.type === "EDIT" ? (modal.data?.username ?? "") : (formData.username ?? "")}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value ?? "" })}
                    className="bg-slate-50 border-slate-200"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-slate-700">Nama Lengkap</Label>
                  <Input disabled={isLoading} value={formData.fullName ?? ""} onChange={(e) => setFormData({ ...formData, fullName: e.target.value ?? "" })} className="bg-slate-50 border-slate-200" />
                </div>
                
                <div className="space-y-2">
                  <Label className="text-slate-700">Role</Label>
                  {/* Select yang deskriptif dan ramah UI */}
                  <Select disabled={isLoading} value={formData.roleSelect ?? ""} onValueChange={(val) => setFormData({ ...formData, roleSelect: val ?? "" })}>
                    <SelectTrigger className="bg-slate-50 border-slate-200"><SelectValue placeholder="Pilih Role" /></SelectTrigger>
                    <SelectContent className="bg-white border border-slate-200 shadow-md">
                      {currentUser?.roleId === "1" && <SelectItem value="SUPER_OWNER">Super Owner</SelectItem>}
                      <SelectItem value="OWNER">Owner</SelectItem>
                      <SelectItem value="ADMIN">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {modal.type === "EDIT" && (
                  <div className="space-y-2">
                    <Label className="text-slate-700">Status Akun</Label>
                    {/* Select Status yang deskriptif */}
                    <Select disabled={isLoading} value={formData.statusSelect ?? ""} onValueChange={(val) => setFormData({ ...formData, statusSelect: val ?? "" })}>
                      <SelectTrigger className="bg-slate-50 border-slate-200"><SelectValue placeholder="Pilih Status" /></SelectTrigger>
                      <SelectContent className="bg-white border border-slate-200 shadow-md">
                        <SelectItem value="ACTIVE">Active</SelectItem>
                        <SelectItem value="INACTIVE">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </>
            )}

            {(modal.type === "CREATE" || modal.type === "RESET_PW") && (
              <>
                <div className="space-y-2">
                  <Label className="text-slate-700">{modal.type === "RESET_PW" ? "Password Baru" : "Password"}</Label>
                  <Input type="password" disabled={isLoading} value={modal.type === "RESET_PW" ? (formData.newPassword ?? "") : (formData.password ?? "")} onChange={(e) => setFormData({ ...formData, [modal.type === "RESET_PW" ? "newPassword" : "password"]: e.target.value ?? "" })} className="bg-slate-50 border-slate-200" />
                </div>
                <div className="space-y-2">
                  <Label className="text-slate-700">Konfirmasi Password</Label>
                  <Input type="password" disabled={isLoading} value={formData.confirmPassword ?? ""} onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value ?? "" })} className="bg-slate-50 border-slate-200" />
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeModals} disabled={isLoading}>Batal</Button>
            <Button onClick={() => void handleAction()} disabled={isLoading} className="bg-slate-900 text-white hover:bg-slate-800">Simpan Data</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      <AlertDialog open={modal.type === "DISABLE" || modal.type === "FORCE_LOGOUT" || modal.type === "UNLOCK"} onOpenChange={closeModals}>
        <AlertDialogContent className="bg-white border border-slate-200 shadow-xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-amber-500" /> Konfirmasi Aksi
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-600 font-medium">
              {modal.type === "DISABLE" && "Nonaktifkan User? User tidak dapat Login hingga diaktifkan kembali."}
              {modal.type === "FORCE_LOGOUT" && "Force Logout User? Sesi akan langsung dihentikan dan user ditendang dari sistem."}
              {modal.type === "UNLOCK" && "Unlock Session? Kunci sesi akan dibuka tanpa memerlukan login ulang dari user."}
            </AlertDialogDescription>
            {errorMsg && <p className="text-sm text-destructive mt-2">{errorMsg}</p>}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLoading}>Tidak</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleAction()} disabled={isLoading} className="bg-slate-900 text-white hover:bg-slate-800">Ya, Lanjutkan</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}