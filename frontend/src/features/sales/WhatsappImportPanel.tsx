import { useEffect, useRef, useState } from "react";
import { MessageSquare, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { parseApiError } from "@/utils/error";
import { salesApi, type WhatsappImportRow } from "./sales.api";

export default function WhatsappImportPanel({
  customerId,
  onImported,
  disabled,
}: {
  customerId: string;
  onImported: (rows: WhatsappImportRow[], customerId: string) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const revision = useRef(0);
  useEffect(() => {
    const activeRevision = revision.current + 1;
    revision.current = activeRevision;
    return () => {
      revision.current = activeRevision + 1;
    };
  }, [customerId, disabled]);
  const parse = async () => {
    if (busy || disabled || !text.trim()) return;
    setBusy(true);
    setError("");
    const requestedRevision = revision.current;
    try {
      const result = await salesApi.importWhatsapp(
        text,
        customerId || undefined,
      );
      if (requestedRevision !== revision.current) {
        setError("Customer atau dokumen berubah. Periksa lalu import kembali.");
        return;
      }
      onImported(result.rows, customerId);
      setText("");
      setOpen(false);
    } catch (caught) {
      setError(parseApiError(caught));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mb-4">
      <Button
        variant="outline"
        size="sm"
        disabled={disabled || busy}
        onClick={() => setOpen(!open)}
        className="text-xs font-bold text-emerald-700 border-emerald-200"
      >
        <MessageSquare className="w-4 h-4 mr-1" />
        Import WhatsApp
      </Button>
      {disabled && (
        <span className="ml-2 text-[10px] text-slate-500">
          Import tersedia pada form tanpa referensi SO dan bukan saat menyimpan.
        </span>
      )}
      {open && (
        <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
          <p className="text-xs text-slate-600">
            Format: <b>jumlah satuan nama produk</b>, satu pesanan per baris.
            Pesan lama tetap dibantu; hasil yang belum pasti ditandai merah di
            tabel.
          </p>
          <textarea
            aria-label="Teks pesanan WhatsApp"
            value={text}
            onChange={(event) => setText(event.target.value)}
            disabled={busy}
            maxLength={20000}
            rows={6}
            placeholder={"3 bal jck\n5 pak magnum filter"}
            className="w-full rounded-lg border border-slate-300 bg-white p-3 text-sm resize-y"
          />
          <div role="alert" className="min-h-8 text-xs text-rose-600">
            {error}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[10px] text-slate-500">
              Maksimal 100 baris. Teks tidak disimpan. Item lama tidak ditimpa.
            </span>
            <Button
              disabled={busy || disabled || !text.trim()}
              onClick={() => void parse()}
              className="text-xs bg-emerald-700 text-white"
            >
              {busy && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
              Masukkan ke Daftar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
