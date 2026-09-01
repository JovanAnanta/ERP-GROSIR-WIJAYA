import { ClipboardCheck, History, Repeat2, SlidersHorizontal } from 'lucide-react';

export type InventorySection = 'MOVEMENTS' | 'TRANSFORMATION' | 'ADJUSTMENT' | 'OPNAME';

const sections: Array<{ value: InventorySection; label: string; icon: typeof History }> = [
  { value: 'MOVEMENTS', label: 'Histori Stok', icon: History },
  { value: 'TRANSFORMATION', label: 'Transformation', icon: Repeat2 },
  { value: 'ADJUSTMENT', label: 'Stock Adjustment', icon: SlidersHorizontal },
  { value: 'OPNAME', label: 'Stock Opname', icon: ClipboardCheck },
];

export default function InventorySectionNav({ current, onChange }: { current: InventorySection; onChange: (section: InventorySection) => void }) {
  return <div className="grid grid-cols-2 gap-1 rounded-xl border bg-white p-1.5 shadow-sm sm:flex sm:flex-wrap">
    {sections.map(({ value, label, icon: Icon }) => <button key={value} onClick={() => onChange(value)} className={`flex min-h-9 items-center justify-center rounded-lg px-2 py-2 text-[11px] font-bold transition sm:px-4 sm:text-xs ${current === value ? 'bg-blue-50 text-blue-700 shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}><Icon className="mr-1.5 h-3.5 w-3.5 shrink-0"/>{label}</button>)}
  </div>;
}
