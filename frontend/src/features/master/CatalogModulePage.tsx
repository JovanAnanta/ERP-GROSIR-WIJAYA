import { useSearchParams } from "react-router-dom";
import ProductListPage from "./product/ProductListPage";
import CategoryListPage from "./category/CategoryListPage";
import UnitListPage from "./unit/UnitListPage";
import BrandListPage from "./brand/BrandListPage";
import { Package, Tags, Scale, Layers } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";

export default function CatalogModulePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = searchParams.get("tab") || "products";

  const switchTab = (tab: "products" | "categories" | "units" | "brands") => {
    setSearchParams({ tab });
  };

  // Cek apakah tab aktif termasuk dalam kategori data pendukung
  const isSupportTab = ["categories", "units", "brands"].includes(currentTab);
  const supportSelectValue = isSupportTab ? currentTab : "";

  const handleSupportSelectChange = (val: string | null) => {
    if (val) {
      setSearchParams({ tab: val });
    }
  };

  return (
    <div className="p-6 bg-slate-50 min-h-full flex flex-col">
      {/* Header Navigasi Berjejer Seperti Semula + Dropdown untuk Kategori/Satuan/Brand */}
      <div className="flex border-b border-slate-200 mb-6 bg-white px-6 pt-4 rounded-t-xl shadow-sm overflow-x-auto custom-scrollbar items-center gap-2">
        {/* Tab 1: Master Produk */}
        <button
          onClick={() => switchTab("products")}
          className={`flex items-center gap-2 pb-3 px-4 font-bold text-sm border-b-2 transition-colors whitespace-nowrap ${
            currentTab === "products"
              ? "border-[#326dc8] text-[#326dc8]"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <Package className="w-4 h-4" /> Master Produk
        </button>

        {/* Tab Kategori, Satuan, dan Brand disatukan dalam bentuk Dropdown ke bawah saat diklik */}
        <div className="pb-2">
          <Select value={supportSelectValue} onValueChange={handleSupportSelectChange}>
            <SelectTrigger 
              className={`border-b-2 rounded-none border-t-0 border-x-0 shadow-none px-4 py-2 font-bold text-sm h-auto bg-transparent gap-2 focus:ring-0 ${
                isSupportTab
                  ? "border-[#326dc8] text-[#326dc8]"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              <div className="flex items-center gap-2">
                {currentTab === "categories" && <Tags className="w-4 h-4" />}
                {currentTab === "units" && <Scale className="w-4 h-4" />}
                {currentTab === "brands" && <Layers className="w-4 h-4" />}
                {!isSupportTab && <Tags className="w-4 h-4" />}
                
                <span>
                  {currentTab === "categories" && "Master Kategori"}
                  {currentTab === "units" && "Master Satuan (Unit)"}
                  {currentTab === "brands" && "Master Brand"}
                  {!isSupportTab && "Master Lainnya"}
                </span>
              </div>
            </SelectTrigger>
            <SelectContent className="bg-white border border-slate-200 shadow-xl z-50">
              <SelectItem value="categories" className="font-medium">Master Kategori</SelectItem>
              <SelectItem value="units" className="font-medium">Master Satuan (Unit)</SelectItem>
              <SelectItem value="brands" className="font-medium">Master Brand</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Render Halaman Berdasarkan Tab yang Aktif */}
      <div className="flex-1 flex flex-col">
        {currentTab === "products" && <ProductListPage />} 
        {currentTab === "categories" && <CategoryListPage />}
        {currentTab === "units" && <UnitListPage />}
        {currentTab === "brands" && <BrandListPage />}
      </div>
    </div>
  );
}