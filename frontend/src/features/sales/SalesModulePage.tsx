import { useSearchParams } from "react-router-dom";
import CustomerListPage from "./customer/CustomerListPage";
import { ShoppingCart, Users } from "lucide-react";

export default function SalesModulePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  
  // Mengambil state tab dari URL agar aman saat di-refresh (F5)
  const activeTab = searchParams.get("tab") || "sales";

  const switchTab = (tab: "sales" | "customers") => {
    setSearchParams({ tab });
  };

  return (
    <div className="p-6 bg-slate-50 min-h-full flex flex-col">
      {/* Tab Navigation Header */}
      <div className="mb-6 flex overflow-x-auto rounded-t-xl border-b border-slate-200 bg-white px-2 pt-4 shadow-sm sm:px-6">
        <button
          onClick={() => switchTab("sales")}
          className={`flex items-center gap-2 whitespace-nowrap pb-3 px-4 font-bold text-sm border-b-2 transition-colors ${
            activeTab === "sales"
              ? "border-[#326dc8] text-[#326dc8]"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <ShoppingCart className="w-4 h-4" /> Transaksi Penjualan (Sales)
        </button>
        <button
          onClick={() => switchTab("customers")}
          className={`flex items-center gap-2 whitespace-nowrap pb-3 px-4 font-bold text-sm border-b-2 transition-colors ${
            activeTab === "customers"
              ? "border-[#326dc8] text-[#326dc8]"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <Users className="w-4 h-4" /> Direktori Pelanggan (Customer)
        </button>
      </div>

      {/* Dynamic Content Berdasarkan Tab URL */}
      <div className="flex-1 flex flex-col">
        {activeTab === "sales" && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center">
            <h3 className="text-lg font-bold text-slate-800 mb-2">Modul Transaksi Sales</h3>
            <p className="text-slate-500 text-sm">Halaman pembuatan Sales Order & Kasir akan segera kita bangun di tahap berikutnya.</p>
          </div>
        )}

        {activeTab === "customers" && <CustomerListPage />}
      </div>
    </div>
  );
}
