export interface ThermalPrintJob {
  printDocument: (html: string) => Promise<void>;
  close: () => void;
}

export interface ThermalReceiptBranding {
  logoBase64?: string | null;
  companyName?: string | null;
  address?: string | null;
  phone?: string | null;
  receiptHeader1?: string | null;
  receiptHeader2?: string | null;
  receiptHeader3?: string | null;
  receiptFooter1?: string | null;
  receiptFooter2?: string | null;
  receiptFooter3?: string | null;
}

export function escapeReceiptHtml(value: unknown): string {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character] ?? character,
  );
}

export function thermalReceiptHeader(config: ThermalReceiptBranding): string {
  const lines = [
    config.receiptHeader1,
    config.receiptHeader2,
    config.receiptHeader3,
  ]
    .filter(Boolean)
    .map((value) => `<div>${escapeReceiptHtml(value)}</div>`)
    .join("");
  return `${config.logoBase64 ? `<img class="receipt-logo" src="${escapeReceiptHtml(config.logoBase64)}" alt="Logo"/>` : ""}${config.companyName ? `<div class="center company bold">${escapeReceiptHtml(config.companyName)}</div>` : ""}${config.address ? `<div class="center">${escapeReceiptHtml(config.address)}</div>` : ""}${config.phone ? `<div class="center">Telp: ${escapeReceiptHtml(config.phone)}</div>` : ""}${lines ? `<div class="receipt-header">${lines}</div>` : ""}`;
}

export function thermalReceiptFooter(config: ThermalReceiptBranding): string {
  const lines = [
    config.receiptFooter1,
    config.receiptFooter2,
    config.receiptFooter3,
  ]
    .filter(Boolean)
    .map((value) => `<div>${escapeReceiptHtml(value)}</div>`)
    .join("");
  return `${lines ? `<div class="receipt-footer">${lines}</div>` : ""}<div class="printed">Dicetak: ${escapeReceiptHtml(new Date().toLocaleString("id-ID"))}</div>`;
}

const THERMAL_PRINT_STYLES = `
  @page { size: 80mm auto; margin: 0; }
  * { box-sizing: border-box; }
  html, body { width: 80mm !important; min-width: 80mm !important; margin: 0 !important; background: #fff !important; color: #000 !important; }
  body { padding: 0 !important; font-family: "Courier New", Courier, monospace !important; font-size: 10px !important; line-height: 1.3 !important; }
  body > .receipt, body > section.receipt { width: 80mm !important; max-width: 80mm !important; padding: 4mm !important; margin: 0 !important; }
  body:not(:has(> .receipt)) { padding: 4mm !important; }
  table { width: 100% !important; font-size: 9.5px !important; }
  img, .logo, .receipt-logo { display: block !important; width: auto !important; height: auto !important; max-width: 32mm !important; max-height: 14mm !important; margin: 0 auto 2mm !important; object-fit: contain !important; filter: grayscale(100%) contrast(145%) !important; }
  .company { font-size: 10.5px !important; }
  .center { text-align: center; }
  .bold { font-weight: 700; }
  .receipt-header, .receipt-footer { margin-top: 2mm; padding-top: 2mm; border-top: 1px dashed #777; text-align: center; }
  .printed, .footer { font-size: 8.5px !important; }
  @media print {
    html, body { print-color-adjust: economy; -webkit-print-color-adjust: economy; }
  }
`;

function waitForImages(document: Document): Promise<void> {
  const images = Array.from(document.images);
  return Promise.all(
    images.map((image) => {
      if (image.complete) return Promise.resolve();
      return new Promise<void>((resolve) => {
        image.addEventListener("load", () => resolve(), { once: true });
        image.addEventListener("error", () => resolve(), { once: true });
      });
    }),
  ).then(() => undefined);
}

async function waitForPrintAssets(popup: Window): Promise<void> {
  const fontsReady = popup.document.fonts?.ready ?? Promise.resolve();
  await Promise.race([
    Promise.all([fontsReady, waitForImages(popup.document)]),
    new Promise<void>((resolve) => popup.setTimeout(resolve, 3_000)),
  ]);
  await new Promise<void>((resolve) =>
    popup.requestAnimationFrame(() => popup.requestAnimationFrame(() => resolve())),
  );
}

/**
 * Must be called directly from the user's click handler so browsers do not block
 * the print window while application/configuration data is being loaded.
 */
export function createThermalPrintJob(title: string): ThermalPrintJob {
  const popup = window.open("", "_blank", "width=520,height=820");
  if (!popup) {
    throw new Error(
      "Jendela cetak diblokir browser. Izinkan popup untuk aplikasi ERP ini.",
    );
  }

  popup.document.write(
    `<!doctype html><html><head><title>${escapeReceiptHtml(title)}</title></head><body><div style="padding:16px;font-family:Arial,sans-serif;font-size:13px">Menyiapkan struk...</div></body></html>`,
  );
  popup.document.close();

  return {
    close: () => {
      if (!popup.closed) popup.close();
    },
    printDocument: async (html: string) => {
      if (popup.closed) throw new Error("Jendela cetak sudah ditutup.");
      const style = `<style id="erp-thermal-print">${THERMAL_PRINT_STYLES}</style>`;
      const normalizedHtml = html.includes("</head>")
        ? html.replace("</head>", `${style}</head>`)
        : `<!doctype html><html><head><title>${escapeReceiptHtml(title)}</title>${style}</head><body>${html}</body></html>`;

      popup.document.open();
      popup.document.write(normalizedHtml);
      popup.document.close();
      await waitForPrintAssets(popup);

      popup.addEventListener(
        "afterprint",
        () => popup.setTimeout(() => popup.close(), 50),
        { once: true },
      );
      popup.focus();
      popup.print();
    },
  };
}
