import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { hasPermission, useAuthStore } from "@/store/authStore";
import { parseApiError } from "@/utils/error";
import {
  aliasApi,
  type AliasKind,
  type AliasPage,
  type AliasRow,
  type AliasTarget,
} from "../alias.api";

export default function AliasListTab() {
  const user = useAuthStore((state) => state.user);
  const canManage = hasPermission(user, "ALIAS_MANAGE");
  const [kind, setKind] = useState<AliasKind>("PRODUCT");
  const [filter, setFilter] = useState<AliasTarget | null>(null);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [version, setVersion] = useState(0);
  const [data, setData] = useState<AliasPage>({
    rows: [],
    total: 0,
    page: 1,
    limit: 20,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [editor, setEditor] = useState<{ row: AliasRow | null } | null>(null);
  const [deleting, setDeleting] = useState<AliasRow | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [deletingBusy, setDeletingBusy] = useState(false);
  const label = kind === "PRODUCT" ? "Produk" : "Satuan";
  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError("");
      void aliasApi
        .list({ kind, search: "", targetId: filter?.id, page, limit })
        .then((result) => {
          if (!active) return;
          const pages = Math.max(1, Math.ceil(result.total / limit));
          if (page > pages) setPage(pages);
          else setData(result);
        })
        .catch((caught) => {
          if (active) setError(parseApiError(caught));
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [kind, filter, page, limit, version]);
  const changed = () => {
    setEditor(null);
    setVersion((value) => value + 1);
  };
  const remove = async () => {
    if (!deleting || deletingBusy) return;
    setDeletingBusy(true);
    setDeleteError("");
    try {
      await aliasApi.remove(kind, deleting);
      setDeleting(null);
      setVersion((value) => value + 1);
    } catch (caught) {
      setDeleteError(parseApiError(caught));
    } finally {
      setDeletingBusy(false);
    }
  };
  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-3 sm:p-5 space-y-4">
      <div className="flex flex-wrap justify-between gap-3 items-center">
        <div>
          <h2 className="text-base font-black text-slate-800">Daftar Alias</h2>
          <p className="text-xs text-slate-500">
            Nama panggilan produk dan satuan untuk membaca pesanan WhatsApp.
          </p>
        </div>
        {canManage && (
          <Button
            onClick={() => setEditor({ row: null })}
            className="bg-blue-700 text-white text-xs font-bold"
          >
            <Plus className="w-4 h-4 mr-1" />
            Tambah Alias {label}
          </Button>
        )}
      </div>
      <div className="flex gap-2 border-b">
        {(["PRODUCT", "UNIT"] as const).map((value) => (
          <button
            key={value}
            onClick={() => {
              setKind(value);
              setFilter(null);
              setPage(1);
            }}
            className={
              "px-4 py-2 text-xs font-bold border-b-2 " +
              (kind === value
                ? "text-blue-700 border-blue-700"
                : "border-transparent text-slate-500")
            }
          >
            Alias {value === "PRODUCT" ? "Produk" : "Satuan"}
          </button>
        ))}
      </div>
      <div className="max-w-xl">
        <TargetPicker
          key={kind}
          kind={kind}
          value={filter}
          onChange={(value) => {
            setFilter(value);
            setPage(1);
          }}
          placeholder={"Pilih " + label.toLowerCase() + " untuk menampilkan alias"}
        />
      </div>
      <div
        className="min-h-6 text-xs text-rose-600"
        role={error ? "alert" : undefined}
      >
        {error ||
          (loading ? (
            <span className="text-slate-500 flex gap-2">
              <Loader2 className="w-3 h-3 animate-spin" />
              Memuat daftar...
            </span>
          ) : (
            `${data.total} alias`
          ))}
      </div>
      <div
        className={
          "overflow-auto rounded-lg border border-slate-200 min-h-40 " +
          (loading ? "opacity-60" : "")
        }
        aria-busy={loading}
      >
        <table className="w-full min-w-[480px] text-xs text-left">
          <thead className="bg-slate-50 text-slate-500 uppercase text-[10px]">
            <tr>
              <th className="p-3">{label}</th>
              <th className="p-3">Alias</th>
              <th className="p-3 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.rows.map((row) => (
              <tr key={row.id} className="hover:bg-slate-50">
                <td className="p-3 font-bold text-slate-700">
                  {row.targetName}
                  {!row.isActive && (
                    <span className="ml-2 text-[10px] text-rose-600">
                      Nonaktif
                    </span>
                  )}
                </td>
                <td className="p-3">{row.aliasName}</td>
                <td className="p-2 text-right whitespace-nowrap">
                  {canManage && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={"Edit alias " + row.aliasName}
                        onClick={() => setEditor({ row })}
                      >
                        <Pencil className="w-3.5 h-3.5 text-blue-600" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={"Hapus alias " + row.aliasName}
                        onClick={() => {
                          setDeleting(row);
                          setDeleteError("");
                        }}
                      >
                        <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                      </Button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {!loading && !data.rows.length && (
              <tr>
                <td colSpan={3} className="p-8 text-center text-slate-400">
                  Belum ada alias yang sesuai.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <label>
          Tampilkan{" "}
          <select
            aria-label="Jumlah alias per halaman"
            value={limit}
            onChange={(event) => {
              setLimit(Number(event.target.value));
              setPage(1);
            }}
            className="border rounded p-1 mx-1 bg-white"
          >
            {[20, 30, 50, 100].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>{" "}
          per halaman
        </label>
        <div className="flex gap-2 items-center">
          <Button
            variant="outline"
            size="sm"
            disabled={loading || page <= 1}
            onClick={() => setPage(page - 1)}
          >
            Sebelumnya
          </Button>
          <span>
            {page} / {Math.max(1, Math.ceil(data.total / limit))}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={loading || page >= Math.ceil(data.total / limit)}
            onClick={() => setPage(page + 1)}
          >
            Berikutnya
          </Button>
        </div>
      </div>
      {editor && (
        <AliasEditor
          kind={kind}
          row={editor.row}
          initialTarget={filter}
          onClose={() => setEditor(null)}
          onSaved={changed}
        />
      )}
      <Dialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open && !deletingBusy) setDeleting(null);
        }}
      >
        <DialogContent className="bg-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Hapus alias?</DialogTitle>
            <DialogDescription>
              Alias “{deleting?.aliasName}” tidak lagi digunakan untuk membaca
              pesanan baru. Dokumen lama tidak berubah.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-8 text-xs text-rose-600" role="alert">
            {deleteError}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={deletingBusy}
              onClick={() => setDeleting(null)}
            >
              Batal
            </Button>
            <Button
              className="bg-rose-600 text-white"
              disabled={deletingBusy}
              onClick={() => void remove()}
            >
              Hapus Alias
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function TargetPicker({
  kind,
  value,
  onChange,
  placeholder,
}: {
  kind: AliasKind;
  value: AliasTarget | null;
  onChange: (value: AliasTarget | null) => void;
  placeholder: string;
}) {
  const [search, setSearch] = useState("");
  const [options, setOptions] = useState<AliasTarget[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      void aliasApi
        .targets(kind, search)
        .then((rows) => {
          if (active) {
            setOptions(rows);
            setError("");
          }
        })
        .catch((caught) => {
          if (active) setError(parseApiError(caught));
        });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [kind, search]);
  const all =
    value && !options.some((item) => item.id === value.id)
      ? [value, ...options]
      : options;
  return (
    <div>
      <label className="text-[10px] font-bold text-slate-500">
        {kind === "PRODUCT" ? "PRODUK" : "SATUAN"}
        <Input
          value={search}
          maxLength={100}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Cari nama untuk mempersempit pilihan..."
          className="text-xs mt-1"
        />
      </label>
      <select
        aria-label={placeholder}
        value={value?.id ?? ""}
        onChange={(event) =>
          onChange(all.find((item) => item.id === event.target.value) ?? null)
        }
        className="mt-1 h-8 border border-slate-300 rounded-lg w-full text-xs px-2 bg-white"
      >
        <option value="">{placeholder}</option>
        {all.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div>
  );
}

function AliasEditor({
  kind,
  row,
  initialTarget,
  onClose,
  onSaved,
}: {
  kind: AliasKind;
  row: AliasRow | null;
  initialTarget: AliasTarget | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [target, setTarget] = useState<AliasTarget | null>(
    row ? { id: row.targetId, name: row.targetName } : initialTarget,
  );
  const [text, setText] = useState(row?.aliasName ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const save = async () => {
    if (busy) return;
    const names = text
      .split(/\r?\n/)
      .map((value) => value.trim())
      .filter(Boolean);
    if (!target || !names.length) {
      setError("Pilih produk/satuan dan isi alias.");
      return;
    }
    if (row && names.length !== 1) {
      setError("Edit satu alias saja.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (row) await aliasApi.update(kind, row, names[0]);
      else await aliasApi.create(kind, target.id, names);
      onSaved();
    } catch (caught) {
      setError(parseApiError(caught));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent className="bg-white w-[calc(100vw-2rem)] sm:max-w-xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {row ? "Edit" : "Tambah"} Alias{" "}
            {kind === "PRODUCT" ? "Produk" : "Satuan"}
          </DialogTitle>
          <DialogDescription>
            Huruf besar/kecil dianggap sama. Nama resmi tidak perlu dibuatkan
            alias.
          </DialogDescription>
        </DialogHeader>
        {row ? (
          <Input
            value={target?.name ?? ""}
            disabled
            aria-label="Nama produk atau satuan"
          />
        ) : (
          <TargetPicker
            kind={kind}
            value={target}
            onChange={setTarget}
            placeholder={
              kind === "PRODUCT" ? "Pilih produk..." : "Pilih satuan..."
            }
          />
        )}
        <label className="text-xs font-bold text-slate-600">
          {row ? "Alias" : "Alias — satu alias per baris"}
          <textarea
            value={text}
            maxLength={13000}
            onChange={(event) => setText(event.target.value)}
            rows={row ? 2 : 5}
            placeholder={kind === "PRODUCT" ? "Contoh: ka mix" : "Contoh: lsn"}
            className="mt-1 w-full resize-y border border-slate-300 rounded-lg p-3 text-sm font-normal"
          />
        </label>
        <div className="min-h-10 text-xs text-rose-600" role="alert">
          {error}
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            Batal
          </Button>
          <Button
            disabled={busy}
            onClick={() => void save()}
            className="bg-blue-700 text-white"
          >
            {busy ? "Menyimpan..." : "Simpan Alias"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
