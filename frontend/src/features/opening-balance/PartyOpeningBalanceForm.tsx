import { useEffect, useState } from "react";
import { CalendarDays, Landmark, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { FormattedNumberInput } from "@/components/ui/formatted-number-input";
import { openingBalanceApi } from "./openingBalance.api";
import { salesApi } from "@/features/sales/sales.api";
import { purchasingApi } from "@/features/purchasing/purchasing.api";

type Party = { id: string; name: string };

function today() { return new Date().toISOString().slice(0, 10); }
function errorMessage(reason: unknown) {
  const value = reason as { response?: { data?: { message?: string | string[] } }; message?: string };
  const message = value.response?.data?.message;
  return Array.isArray(message) ? message.join(" ") : message || value.message || "Data gagal disimpan.";
}

export default function PartyOpeningBalanceForm({ type }: { type: "CUSTOMER" | "SUPPLIER" }) {
  const [parties, setParties] = useState<Party[]>([]);
  const [partyId, setPartyId] = useState("");
  const [date, setDate] = useState(today());
  const [dueDate, setDueDate] = useState("");
  const [amount, setAmount] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void (type === "CUSTOMER" ? salesApi.customers() : purchasingApi.getSuppliers())
      .then((rows: unknown) => {
        if (!active) return;
        const list = Array.isArray(rows) ? rows : [];
        setParties(list.map((row) => {
          const item = row as Record<string, unknown>;
          return {
            id: String(item.customerId ?? item.supplierId ?? item.id ?? ""),
            name: String(item.customerName ?? item.supplierName ?? item.name ?? ""),
          };
        }).filter((item) => item.id && item.name));
      })
      .catch((reason) => setError(errorMessage(reason)))
      .finally(() => setLoading(false));
    return () => { active = false; };
  }, [type]);

  const submit = async () => {
    setError(""); setMessage("");
    if (!partyId || !date || Number(amount) <= 0) return setError(`${type === "CUSTOMER" ? "Customer" : "Supplier"}, tanggal, dan nominal wajib diisi.`);
    if (!window.confirm("Tetapkan saldo awal ini? Setelah dicatat, koreksi harus dilakukan melalui pembalikan agar jejak keuangan tetap aman.")) return;
    setSaving(true);
    try {
      const payload = {
        [type === "CUSTOMER" ? "customerId" : "supplierId"]: partyId,
        openingBalanceDate: date,
        dueDate: dueDate || undefined,
        amount: Number(amount),
        referenceNumber: referenceNumber || undefined,
        note: note || undefined,
      };
      if (type === "CUSTOMER") await openingBalanceApi.createCustomer(payload);
      else await openingBalanceApi.createSupplier(payload);
      setMessage("Saldo awal berhasil dicatat dan sudah muncul pada daftar outstanding.");
      setPartyId(""); setAmount(""); setDueDate(""); setReferenceNumber(""); setNote("");
    } catch (reason) { setError(errorMessage(reason)); }
    finally { setSaving(false); }
  };

  const partyLabel = type === "CUSTOMER" ? "Customer" : "Supplier";
  const title = type === "CUSTOMER" ? "Saldo Awal Piutang Customer" : "Saldo Awal Hutang Supplier";
  return <div className="mx-auto w-full max-w-4xl rounded-2xl border bg-white p-4 shadow-sm sm:p-6">
    <div className="mb-5 flex items-start gap-3"><div className="rounded-xl bg-blue-50 p-2 text-blue-700"><Landmark className="h-5 w-5" /></div><div><h2 className="text-base font-black text-slate-900 sm:text-lg">{title}</h2><p className="text-xs text-slate-500">Masukkan saldo lama tanpa membuat transaksi barang, stok, atau FIFO.</p></div></div>
    {message && <div className="mb-4 rounded-xl bg-emerald-50 p-3 text-xs font-bold text-emerald-700">{message}</div>}
    {error && <div className="mb-4 min-h-10 rounded-xl bg-red-50 p-3 text-xs font-bold text-red-700">{error}</div>}
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="text-xs font-bold text-slate-600 block mb-1">{partyLabel}</label>
        <SearchableSelect
          disabled={loading}
          value={partyId}
          onChange={setPartyId}
          placeholder={loading ? "Memuat..." : `Pilih ${partyLabel.toLowerCase()}...`}
          options={parties.map((item) => ({ value: item.id, label: item.name }))}
        />
      </div>
      <label className="text-xs font-bold text-slate-600">Tanggal Saldo Awal<div className="relative mt-1"><CalendarDays className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400"/><input type="date" value={date} onChange={(e)=>setDate(e.target.value)} className="h-10 w-full rounded-lg border pl-9 pr-3 text-sm"/></div></label>
      <label className="text-xs font-bold text-slate-600">Jatuh Tempo (Opsional)<input type="date" value={dueDate} onChange={(e)=>setDueDate(e.target.value)} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm"/></label>
      <label className="text-xs font-bold text-slate-600">
        Nominal
        <FormattedNumberInput
          value={Number(amount) || 0}
          onChange={(val) => setAmount(String(val))}
          placeholder="0"
          className="mt-1 h-10 w-full rounded-lg border px-3 text-sm font-bold"
        />
      </label>
      <label className="text-xs font-bold text-slate-600">Referensi Lama (Opsional)<input value={referenceNumber} onChange={(e)=>setReferenceNumber(e.target.value)} maxLength={100} placeholder="Nomor bon/faktur lama" className="mt-1 h-10 w-full rounded-lg border px-3 text-sm"/></label>
      <label className="text-xs font-bold text-slate-600 sm:col-span-2">Catatan (Opsional)<textarea value={note} onChange={(e)=>setNote(e.target.value)} maxLength={500} rows={3} className="mt-1 w-full rounded-lg border p-3 text-sm" placeholder="Keterangan saldo awal..."/></label>
    </div>
    <div className="mt-5 flex justify-end"><Button disabled={saving || loading} onClick={submit} className="bg-blue-700 text-white">{saving ? <Loader2 className="animate-spin"/> : <Save/>} Tetapkan Saldo Awal</Button></div>
  </div>;
}
