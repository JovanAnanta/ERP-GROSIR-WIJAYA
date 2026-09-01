import { useState, useEffect, useRef, useMemo } from "react";
import {
  systemConfigApi,
  type SystemConfigData,
} from "../system-configuration.api";
import { parseApiError } from "@/utils/error";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  Settings,
  Save,
  X,
  Edit2,
  AlertTriangle,
  UploadCloud,
  Image as ImageIcon,
  Printer,
  FileText,
} from "lucide-react";

export default function SystemConfigurationPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [showCancelAlert, setShowCancelAlert] = useState(false);

  // Toggle state untuk Simulasi: 'thermal' (Struk Kasir) atau 'pdf' (Dokumen A4)
  const [previewMode, setPreviewMode] = useState<"thermal" | "pdf">("thermal");

  const [originalData, setOriginalData] = useState<SystemConfigData | null>(
    null,
  );
  const [formData, setFormData] = useState<Partial<SystemConfigData>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchConfig = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const response = await systemConfigApi.get();
      setOriginalData(response.data);
      setFormData(response.data);
    } catch (err) {
      setErrorMsg(parseApiError(err));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchConfig();
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const hasUnsavedChanges = useMemo(() => {
    if (!originalData) return false;
    return (
      JSON.stringify(originalData) !==
      JSON.stringify({ ...originalData, ...formData })
    );
  }, [originalData, formData]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!["image/jpeg", "image/png"].includes(file.type)) {
      setErrorMsg("Format Logo tidak didukung. Gunakan PNG atau JPG.");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setErrorMsg("Ukuran Logo melebihi batas maksimum (2 MB).");
      return;
    }

    setErrorMsg(null);
    const reader = new FileReader();
    reader.onloadend = () => {
      setFormData((prev) => ({ ...prev, logoBase64: reader.result as string }));
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!formData.companyName || !formData.address || !formData.phone) {
      setErrorMsg("Company Name, Address, dan Phone wajib diisi.");
      return;
    }

    setIsSaving(true);
    setErrorMsg(null);
    try {
      await systemConfigApi.update({
        companyName: formData.companyName,
        address: formData.address,
        phone: formData.phone,
        logoBase64: formData.logoBase64 ?? null,
        receiptHeader1: formData.receiptHeader1 ?? null,
        receiptHeader2: formData.receiptHeader2 ?? null,
        receiptHeader3: formData.receiptHeader3 ?? null,
        receiptFooter1: formData.receiptFooter1 ?? null,
        receiptFooter2: formData.receiptFooter2 ?? null,
        receiptFooter3: formData.receiptFooter3 ?? null,
      });

      await fetchConfig();
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
    if (originalData) setFormData(originalData);
    setIsEditing(false);
    setShowCancelAlert(false);
    setErrorMsg(null);
  };

  if (isLoading && !originalData) {
    return (
      <div className="p-6 text-slate-500 font-medium animate-pulse">
        Memuat konfigurasi sistem...
      </div>
    );
  }

  return (
    <div className="p-6 bg-slate-50 min-h-full">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Settings className="w-6 h-6 text-slate-700" /> System Configuration
          </h2>
          <p className="text-slate-500 text-sm mt-1">
            Pengaturan identitas perusahaan dan format global sistem.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {!isEditing ? (
            <Button
              onClick={() => setIsEditing(true)}
              disabled={isLoading}
              className="bg-slate-900 text-white hover:bg-slate-800"
            >
              <Edit2 className="w-4 h-4 mr-2" /> Edit Configuration
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={handleCancelClick}
                disabled={isSaving}
                className="border-slate-300"
              >
                <X className="w-4 h-4 mr-2" /> Cancel
              </Button>
              <Button
                onClick={() => void handleSave()}
                disabled={isSaving || !hasUnsavedChanges}
                className="bg-emerald-600 text-white hover:bg-emerald-700"
              >
                <Save className="w-4 h-4 mr-2" />{" "}
                {isSaving ? "Menyimpan..." : "Save Changes"}
              </Button>
            </>
          )}
        </div>
      </div>

      {errorMsg && (
        <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-sm font-medium flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 shrink-0" />{" "}
          <span className="flex-1">{errorMsg}</span>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 items-start">
        {/* KOLOM KIRI & TENGAH: Form Input Utama */}
        <div className="xl:col-span-2 space-y-6">
          {/* Section A: Company Profile */}
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="bg-slate-50/50 border-b border-slate-100">
              <CardTitle className="text-lg font-bold text-slate-800">
                Section A — Company Profile
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-slate-700 font-semibold">
                      Company Name <span className="text-rose-500">*</span>
                    </Label>
                    <Input
                      disabled={!isEditing}
                      value={formData.companyName ?? ""}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          companyName: e.target.value,
                        })
                      }
                      className="bg-slate-50 disabled:bg-slate-100"
                      placeholder="Contoh: TOKO GROSIR WIJAYA"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-700 font-semibold">
                      Phone <span className="text-rose-500">*</span>
                    </Label>
                    <Input
                      disabled={!isEditing}
                      value={formData.phone ?? ""}
                      onChange={(e) =>
                        setFormData({ ...formData, phone: e.target.value })
                      }
                      className="bg-slate-50 disabled:bg-slate-100"
                      placeholder="Contoh: 0812-3456-7890"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-700 font-semibold">
                      Address <span className="text-rose-500">*</span>
                    </Label>
                    <Textarea
                      disabled={!isEditing}
                      value={formData.address ?? ""}
                      onChange={(e) =>
                        setFormData({ ...formData, address: e.target.value })
                      }
                      className="bg-slate-50 disabled:bg-slate-100 min-h-[100px] resize-none"
                      placeholder="Alamat lengkap toko..."
                    />
                  </div>
                </div>

                {/* Logo Upload Section */}
                <div className="space-y-2">
                  <Label className="text-slate-700 font-semibold">
                    Company Logo (Optional)
                  </Label>
                  <div
                    className={`border-2 border-dashed rounded-xl p-4 flex flex-col items-center justify-center h-[240px] transition-colors ${isEditing ? "border-slate-300 hover:border-slate-400 bg-slate-50" : "border-slate-200 bg-slate-100/50"}`}
                  >
                    {formData.logoBase64 ? (
                      <div className="relative w-full h-full flex flex-col items-center justify-center">
                        <img
                          src={formData.logoBase64}
                          alt="Company Logo"
                          className="max-h-[160px] object-contain mb-3 drop-shadow-sm"
                        />
                        {isEditing && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => fileInputRef.current?.click()}
                            className="absolute bottom-0"
                          >
                            Ganti Logo
                          </Button>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center text-slate-400">
                        <ImageIcon className="w-12 h-12 mb-2 opacity-50" />
                        <span className="text-sm font-medium">
                          Logo Belum Diupload
                        </span>
                        {isEditing && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => fileInputRef.current?.click()}
                            className="mt-4"
                          >
                            <UploadCloud className="w-4 h-4 mr-2" /> Upload PNG
                            / JPG
                          </Button>
                        )}
                      </div>
                    )}
                    <input
                      type="file"
                      ref={fileInputRef}
                      className="hidden"
                      accept="image/png, image/jpeg"
                      onChange={handleFileChange}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Section B & C: Header & Footer Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="bg-slate-50/50 border-b border-slate-100">
                <CardTitle className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <Printer className="w-5 h-5 text-slate-500" /> Section B —
                  Receipt Header
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                <div className="space-y-2">
                  <Label className="text-slate-700">Header Line 1</Label>
                  <Input
                    disabled={!isEditing}
                    value={formData.receiptHeader1 ?? ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        receiptHeader1: e.target.value,
                      })
                    }
                    className="bg-slate-50"
                    placeholder="Teks tambahan atas struk..."
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-slate-700">Header Line 2</Label>
                  <Input
                    disabled={!isEditing}
                    value={formData.receiptHeader2 ?? ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        receiptHeader2: e.target.value,
                      })
                    }
                    className="bg-slate-50"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-slate-700">Header Line 3</Label>
                  <Input
                    disabled={!isEditing}
                    value={formData.receiptHeader3 ?? ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        receiptHeader3: e.target.value,
                      })
                    }
                    className="bg-slate-50"
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="bg-slate-50/50 border-b border-slate-100">
                <CardTitle className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <Printer className="w-5 h-5 text-slate-500" /> Section C —
                  Receipt Footer
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                <div className="space-y-2">
                  <Label className="text-slate-700">Footer Line 1</Label>
                  <Textarea
                    disabled={!isEditing}
                    value={formData.receiptFooter1 ?? ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        receiptFooter1: e.target.value,
                      })
                    }
                    className="bg-slate-50 resize-none"
                    placeholder="Teks penutup struk..."
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-slate-700">Footer Line 2</Label>
                  <Textarea
                    disabled={!isEditing}
                    value={formData.receiptFooter2 ?? ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        receiptFooter2: e.target.value,
                      })
                    }
                    className="bg-slate-50 resize-none"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-slate-700">Footer Line 3</Label>
                  <Textarea
                    disabled={!isEditing}
                    value={formData.receiptFooter3 ?? ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        receiptFooter3: e.target.value,
                      })
                    }
                    className="bg-slate-50 resize-none"
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Section D: Fixed Configuration */}
          <Card className="border-slate-200 shadow-sm bg-slate-900 text-white">
            <CardHeader className="border-b border-slate-800 py-4">
              <CardTitle className="text-md font-bold text-white">
                Section D — Fixed Config (Read Only)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <span className="text-xs text-slate-400 block mb-1">
                    Currency
                  </span>
                  <span className="text-sm font-bold text-emerald-400">
                    {originalData?.currency}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-slate-400 block mb-1">
                    Timezone
                  </span>
                  <span className="text-sm font-bold">
                    {originalData?.timezone}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-slate-400 block mb-1">
                    Decimals
                  </span>
                  <span className="text-sm font-bold">
                    Qty: {originalData?.quantityDecimal} | Prc:{" "}
                    {originalData?.priceDecimal}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-slate-400 block mb-1">
                    Language
                  </span>
                  <span className="text-sm font-bold">
                    {originalData?.language}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* KOLOM KANAN: Dual Live Preview (Thermal & PDF) */}
        <div className="xl:col-span-1 sticky top-6">
          <Card className="border-slate-200 shadow-md overflow-hidden bg-slate-200/50">
            {/* TOGGLE PREVIEW MODE */}
            <div className="bg-slate-800 p-2 flex gap-2">
              <button
                onClick={() => setPreviewMode("thermal")}
                className={`flex-1 py-2 px-3 rounded-md text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors ${previewMode === "thermal" ? "bg-white text-slate-900 shadow-sm" : "bg-slate-700 text-slate-300 hover:bg-slate-600"}`}
              >
                <Printer className="w-4 h-4" /> Struk Kasir
              </button>
              <button
                onClick={() => setPreviewMode("pdf")}
                className={`flex-1 py-2 px-3 rounded-md text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors ${previewMode === "pdf" ? "bg-white text-slate-900 shadow-sm" : "bg-slate-700 text-slate-300 hover:bg-slate-600"}`}
              >
                <FileText className="w-4 h-4" /> Dokumen PDF
              </button>
            </div>

            <CardContent className="p-6 flex justify-center bg-slate-300/30 min-h-[450px] items-center">
              {/* --- 1. SIMULASI STRUK THERMAL --- */}
              {previewMode === "thermal" && (
                <div className="w-full max-w-[300px] whitespace-pre-wrap rounded-sm border-t-4 border-slate-300 bg-white p-5 font-mono text-[12px] leading-tight text-slate-900 shadow-lg animate-in fade-in zoom-in-95 duration-200">
                  {/* Thermal Logo (Grayscale) */}
                  {formData.logoBase64 && (
                    <div className="flex justify-center mb-3">
                      <img
                        src={formData.logoBase64}
                        alt="Preview Logo"
                        className="max-h-16 grayscale contrast-150"
                      />
                    </div>
                  )}

                  {/* Thermal Profile */}
                  <div className="text-center font-bold text-[14px] mb-1">
                    {formData.companyName || "NAMA TOKO"}
                  </div>
                  <div className="text-center mb-1 max-w-[260px] mx-auto">
                    {formData.address || "Alamat Toko Belum Diisi"}
                  </div>
                  <div className="text-center mb-3">
                    Telp: {formData.phone || "000-0000"}
                  </div>

                  {/* Thermal Header Lines */}
                  {(formData.receiptHeader1 ||
                    formData.receiptHeader2 ||
                    formData.receiptHeader3) && (
                    <div className="text-center mb-3 border-t border-dashed border-slate-400 pt-2">
                      {formData.receiptHeader1 && (
                        <div>{formData.receiptHeader1}</div>
                      )}
                      {formData.receiptHeader2 && (
                        <div>{formData.receiptHeader2}</div>
                      )}
                      {formData.receiptHeader3 && (
                        <div>{formData.receiptHeader3}</div>
                      )}
                    </div>
                  )}

                  {/* Dummy Transaction */}
                  <div className="border-y border-slate-800 py-2 mb-2">
                    <div className="flex justify-between font-bold mb-1">
                      <span>Item</span>
                      <span>Total</span>
                    </div>
                    <div className="flex justify-between">
                      <span>1 ls Kopi Kapal Api</span>
                      <span>19.000</span>
                    </div>
                    <div className="flex justify-between">
                      <span>2 dus Indomie Goreng</span>
                      <span>206.000</span>
                    </div>
                  </div>
                  <div className="flex justify-between font-bold text-[14px] mb-4">
                    <span>GRAND TOTAL</span>
                    <span>225.000</span>
                  </div>

                  {/* Thermal Footer Lines */}
                  {(formData.receiptFooter1 ||
                    formData.receiptFooter2 ||
                    formData.receiptFooter3) && (
                    <div className="text-center border-t border-dashed border-slate-400 pt-3 mt-4 text-[11px]">
                      {formData.receiptFooter1 && (
                        <div>{formData.receiptFooter1}</div>
                      )}
                      {formData.receiptFooter2 && (
                        <div>{formData.receiptFooter2}</div>
                      )}
                      {formData.receiptFooter3 && (
                        <div>{formData.receiptFooter3}</div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* --- 2. SIMULASI KOP SURAT PDF (A4 Ratio) --- */}
              {previewMode === "pdf" && (
                <div className="relative flex aspect-[1/1.414] w-full max-w-[340px] flex-col border border-slate-200 bg-white p-4 shadow-md animate-in fade-in zoom-in-95 duration-200 sm:p-6">
                  {/* Kop Surat (Header Dokumen) */}
                  <div className="flex items-center gap-4 pb-4 border-b-2 border-slate-800">
                    {/* Logo PDF (Full Color) */}
                    {formData.logoBase64 ? (
                      <img
                        src={formData.logoBase64}
                        alt="Preview Logo"
                        className="w-16 h-16 object-contain shrink-0"
                      />
                    ) : (
                      <div className="w-16 h-16 bg-slate-100 flex items-center justify-center shrink-0 border border-slate-200">
                        <ImageIcon className="w-6 h-6 text-slate-300" />
                      </div>
                    )}

                    {/* Company Info */}
                    <div className="flex-1">
                      <h3 className="font-extrabold text-slate-900 text-[15px] leading-tight mb-1">
                        {formData.companyName || "NAMA TOKO"}
                      </h3>
                      <p className="text-[9px] text-slate-600 leading-snug">
                        {formData.address || "Alamat Toko Belum Diisi"}
                      </p>
                      <p className="text-[9px] text-slate-600 mt-0.5">
                        <span className="font-semibold">Telp:</span>{" "}
                        {formData.phone || "000-0000"}
                      </p>
                    </div>
                  </div>

                  {/* Dummy PDF Body */}
                  <div className="flex-1 mt-6">
                    <h4 className="font-bold text-slate-900 text-[10px] tracking-wider mb-2">
                      Kategori ROKOK
                    </h4>

                    {/* Simulasi Tabel PDF */}
                    <div className="w-full border-t border-b border-slate-900">
                      {/* Header Tabel */}
                      <div className="grid grid-cols-5 text-[8px] font-bold text-slate-900 border-b border-slate-900 py-1 px-1">
                        <span>Kategori</span>
                        <span>Nama Barang</span>
                        <span className="text-right">Harga Bal</span>
                        <span className="text-right">Harga Slof</span>
                        <span className="text-right">Harga Bungkus</span>
                      </div>

                      {/* Baris Data 1 */}
                      <div className="grid grid-cols-5 text-[8px] text-slate-800 py-1 px-1 border-b border-slate-200">
                        <span className="font-medium">Djarum</span>
                        <span>Djarum Coklat 12</span>
                        <span className="text-right">3.260.000</span>
                        <span className="text-right">163.000</span>
                        <span className="text-right">16.500</span>
                      </div>

                      {/* Baris Data 2 */}
                      <div className="grid grid-cols-5 text-[8px] text-slate-800 py-1 px-1 border-b border-slate-200">
                        <span className="font-medium">Djarum</span>
                        <span>Djarum Super 12</span>
                        <span className="text-right">4.560.000</span>
                        <span className="text-right">228.500</span>
                        <span className="text-right">23.000</span>
                      </div>

                      {/* Baris Data 3 */}
                      <div className="grid grid-cols-5 text-[8px] text-slate-800 py-1 px-1 border-b border-slate-200">
                        <span className="font-medium">Djarum</span>
                        <span>76 Apel</span>
                        <span className="text-right">2.885.000</span>
                        <span className="text-right">145.000</span>
                        <span className="text-right">14.700</span>
                      </div>

                      {/* Baris Data 4 */}
                      <div className="grid grid-cols-5 text-[8px] text-slate-800 py-1 px-1 border-b border-slate-200">
                        <span className="font-medium">Djarum</span>
                        <span>76 Apel Royale</span>
                        <span className="text-right">3.090.000</span>
                        <span className="text-right">155.000</span>
                        <span className="text-right">15.700</span>
                      </div>

                      {/* Baris Data 5 */}
                      <div className="grid grid-cols-5 text-[8px] text-slate-800 py-1 px-1">
                        <span className="font-medium">Djarum</span>
                        <span>JC Elit</span>
                        <span className="text-right text-slate-400">-</span>
                        <span className="text-right">164.000</span>
                        <span className="text-right">16.600</span>
                      </div>
                    </div>

                    {/* Dummy Footer Text / Disclaimer Specific to Document */}
                    <div className="mt-6 p-2 bg-slate-50 border border-slate-100 rounded-sm text-[7px] text-slate-500 italic">
                      * Harga yang tertera pada katalog ini dapat berubah
                      sewaktu-waktu sesuai dengan kebijakan harga grosir
                      terbaru.
                    </div>
                  </div>

                  {/* Watermark Logo Opacity Low */}
                  {formData.logoBase64 && (
                    <div className="absolute inset-0 flex items-center justify-center opacity-[0.03] pointer-events-none">
                      <img
                        src={formData.logoBase64}
                        alt="Watermark"
                        className="w-[200px] object-contain grayscale"
                      />
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Confirmation Dialog Cancel */}
      <AlertDialog open={showCancelAlert} onOpenChange={setShowCancelAlert}>
        <AlertDialogContent className="bg-white border border-slate-200 shadow-xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-slate-900">
              <AlertTriangle className="w-5 h-5 text-amber-500" /> Perubahan
              Belum Disimpan
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-600 font-medium mt-2">
              Anda memiliki perubahan System Configuration yang belum disimpan.
              Apakah Anda yakin ingin membuang (discard) perubahan ini?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4">
            <AlertDialogCancel className="border-slate-300 text-slate-700">
              Kembali Edit
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmCancel}
              className="bg-rose-600 text-white hover:bg-rose-700 border-0"
            >
              Ya, Buang Perubahan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
