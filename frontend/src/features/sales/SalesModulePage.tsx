import { useEffect, useState } from "react";
import {
  ChevronDown,
  FilePlus2,
  ListChecks,
  ShoppingCart,
  Users,
  WalletCards,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSearchParams } from "react-router-dom";
import { hasPermission, useAuthStore } from "@/store/authStore";
import CustomerListPage from "./customer/CustomerListPage";
import SalesDocumentForm from "./SalesDocumentForm";
import SalesDocumentList from "./SalesDocumentList";
import CustomerOutstandingPage from "./CustomerOutstandingPage";

type Tab = "sales" | "transaction" | "customers" | "outstanding";

export default function SalesModulePage() {
  const [params, setParams] = useSearchParams();
  const user = useAuthStore((state) => state.user);
  const activeTab = (params.get("tab") as Tab) || "sales";
  const kind = params.get("kind") === "so" ? "SO" : "SI";
  const editingId = params.get("editId");
  const [version, setVersion] = useState(0);
  const [message, setMessage] = useState("");
  const canCreate = hasPermission(user, "SALES_CREATE");
  const canUpdate = hasPermission(user, "SALES_UPDATE");
  const canApprove = hasPermission(user, "SALES_APPROVE");
  const canReceivePayment = hasPermission(user, "SALES_RECEIVE_PAYMENT");
  const canViewOutstanding = hasPermission(user, "CUSTOMER_FINANCIAL_VIEW");
  const canReturn = hasPermission(user, "SALES_RETURN_CREATE");

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(""), 3500);
    return () => window.clearTimeout(timer);
  }, [message]);

  const openTransaction = (documentKind: "SO" | "SI", id?: string) => {
    const next: Record<string, string> = {
      tab: "transaction",
      kind: documentKind.toLowerCase(),
    };
    if (id) next.editId = id;
    setParams(next);
  };
  const showSuccess = (text: string) => {
    setMessage(text);
    setVersion((value) => value + 1);
    setParams({ tab: "sales" });
  };

  return (
    <div className="flex min-h-full flex-col bg-slate-50 p-3 sm:p-6">
      {message && (
        <div className="fixed right-4 top-4 z-[100] rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white shadow-xl">
          {message}
        </div>
      )}
      <div className="mb-3">
        <h1 className="text-xl font-black text-slate-900 sm:text-2xl">
          Sales &amp; Customer Workspace
        </h1>
        <p className="mt-1 text-xs text-slate-500 sm:text-sm">
          Pesanan, penjualan, reservasi stok, pembayaran, dan histori pelanggan
          dalam satu alur.
        </p>
      </div>
      <div className="mb-4 flex shrink-0 items-center gap-1 overflow-x-auto rounded-t-xl border-b bg-white px-2 pt-3 shadow-sm sm:px-4">
        <Nav
          active={activeTab === "sales"}
          onClick={() => setParams({ tab: "sales" })}
          icon={<ListChecks className="h-4 w-4 text-emerald-500" />}
          label="Sales List & Monitoring"
        />
        {canCreate && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-3 pb-3 text-xs font-bold transition sm:px-4 sm:text-sm ${activeTab === "transaction" ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}
              >
                <FilePlus2 className="h-4 w-4 text-amber-500" />
                Buat Transaksi (
                {kind === "SO" ? "Sales Order" : "Sales Invoice"})
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="w-56 bg-white border-slate-200 shadow-xl p-1"
            >
              <DropdownMenuItem
                onClick={() => openTransaction("SO")}
                className="text-xs font-bold cursor-pointer p-2"
              >
                <FilePlus2 className="h-4 w-4 text-amber-500" />
                Sales Order (SO)
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => openTransaction("SI")}
                className="text-xs font-bold cursor-pointer p-2"
              >
                <ShoppingCart className="h-4 w-4 text-blue-600" />
                Sales Invoice (SI)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <Nav
          active={activeTab === "customers"}
          onClick={() => setParams({ tab: "customers" })}
          icon={<Users className="h-4 w-4" />}
          label="Direktori Customer"
        />
        {canViewOutstanding && <Nav
          active={activeTab === "outstanding"}
          onClick={() => setParams({ tab: "outstanding" })}
          icon={<WalletCards className="h-4 w-4 text-rose-500" />}
          label="Piutang Customer"
        />}
      </div>
      <div className="min-h-0 flex-1">
        {activeTab === "sales" && (
          <SalesDocumentList
            version={version}
            canUpdate={canUpdate}
            canApprove={canApprove}
            canReceivePayment={canReceivePayment}
            canReturn={canReturn}
            onEdit={(documentKind, id) => openTransaction(documentKind, id)}
            onChanged={showSuccess}
          />
        )}
        {activeTab === "transaction" && (editingId ? canUpdate : canCreate) && (
          <SalesDocumentForm
            key={`${kind}:${editingId ?? "new"}`}
            kind={kind}
            editingId={editingId}
            canApprove={canApprove}
            onSuccess={showSuccess}
            onCancel={() => setParams({ tab: "sales" })}
          />
        )}
        {activeTab === "transaction" &&
          !(editingId ? canUpdate : canCreate) && (
            <div className="rounded-xl border border-amber-200 bg-white p-8 text-sm text-slate-600">
              Permission untuk transaksi ini belum diberikan.
            </div>
          )}
        {activeTab === "customers" && <CustomerListPage />}
        {activeTab === "outstanding" && canViewOutstanding && (
          <CustomerOutstandingPage canPay={canReceivePayment} canReturn={canReturn} />
        )}
      </div>
    </div>
  );
}

function Nav({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-3 pb-3 text-xs font-black transition sm:px-4 sm:text-sm ${active ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}
    >
      {icon}
      {label}
    </button>
  );
}
