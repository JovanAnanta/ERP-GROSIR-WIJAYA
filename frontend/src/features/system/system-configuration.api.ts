import { apiClient } from "@/lib/axios";

export interface SystemConfigData {
  companyName: string;
  address: string;
  phone: string;
  logoBase64: string | null;
  receiptHeader1: string | null;
  receiptHeader2: string | null;
  receiptHeader3: string | null;
  receiptFooter1: string | null;
  receiptFooter2: string | null;
  receiptFooter3: string | null;
  updatedAt?: string;
  // Fixed Configurations
  currency: string;
  timezone: string;
  dateFormat: string;
  quantityDecimal: number;
  priceDecimal: number;
  language: string;
}

export const systemConfigApi = {
  get: async () => {
    const response = await apiClient.get<unknown, unknown>("/system-configuration");
    let payload: unknown = response;
    for (let depth = 0; depth < 3; depth += 1) {
      if (
        payload &&
        typeof payload === "object" &&
        "companyName" in payload &&
        "receiptHeader1" in payload
      ) break;
      if (payload && typeof payload === "object" && "data" in payload) {
        payload = (payload as { data?: unknown }).data;
      }
    }
    if (!payload || typeof payload !== "object" || !("companyName" in payload)) {
      throw new Error("Response System Configuration tidak valid.");
    }
    const config = payload as SystemConfigData;
    // Keep the legacy `.data` access used by Purchase while also allowing
    // Sales to consume the configuration directly.
    return Object.assign({}, config, { data: config });
  },
  update: async (data: Partial<SystemConfigData>) => {
    const res = await apiClient.put<{ success: boolean; message: string }>(
      "/system-configuration",
      data,
    );
    return res;
  },
};
