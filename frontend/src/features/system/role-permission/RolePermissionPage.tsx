import { useState, useEffect, useMemo, useCallback } from "react";
import { rolePermissionApi, type PermissionDef } from "../role-permission.api";
import { parseApiError } from "@/utils/error";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Shield, Save, X, Edit2, AlertTriangle } from "lucide-react";

export default function RolePermissionPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [showCancelAlert, setShowCancelAlert] = useState(false);

  const [allPermissions, setAllPermissions] = useState<PermissionDef[]>([]);
  // Menggunakan Set untuk O(1) Lookup & Toggle demi kecepatan komputasi
  const [initialCheckedIds, setInitialCheckedIds] = useState<Set<string>>(new Set());
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const response = await rolePermissionApi.getAdmin();
      setAllPermissions(response.data.allPermissions);
      
      const activeIds = new Set(response.data.activePermissionIds);
      setInitialCheckedIds(activeIds);
      setCheckedIds(new Set(activeIds)); // Clone untuk state edit
    } catch (err) {
      setErrorMsg(parseApiError(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => { void fetchData(); }, 0);
    return () => clearTimeout(timer);
  }, [fetchData]);

  // OPTIMISASI: Mencegah re-kalkulasi grouping setiap kali checkbox dicentang (Re-render)
  const groupedPermissions = useMemo(() => {
    const groups: Record<string, PermissionDef[]> = {};
    allPermissions.forEach((p) => {
      if (!groups[p.module]) groups[p.module] = [];
      groups[p.module].push(p);
    });
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [allPermissions]);

  const hasUnsavedChanges = useMemo(() => {
    if (initialCheckedIds.size !== checkedIds.size) return true;
    for (const id of checkedIds) {
      if (!initialCheckedIds.has(id)) return true;
    }
    return false;
  }, [initialCheckedIds, checkedIds]);

  const handleToggle = (permId: string) => {
    if (!isEditing) return;
    const newChecked = new Set(checkedIds);
    if (newChecked.has(permId)) {
      newChecked.delete(permId);
    } else {
      newChecked.add(permId);
    }
    setCheckedIds(newChecked);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setErrorMsg(null);
    try {
      await rolePermissionApi.updateAdmin({
        oldPermissionIds: Array.from(initialCheckedIds),
        newPermissionIds: Array.from(checkedIds),
      });
      
      // Jika sukses, ubah state initial menjadi yang terbaru dan keluar dari mode edit
      setInitialCheckedIds(new Set(checkedIds));
      setIsEditing(false);
    } catch (err) {
      setErrorMsg(parseApiError(err));
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelClick = () => {
    if (hasUnsavedChanges) {
      setShowCancelAlert(true);
    } else {
      setIsEditing(false);
    }
  };

  const confirmCancel = () => {
    setCheckedIds(new Set(initialCheckedIds)); // Kembalikan ke kondisi semula
    setIsEditing(false);
    setShowCancelAlert(false);
    setErrorMsg(null);
  };

  return (
    <div className="p-6 bg-slate-50 min-h-full">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Shield className="w-6 h-6 text-slate-700" /> Role & Permission
          </h2>
          <p className="text-slate-500 text-sm mt-1">Konfigurasi hak akses (Permission) untuk Role ADMIN.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!isEditing ? (
            <Button onClick={() => setIsEditing(true)} disabled={isLoading} className="bg-slate-900 text-white hover:bg-slate-800">
              <Edit2 className="w-4 h-4 mr-2" /> Edit Permission
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={handleCancelClick} disabled={isSaving} className="border-slate-300">
                <X className="w-4 h-4 mr-2" /> Cancel
              </Button>
              <Button onClick={() => void handleSave()} disabled={isSaving || !hasUnsavedChanges} className="bg-emerald-600 text-white hover:bg-emerald-700">
                <Save className="w-4 h-4 mr-2" /> {isSaving ? "Menyimpan..." : "Save Changes"}
              </Button>
            </>
          )}
        </div>
      </div>

      {errorMsg && (
        <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-sm font-medium flex items-center gap-2">
          <AlertTriangle className="w-5 h-5" /> {errorMsg}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-6">
        <div className="p-4 bg-slate-900 border-b border-slate-200 flex items-center gap-4">
          <span className="text-slate-300 text-sm font-medium uppercase tracking-wider">Target Role:</span>
          <span className="bg-slate-700 text-white px-3 py-1 rounded-md text-sm font-bold tracking-widest">
            ADMIN
          </span>
        </div>
        
        <div className="p-6">
          {isLoading ? (
            <div className="text-center py-12 text-slate-500 font-medium animate-pulse">Memuat konfigurasi permission...</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {groupedPermissions.map(([moduleName, perms]) => (
                <Card key={moduleName} className="border-slate-200 shadow-none">
                  <CardHeader className="py-4 border-b border-slate-100 bg-slate-50/50">
                    <CardTitle className="text-sm font-bold text-slate-800 uppercase tracking-wide">
                      {moduleName}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 space-y-4">
                    {perms.map((p) => (
                      <div key={p.id} className="flex items-start space-x-3">
                        <Checkbox
                          id={`perm-${p.id}`}
                          checked={checkedIds.has(p.id)}
                          onCheckedChange={() => handleToggle(p.id)}
                          disabled={!isEditing}
                          className="mt-0.5"
                        />
                        <div className="space-y-1 leading-none">
                          <Label
                            htmlFor={`perm-${p.id}`}
                            className={`text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 ${isEditing ? 'cursor-pointer' : ''}`}
                          >
                            {p.action}
                          </Label>
                          <p className="text-xs text-slate-500">
                            {p.name}
                          </p>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Confirmation Dialog saat Cancel namun ada data yang belum disave */}
      <AlertDialog open={showCancelAlert} onOpenChange={setShowCancelAlert}>
        <AlertDialogContent className="bg-white border border-slate-200 shadow-xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-slate-900">
              <AlertTriangle className="w-5 h-5 text-amber-500" /> Perubahan Belum Disimpan
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-600 font-medium mt-2">
              Anda memiliki perubahan permission yang belum disimpan. Apakah Anda yakin ingin membuang (discard) perubahan ini?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4">
            <AlertDialogCancel className="border-slate-300 text-slate-700">Kembali Edit</AlertDialogCancel>
            <AlertDialogAction onClick={confirmCancel} className="bg-rose-600 text-white hover:bg-rose-700 border-0">
              Ya, Buang Perubahan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
