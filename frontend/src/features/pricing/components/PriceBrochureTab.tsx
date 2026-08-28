import { useState, useEffect } from "react";
import { pricingApi, type BrochureResponseData, type BrochureUnit } from "../pricing.api";
import { parseApiError } from "@/utils/error";
import { Button } from "@/components/ui/button";
import { Loader2, Printer, FileText, AlertTriangle, Edit3 } from "lucide-react";

export default function PriceBrochureTab() {
  const [data, setData] = useState<BrochureResponseData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const fetchBrochure = async () => {
      setIsLoading(true); setErrorMsg(null);
      try {
        const res = await pricingApi.getBrochureData();
        if (isMounted) setData(res);
      } catch (err) {
        if (isMounted) setErrorMsg(parseApiError(err));
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };
    void fetchBrochure();
    return () => { isMounted = false; };
  }, []);

  // FUNGSI PRINT BULLETPROOF (Ditambahkan border bawah tipis pada setiap tag <tr>)
  const handlePrint = () => {
    const printContents = document.getElementById('printable-brochure')?.innerHTML;
    if (!printContents) return;

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(`
        <html>
          <head>
            <title></title>
            <script src="https://cdn.tailwindcss.com"></script>
            <style>
              @page { size: A4 portrait; margin: 5mm; }
              body { font-family: ui-sans-serif, system-ui, sans-serif; background: white; color: black; -webkit-print-color-adjust: exact; }
              table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 11px; }
              th { background-color: #f1f5f9 !important; text-transform: uppercase; font-weight: bold; border: 1px solid #cbd5e1; padding: 5px 6px; text-align: left; }
              td { border-bottom: 1px solid #e2e8f0; border-left: 1px solid #cbd5e1; border-right: 1px solid #cbd5e1; padding: 4px 6px; font-weight: 500; }
              tr { border-bottom: 1px solid #cbd5e1; page-break-inside: avoid; }
              .text-right { text-align: right; }
              h2 { font-size: 12px; font-weight: 900; text-transform: uppercase; background: #f8fafc; border-left: 4px solid #326dc8; padding: 3px 6px; margin-bottom: 4px; color: #1e293b; }
              thead { display: table-header-group; }
              input { 
                background: transparent; border: none; outline: none; width: 100%; 
                text-align: right; font-family: inherit; font-size: inherit; 
                font-weight: inherit; color: inherit; padding: 0; margin: 0; 
              }
            </style>
          </head>
          <body>
            ${printContents}
          </body>
        </html>
      `);
      doc.close();
      
      setTimeout(() => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => document.body.removeChild(iframe), 1000);
      }, 800); 
    }
  };

  const getPrice = (units: BrochureUnit[], matchers: string[]) => {
    const matchedUnit = units.find(u => matchers.includes(u.unitName.toUpperCase()));
    if (!matchedUnit) return "";
    return matchedUnit.price.toLocaleString('id-ID');
  };

  const handleEditChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.target.setAttribute('value', e.target.value);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 bg-white rounded-xl border border-slate-200">
        <Loader2 className="w-10 h-10 text-[#326dc8] animate-spin mb-4" />
        <p className="text-slate-500 font-medium">Menyusun Data Brosur...</p>
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div className="p-6 bg-rose-50 rounded-xl border border-rose-200 text-rose-700 flex items-start gap-3">
        <AlertTriangle className="w-6 h-6 shrink-0" />
        <div><h3 className="font-bold">Gagal memuat brosur</h3><p className="text-sm mt-1">{errorMsg}</p></div>
      </div>
    );
  }

  const storeInfo = data?.storeInfo || { companyName: "TOKO GROSIR", address: "Alamat belum diatur", phone: "-", logoBase64: null };
  const b = data?.brochure;
  const currentDate = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="flex flex-col h-full bg-slate-100 rounded-xl overflow-hidden">
      <div className="p-4 flex justify-between items-center bg-white border-b border-slate-200 shadow-sm shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 text-[#326dc8] rounded-lg">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-extrabold text-slate-800 text-lg leading-tight">Pratinjau & Edit Brosur</h2>
            <p className="text-xs text-slate-500 flex items-center gap-1">
              <Edit3 className="w-3 h-3" /> Anda dapat mengubah harga langsung di tabel ini sebelum dicetak.
            </p>
          </div>
        </div>
        <Button onClick={handlePrint} className="bg-[#326dc8] hover:bg-[#2858a6] text-white shadow-md">
          <Printer className="w-4 h-4 mr-2" /> Cetak / Save to PDF
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-4 sm:p-8 flex justify-center">
        <div id="printable-brochure" className="bg-white w-full max-w-[210mm] shadow-xl border border-slate-200 rounded-sm p-8 sm:p-10">
          
          <div className="text-center border-b-2 border-slate-800 pb-4 mb-4">
            {storeInfo.logoBase64 && (
              <img src={storeInfo.logoBase64} alt="Logo" className="h-16 object-contain mx-auto mb-2" />
            )}
            <h1 className="text-3xl font-black text-slate-900 uppercase tracking-widest">
              {storeInfo.companyName.replace(/ERP\s*/gi, '')}
            </h1>
            <p className="text-xs font-semibold text-slate-600 mt-1 whitespace-pre-wrap">{storeInfo.address}</p>
            <p className="text-xs font-semibold text-slate-600 mt-0.5">Tlp/WA: {storeInfo.phone}</p>
            <p className="text-[11px] text-slate-500 mt-2 tracking-wide font-bold uppercase bg-slate-100 inline-block px-3 py-1 rounded">
              Daftar Harga Grosir Khusus Pelanggan Terdaftar
            </p>
          </div>

          <div className="text-[11px] font-bold text-slate-700 mb-6">
            Periode Berlaku: Harga per {currentDate}
          </div>

          {/* TABEL 1: ROKOK */}
          {b?.rokok && b.rokok.length > 0 && (
            <div className="mb-6">
              <h2>Kategori Rokok</h2>
              <table className="w-full text-xs text-left">
                <thead>
                  <tr>
                    <th className="w-[35%]">Nama Barang</th>
                    <th className="text-right">Harga Dus</th>
                    <th className="text-right">Harga Bal</th>
                    <th className="text-right">Harga Slof</th>
                    <th className="text-right">Harga Bungkus</th>
                  </tr>
                </thead>
                <tbody>
                  {b.rokok.map(item => (
                    <tr key={item.productId} className="hover:bg-blue-50/50 border-b border-slate-200">
                      <td className="font-bold text-slate-800 p-1.5">{item.productName}</td>
                      <td className="text-right p-1">
                        <input type="text" defaultValue={getPrice(item.units, ['DUS'])} onChange={handleEditChange} className="w-full text-right bg-transparent hover:bg-white focus:bg-white focus:ring-1 ring-blue-400 outline-none px-1 rounded transition-colors" />
                      </td>
                      <td className="text-right p-1">
                        <input type="text" defaultValue={getPrice(item.units, ['BAL'])} onChange={handleEditChange} className="w-full text-right bg-transparent hover:bg-white focus:bg-white focus:ring-1 ring-blue-400 outline-none px-1 rounded transition-colors" />
                      </td>
                      <td className="text-right p-1">
                        <input type="text" defaultValue={getPrice(item.units, ['SLOF'])} onChange={handleEditChange} className="w-full text-right bg-transparent hover:bg-white focus:bg-white focus:ring-1 ring-blue-400 outline-none px-1 rounded transition-colors" />
                      </td>
                      <td className="text-right p-1">
                        <input type="text" defaultValue={getPrice(item.units, ['BUNGKUS', 'BKS', 'PCS'])} onChange={handleEditChange} className="w-full text-right bg-transparent hover:bg-white focus:bg-white focus:ring-1 ring-blue-400 outline-none px-1 rounded transition-colors" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* TABEL 2: ACAK / KELONTONG */}
          {b?.acak && b.acak.length > 0 && (
            <div className="mb-6">
              <h2>Barang Kelontong & Kebutuhan Lainnya</h2>
              <table className="w-full text-xs text-left">
                <thead>
                  <tr>
                    <th className="w-[35%]">Nama Barang</th>
                    <th className="text-right">Harga Dus</th>
                    <th className="text-right">Harga Pak/Box</th>
                    <th className="text-right">Harga Lusin</th>
                    <th className="text-right">Harga Pcs</th>
                  </tr>
                </thead>
                <tbody>
                  {b.acak.map(item => (
                    <tr key={item.productId} className="hover:bg-blue-50/50 border-b border-slate-200">
                      <td className="font-bold text-slate-800 p-1.5">{item.productName}</td>
                      <td className="text-right p-1">
                        <input type="text" defaultValue={getPrice(item.units, ['DUS', 'KARTON', 'BAL'])} onChange={handleEditChange} className="w-full text-right bg-transparent hover:bg-white focus:bg-white focus:ring-1 ring-blue-400 outline-none px-1 rounded transition-colors" />
                      </td>
                      <td className="text-right p-1">
                        <input type="text" defaultValue={getPrice(item.units, ['PAK', 'PACK', 'BOX', 'RENCENG', 'SLOF'])} onChange={handleEditChange} className="w-full text-right bg-transparent hover:bg-white focus:bg-white focus:ring-1 ring-blue-400 outline-none px-1 rounded transition-colors" />
                      </td>
                      <td className="text-right p-1">
                        <input type="text" defaultValue={getPrice(item.units, ['LUSIN'])} onChange={handleEditChange} className="w-full text-right bg-transparent hover:bg-white focus:bg-white focus:ring-1 ring-blue-400 outline-none px-1 rounded transition-colors" />
                      </td>
                      <td className="text-right p-1">
                        <input type="text" defaultValue={getPrice(item.units, ['PCS', 'BUNGKUS', 'BKS', 'SACHET', 'BOTOL', 'GELAS', 'BIJI', 'ROLL', 'LEMBAR'])} onChange={handleEditChange} className="w-full text-right bg-transparent hover:bg-white focus:bg-white focus:ring-1 ring-blue-400 outline-none px-1 rounded transition-colors" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* TABEL 3: MINUMAN */}
          {b?.minuman && b.minuman.length > 0 && (
            <div className="mb-6">
              <h2>Kategori Minuman</h2>
              <table className="w-full text-xs text-left">
                <thead>
                  <tr>
                    <th className="w-[35%]">Nama Barang</th>
                    <th className="text-right">Harga 10 Dus</th>
                    <th className="text-right">Harga Dus</th>
                    <th className="text-right">Harga Lusin/Pak</th>
                    <th className="text-right">Harga Pcs</th>
                  </tr>
                </thead>
                <tbody>
                  {b.minuman.map(item => (
                    <tr key={item.productId} className="hover:bg-blue-50/50 border-b border-slate-200">
                      <td className="font-bold text-slate-800 p-1.5">{item.productName}</td>
                      <td className="text-right p-1">
                        <input type="text" defaultValue={getPrice(item.units, ['10 DUS', '10DUS'])} onChange={handleEditChange} className="w-full text-right bg-transparent hover:bg-white focus:bg-white focus:ring-1 ring-blue-400 outline-none px-1 rounded transition-colors" />
                      </td>
                      <td className="text-right p-1">
                        <input type="text" defaultValue={getPrice(item.units, ['DUS', 'KARTON'])} onChange={handleEditChange} className="w-full text-right bg-transparent hover:bg-white focus:bg-white focus:ring-1 ring-blue-400 outline-none px-1 rounded transition-colors" />
                      </td>
                      <td className="text-right p-1">
                        <input type="text" defaultValue={getPrice(item.units, ['LUSIN', 'PAK', 'PACK'])} onChange={handleEditChange} className="w-full text-right bg-transparent hover:bg-white focus:bg-white focus:ring-1 ring-blue-400 outline-none px-1 rounded transition-colors" />
                      </td>
                      <td className="text-right p-1">
                        <input type="text" defaultValue={getPrice(item.units, ['PCS', 'BOTOL', 'GELAS', 'KALENG', 'CUP'])} onChange={handleEditChange} className="w-full text-right bg-transparent hover:bg-white focus:bg-white focus:ring-1 ring-blue-400 outline-none px-1 rounded transition-colors" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-6 pt-3 border-t-2 border-slate-300 text-[10px] text-slate-600 font-medium leading-relaxed italic">
            * Harga yang tertera pada katalog ini dapat berubah sewaktu-waktu tanpa pemberitahuan sebelumnya sesuai dengan kebijakan harga grosir terbaru. Jika barang yang Anda butuhkan tidak tertera di daftar ini, silakan hubungi Admin kami.
          </div>
        </div>
      </div>
    </div>
  );
}