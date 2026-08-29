import { apiClient } from '@/lib/axios';

export type LogKind = 'activity' | 'audit' | 'security';

export interface LogUser {
  username: string;
  fullName: string;
}

export interface LogPaginationMeta {
  currentPage: number;
  pageSize: number;
  totalData: number;
  totalPage: number;
}

interface LogPage<T> {
  data: T[];
  meta: LogPaginationMeta;
}

export interface ActivityLogItem {
  activityLogId: string;
  userId: string;
  activityType: string;
  entityType: string | null;
  entityId: string | null;
  entityNumber: string | null;
  module: string | null;
  description: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  user: LogUser;
}

export interface AuditFieldChange {
  before: unknown;
  after: unknown;
}

export interface AuditLogItem {
  auditLogId: string;
  userId: string;
  transactionId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  entityNumber: string | null;
  module: string | null;
  source: string | null;
  changedFields: Record<string, AuditFieldChange> | null;
  reason: string | null;
  ipAddress: string | null;
  createdAt: string;
  user: LogUser;
}

export interface SecurityLogItem {
  securityLogId: string;
  userId: string | null;
  eventType: string;
  ipAddress: string | null;
  success: boolean;
  failureReason: string | null;
  description: string | null;
  reference: string | null;
  createdAt: string;
  user: LogUser | null;
}

export interface SystemLogQuery {
  page: number;
  limit: number;
  search?: string;
  module?: string;
  activityType?: string;
  operation?: string;
  event?: string;
  fromDate?: string;
  untilDate?: string;
}

async function getPage<T>(kind: LogKind, query: SystemLogQuery) {
  const response = await apiClient.get<unknown, { success: boolean; data: LogPage<T> }>(
    `/system/logs/${kind}`,
    { params: query },
  );
  return response.data;
}

export const systemLogApi = {
  activity: (query: SystemLogQuery) => getPage<ActivityLogItem>('activity', query),
  audit: (query: SystemLogQuery) => getPage<AuditLogItem>('audit', query),
  security: (query: SystemLogQuery) => getPage<SecurityLogItem>('security', query),
};
