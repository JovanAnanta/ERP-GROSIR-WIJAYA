import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Store, FileText, UploadCloud, AlertTriangle } from "lucide-react";
import GuestPriceTab from "./components/GuestPriceTab";
import PriceBrochureTab from "./components/PriceBrochureTab";
import ImportProductTab from "./components/ImportProductTab";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

type TabType = "guest" | "brochure" | "import";

export default function PricingModulePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  // Membaca tab dari URL (?tab=...), default ke "guest" jika kosong
  const activeTab = (searchParams.get("tab") as TabType) || "guest";
  
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [pendingTab, setPendingTab] = useState<TabType | null>(null);

  const handleTabClick = (tab: TabType) => {
    if (tab === activeTab) return;
    if (hasUnsavedChanges) {
      setPendingTab(tab); 
    } else {
      setSearchParams({ tab });
    }
  };

  const confirmDiscardChanges = () => {
    if (pendingTab) {
      setHasUnsavedChanges(false);
      setSearchParams({ tab: pendingTab });
      setPendingTab(null);
    }
  };

  return (
    <div className="p-6 bg-slate-50 min-h-full flex flex-col">
      <div className="mb-2">
        <h1 className="text-2xl font-extrabold text-slate-900">Pricing Workspace</h1>
        <p className="text-slate-500 font-medium text-sm">Pusat pengelolaan harga jual dasar, cetak brosur, dan import massal.</p>
      </div>

      <div className="flex border-b border-slate-200 mt-4 bg-white px-6 pt-4 rounded-t-xl shadow-sm overflow-x-auto custom-scrollbar shrink-0">
        <button
          onClick={() => handleTabClick("guest")}
          className={`flex items-center gap-2 pb-3 px-4 font-bold text-sm border-b-2 transition-colors whitespace-nowrap ${
            activeTab === "guest" ? "border-[#326dc8] text-[#326dc8]" : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <Store className="w-4 h-4" /> Guest Suggested Price
        </button>
        <button
          onClick={() => handleTabClick("brochure")}
          className={`flex items-center gap-2 pb-3 px-4 font-bold text-sm border-b-2 transition-colors whitespace-nowrap ${
            activeTab === "brochure" ? "border-[#326dc8] text-[#326dc8]" : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <FileText className="w-4 h-4" /> Publish Price Brochure
        </button>
        <button
          onClick={() => handleTabClick("import")}
          className={`flex items-center gap-2 pb-3 px-4 font-bold text-sm border-b-2 transition-colors whitespace-nowrap ${
            activeTab === "import" ? "border-[#326dc8] text-[#326dc8]" : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <UploadCloud className="w-4 h-4" /> Import Data & Harga
        </button>
      </div>

      <div className="flex-1 flex flex-col pt-4 overflow-hidden">
        {activeTab === "guest" && <GuestPriceTab onUnsavedChanges={setHasUnsavedChanges} />}
        {activeTab === "brochure" && <PriceBrochureTab />}
        {activeTab === "import" && <ImportProductTab />}
      </div>

      <AlertDialog open={!!pendingTab} onOpenChange={(open) => !open && setPendingTab(null)}>
        <AlertDialogContent className="bg-white border-amber-200 shadow-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-amber-600 font-extrabold">
              <AlertTriangle className="w-5 h-5" /> Perubahan Belum Disimpan
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-700 font-medium pt-2">
              Anda memiliki perubahan harga yang belum disimpan. Jika Anda berpindah tab sekarang, <b>semua perubahan akan dibuang</b>.
              <br/><br/>Apakah Anda yakin ingin membuang perubahan tersebut?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4">
            <AlertDialogCancel className="font-bold border-slate-300 text-slate-700 hover:bg-slate-50">Kembali</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDiscardChanges} className="bg-rose-600 hover:bg-rose-700 text-white font-bold border-0 shadow-md">
              Ya, Buang Perubahan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}