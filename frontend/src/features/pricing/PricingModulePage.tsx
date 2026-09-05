import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Store, FileText, UploadCloud, AlertTriangle } from "lucide-react";
import GuestPriceTab from "./components/GuestPriceTab";
import PriceBrochureTab from "./components/PriceBrochureTab";
import ImportProductTab from "./components/ImportProductTab";
import AliasListTab from "./components/AliasListTab";
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
import { hasPermission, useAuthStore } from "@/store/authStore";

type TabType = "guest" | "brochure" | "import" | "aliases";

export default function PricingModulePage() {
  const user = useAuthStore((state) => state.user);
  const canExport = hasPermission(user, "PRICING_EXPORT");
  const canAlias = hasPermission(user, "ALIAS_VIEW");
  const canImport =
    hasPermission(user, "MASTER_CREATE") &&
    hasPermission(user, "MASTER_UPDATE");
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab") as TabType | null;
  const activeTab: TabType = ["guest", "brochure", "import", "aliases"].includes(
    requestedTab ?? "",
  )
    ? requestedTab!
    : "guest";

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
        <h1 className="text-2xl font-extrabold text-slate-900">
          Pricing Workspace
        </h1>
        <p className="text-slate-500 font-medium text-sm">
          Pusat pengelolaan harga jual dasar, cetak brosur, dan import massal.
        </p>
      </div>

      <div className="flex border-b border-slate-200 mt-4 bg-white px-6 pt-4 rounded-t-xl shadow-sm overflow-x-auto custom-scrollbar shrink-0">
        {canExport && (
          <button
            onClick={() => handleTabClick("guest")}
            className={`flex items-center gap-2 pb-3 px-4 font-bold text-sm border-b-2 transition-colors whitespace-nowrap ${
              activeTab === "guest"
                ? "border-[#326dc8] text-[#326dc8]"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <Store className="w-4 h-4" /> Guest Suggested Price
          </button>
        )}
        {canImport && (
          <button
            onClick={() => handleTabClick("brochure")}
            className={`flex items-center gap-2 pb-3 px-4 font-bold text-sm border-b-2 transition-colors whitespace-nowrap ${
              activeTab === "brochure"
                ? "border-[#326dc8] text-[#326dc8]"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <FileText className="w-4 h-4" /> Publish Price Brochure
          </button>
        )}
        <button
          onClick={() => handleTabClick("import")}
          className={`flex items-center gap-2 pb-3 px-4 font-bold text-sm border-b-2 transition-colors whitespace-nowrap ${
            activeTab === "import"
              ? "border-[#326dc8] text-[#326dc8]"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <UploadCloud className="w-4 h-4" /> Import Data & Harga
        </button>
        {canAlias && (
          <button
            onClick={() => handleTabClick("aliases")}
            className={`flex items-center gap-2 pb-3 px-4 font-bold text-sm border-b-2 whitespace-nowrap ${activeTab === "aliases" ? "border-blue-700 text-blue-700" : "border-transparent text-slate-500"}`}
          >
            Daftar Alias
          </button>
        )}
      </div>

      <div className="flex-1 flex flex-col pt-4 overflow-hidden">
        {activeTab === "aliases" &&
          (canAlias ? (
            <AliasListTab />
          ) : (
            <p className="p-6 text-sm">
              Permission untuk daftar alias belum diberikan.
            </p>
          ))}
        {activeTab === "guest" && (
          <GuestPriceTab onUnsavedChanges={setHasUnsavedChanges} />
        )}
        {activeTab === "brochure" && canExport && <PriceBrochureTab />}
        {activeTab === "import" && canImport && <ImportProductTab />}
        {((activeTab === "brochure" && !canExport) ||
          (activeTab === "import" && !canImport)) && (
          <div className="rounded-xl border border-amber-200 bg-white p-8 text-sm text-slate-600">
            Permission untuk fitur ini belum diberikan.
          </div>
        )}
      </div>

      <AlertDialog
        open={!!pendingTab}
        onOpenChange={(open) => !open && setPendingTab(null)}
      >
        <AlertDialogContent className="bg-white border-amber-200 shadow-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-amber-600 font-extrabold">
              <AlertTriangle className="w-5 h-5" /> Perubahan Belum Disimpan
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-700 font-medium pt-2">
              Anda memiliki perubahan harga yang belum disimpan. Jika Anda
              berpindah tab sekarang, <b>semua perubahan akan dibuang</b>.
              <br />
              <br />
              Apakah Anda yakin ingin membuang perubahan tersebut?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4">
            <AlertDialogCancel className="font-bold border-slate-300 text-slate-700 hover:bg-slate-50">
              Kembali
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDiscardChanges}
              className="bg-rose-600 hover:bg-rose-700 text-white font-bold border-0 shadow-md"
            >
              Ya, Buang Perubahan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
