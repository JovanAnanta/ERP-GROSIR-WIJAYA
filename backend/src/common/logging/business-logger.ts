import { randomUUID } from 'node:crypto';
import { Prisma } from '../../../generated/prisma/client.js';

export const ACTIVITY_TYPES = {
  LOGIN: 'LOGIN',
  LOGOUT: 'LOGOUT',
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  IMPORT: 'IMPORT',
  RESET_PASSWORD: 'RESET_PASSWORD',
  CHANGE_CONFIGURATION: 'CHANGE_CONFIGURATION',
} as const;
export const AUDIT_OPERATIONS = {
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
} as const;
export const SECURITY_EVENTS = {
  LOGIN_FAILED: 'LOGIN_FAILED',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  PASSWORD_RESET: 'PASSWORD_RESET',
  USER_INACTIVATED: 'USER_INACTIVATED',
  FORCED_LOGOUT: 'FORCED_LOGOUT',
  CONCURRENT_LOGIN: 'CONCURRENT_LOGIN',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  UNAUTHORIZED_API_ACCESS: 'UNAUTHORIZED_API_ACCESS',
} as const;

type JsonScalar = string | number | boolean | null;
type JsonSafe = JsonScalar | JsonSafe[] | { [key: string]: JsonSafe };
export interface AuditFieldChange {
  before: JsonSafe;
  after: JsonSafe;
}
export type AuditChangedFields = Prisma.InputJsonObject;
const SENSITIVE_FIELD_PATTERN =
  /password|passphrase|secret|token|cookie|authorization|database.?url/i;

function isDecimalLike(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    value.constructor?.name === 'Decimal' &&
    typeof value.toString === 'function'
  );
}

export function toLogJson(value: unknown): JsonSafe {
  if (value === null || value === undefined) return null;
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (isDecimalLike(value)) return (value as { toString(): string }).toString();
  if (Array.isArray(value)) return value.map((item) => toLogJson(item));
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !SENSITIVE_FIELD_PATTERN.test(key))
        .map(([key, nested]) => [key, toLogJson(nested)]),
    );
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') return value;
  return '[UNSUPPORTED]';
}

export function changedFields(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
  fields?: readonly string[],
): AuditChangedFields {
  const keys =
    fields ??
    Array.from(
      new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]),
    );
  return Object.fromEntries(
    keys.flatMap((field) => {
      if (SENSITIVE_FIELD_PATTERN.test(field)) return [];
      const previous = toLogJson(before?.[field]);
      const next = toLogJson(after?.[field]);
      return JSON.stringify(previous) === JSON.stringify(next)
        ? []
        : [[field, { before: previous, after: next }]];
    }),
  );
}

export function createAuditTransactionId(): string {
  return randomUUID();
}

export interface ActivityLogInput {
  userId: bigint;
  activityType: (typeof ACTIVITY_TYPES)[keyof typeof ACTIVITY_TYPES];
  module: string;
  description: string;
  entityType?: string;
  entityId?: bigint;
  entityNumber?: string;
  metadata?: Record<string, unknown>;
}
export interface AuditLogInput {
  userId: bigint;
  transactionId: string;
  module: string;
  operation: (typeof AUDIT_OPERATIONS)[keyof typeof AUDIT_OPERATIONS];
  entityType: string;
  entityId: bigint;
  entityNumber?: string;
  source: string;
  changedFields: AuditChangedFields;
  ipAddress?: string;
  reason?: string;
}
export interface SecurityLogInput {
  userId?: bigint;
  eventType: (typeof SECURITY_EVENTS)[keyof typeof SECURITY_EVENTS];
  ipAddress: string;
  description: string;
  reference?: string;
  success?: boolean;
}

export async function writeActivityLog(
  tx: Prisma.TransactionClient,
  input: ActivityLogInput,
) {
  await tx.activityLog.create({
    data: {
      userId: input.userId,
      activityType: input.activityType,
      module: input.module,
      entityType: input.entityType,
      entityId: input.entityId,
      entityNumber: input.entityNumber,
      description: input.description,
      metadata: input.metadata
        ? (toLogJson(input.metadata) as Prisma.InputJsonValue)
        : undefined,
    },
  });
}
export async function writeAuditLog(
  tx: Prisma.TransactionClient,
  input: AuditLogInput,
) {
  if (Object.keys(input.changedFields).length === 0) return;
  await tx.auditLog.create({
    data: {
      userId: input.userId,
      transactionId: input.transactionId,
      module: input.module,
      action: input.operation,
      entityType: input.entityType,
      entityId: input.entityId,
      entityNumber: input.entityNumber,
      source: input.source,
      changedFields: input.changedFields,
      reason: input.reason,
      ipAddress: input.ipAddress,
    },
  });
}
export async function writeSecurityLog(
  tx: Prisma.TransactionClient,
  input: SecurityLogInput,
) {
  await tx.securityLog.create({
    data: {
      userId: input.userId,
      eventType: input.eventType,
      ipAddress: input.ipAddress,
      description: input.description,
      reference: input.reference,
      success: input.success ?? true,
    },
  });
}
