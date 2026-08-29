import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import SupplierListPage from "./supplier/SupplierListPage";
import { Users, FileCheck, FileText, ChevronDown, ListOrdered } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import CreatePurchaseOrderTab from "./components/CreatePurchaseOrderTab";
import CreatePurchaseInvoiceTab from "./components/CreatePurchaseInvoiceTab";
import PurchaseInvoiceCardList from "./components/PurchaseInvoiceCardList";
import PurchaseOrderCardList from "./components/PurchaseOrderCardList";

type TabType = "purchases" | "transactions" | "suppliers";
type TransactionSubtype = "po" | "pi";

export default function PurchasingModulePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [purchaseListVersion, setPurchaseListVersion] = useState(0);
  
  const activeTab = (searchParams.get("tab") as TabType) || "purchases";
  const subType = (searchParams.get("sub") as TransactionSubtype) || "po";
  const editInvoiceId = searchParams.get("editId");
  const editOrderId = searchParams.get("editPoId");

  const setActiveTab = (tab: TabType, sub?: TransactionSubtype) => {
    const params: Record<string, string> = { tab };
    if (tab === "transactions") {
      params.sub = sub || subType;
    }
    setSearchParams(params);
  };

  return (
    <div className="p-6 bg-slate-50 min-h-full flex flex-col">
      <div className="mb-2">
        <h1 className="text-2xl font-extrabold text-slate-900">Purchasing Workspace</h1>
        <p className="text-slate-500 font-medium text-sm">Pusat monitoring tagihan supplier, pembuatan pesanan (PO), penerimaan faktur (A/P), dan direktori.</p>
      </div>

      <div className="flex border-b border-slate-200 mt-4 bg-white px-4 pt-3 rounded-t-xl shadow-sm shrink-0 overflow-visible items-center gap-2">
        
        <button
          onClick={() => setSearchParams({ tab: "purchases" })}
          className={`flex items-center gap-2 pb-3 px-4 font-bold text-sm border-b-2 transition-colors whitespace-nowrap ${
            activeTab === "purchases" ? "border-[#326dc8] text-[#326dc8]" : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <ListOrdered className="w-4 h-4 text-emerald-600" /> Purchase List & Monitoring
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              onClick={() => setActiveTab("transactions", subType)}
              className={`flex items-center gap-2 pb-3 px-4 font-bold text-sm border-b-2 transition-colors whitespace-nowrap outline-none ${
                activeTab === "transactions" ? "border-[#326dc8] text-[#326dc8]" : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              {subType === "po" ? (
                <FileCheck className="w-4 h-4 text-amber-500" />
              ) : (
                <FileText className="w-4 h-4 text-[#00509e]" />
              )}
              <span>Buat Transaksi ({subType === "po" ? "Purchase Order" : "Purchase Invoice"})</span>
              <ChevronDown className="w-3.5 h-3.5 ml-1 text-slate-400" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56 bg-white z-50 border border-slate-200 shadow-xl p-1">
            <DropdownMenuItem 
              onClick={() => setActiveTab("transactions", "po")}
              className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer p-2 hover:bg-slate-100 rounded"
            >
              <FileCheck className="w-4 h-4 text-amber-500" />
              <span>Purchase Order (PO)</span>
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => setActiveTab("transactions", "pi")}
              className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer p-2 hover:bg-slate-100 rounded"
            >
              <FileText className="w-4 h-4 text-[#00509e]" />
              <span>Purchase Invoice (PI)</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <button
          onClick={() => setSearchParams({ tab: "suppliers" })}
          className={`flex items-center gap-2 pb-3 px-4 font-bold text-sm border-b-2 transition-colors whitespace-nowrap ${
            activeTab === "suppliers" ? "border-[#326dc8] text-[#326dc8]" : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <Users className="w-4 h-4" /> Direktori Supplier
        </button>
      </div>

      <div className="flex-1 pt-4 overflow-hidden flex flex-col">
        <div className={`flex-1 flex-col overflow-y-auto custom-scrollbar ${activeTab === "purchases" ? "flex" : "hidden"}`}>
          <div className="space-y-4 pb-2">
            <PurchaseOrderCardList key={`po-${purchaseListVersion}`} onEditOrder={(poId) => {
              setSearchParams({ tab: "transactions", sub: "po", editPoId: poId });
            }} />
            <div className="min-h-[650px]">
              <PurchaseInvoiceCardList key={`pi-${purchaseListVersion}`} onEditInvoice={(invId) => {
                setSearchParams({ tab: "transactions", sub: "pi", editId: invId });
              }} />
            </div>
          </div>
        </div>

        <div className={`flex-1 flex-col ${activeTab === "transactions" && subType === "po" ? "flex" : "hidden"}`}>
          <CreatePurchaseOrderTab
            editingOrderId={editOrderId}
            onSuccess={() => {
              setPurchaseListVersion((value) => value + 1);
              alert(editOrderId ? "Purchase Order berhasil diperbarui!" : "Purchase Order berhasil disimpan!");
              setSearchParams({ tab: "purchases" });
            }}
            onCancelEdit={() => setSearchParams({ tab: "purchases" })}
          />
        </div>

        <div className={`flex-1 flex-col ${activeTab === "transactions" && subType === "pi" ? "flex" : "hidden"}`}>
          <CreatePurchaseInvoiceTab 
            editingInvoiceId={editInvoiceId}
            onSuccess={() => {
              setPurchaseListVersion((value) => value + 1);
              alert(editInvoiceId ? "Draft Purchase Invoice berhasil diperbarui & diproses!" : "Faktur Pembelian berhasil diproses!");
              // Kembali ke list setelah sukses edit/post
              setSearchParams({ tab: "purchases" });
            }} 
            onCancelEdit={() => {
              setSearchParams({ tab: "purchases" });
            }}
          />
        </div>

        <div className={`flex-1 flex-col ${activeTab === "suppliers" ? "flex" : "hidden"}`}>
          <SupplierListPage />
        </div>
      </div>
    </div>
  );
}
