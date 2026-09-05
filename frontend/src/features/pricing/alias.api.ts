import { apiClient } from "@/lib/axios";
export type AliasKind = "PRODUCT" | "UNIT";
export interface AliasTarget {
  id: string;
  name: string;
}
export interface AliasRow {
  id: string;
  targetId: string;
  targetName: string;
  aliasName: string;
  isActive: boolean;
}
export interface AliasPage {
  rows: AliasRow[];
  total: number;
  page: number;
  limit: number;
}
export const aliasApi = {
  list: async (params: {
    kind: AliasKind;
    search: string;
    targetId?: string;
    page: number;
    limit: number;
  }) =>
    (
      await apiClient.get<never, { data: AliasPage }>("/pricing/aliases", {
        params,
      })
    ).data,
  targets: async (kind: AliasKind, search: string) =>
    (
      await apiClient.get<never, { data: AliasTarget[] }>(
        "/pricing/aliases/targets",
        { params: { kind, search } },
      )
    ).data,
  create: (kind: AliasKind, targetId: string, aliases: string[]) =>
    apiClient.post("/pricing/aliases", { kind, targetId, aliases }),
  update: (kind: AliasKind, row: AliasRow, aliasName: string) =>
    apiClient.put(`/pricing/aliases/${row.id}`, {
      kind,
      originalName: row.aliasName,
      aliasName,
    }),
  remove: (kind: AliasKind, row: AliasRow) =>
    apiClient.delete(`/pricing/aliases/${row.id}`, {
      data: { kind, originalName: row.aliasName },
    }),
};
