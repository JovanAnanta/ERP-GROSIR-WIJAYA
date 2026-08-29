import { useEffect, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Eye,
  FileClock,
  Loader2,
  Search,
  ShieldAlert,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { parseApiError } from '@/utils/error';
import {
  systemLogApi,
  type ActivityLogItem,
  type AuditFieldChange,
  type AuditLogItem,
  type LogKind,
  type LogPaginationMeta,
  type SecurityLogItem,
  type SystemLogQuery,
} from '../system-log.api';

type LogItem = ActivityLogItem | AuditLogItem | SecurityLogItem;

const EMPTY_META: LogPaginationMeta = {
  currentPage: 1,
  pageSize: 50,
  totalData: 0,
  totalPage: 0,
};

const MODULES = [
  'SYSTEM',
  'MASTER_DATA',
  'PRODUCT',
  'SUPPLIER',
  'CUSTOMER',
  'PRICE',
  'PURCHASE',
  'INVENTORY',
  'FIFO',
  'FINANCIAL',
];

const ACTIVITY_TYPES = [
  'LOGIN',
  'LOGOUT',
  'CREATE',
  'UPDATE',
  'DELETE',
  'IMPORT',
  'RESET_PASSWORD',
  'CHANGE_CONFIGURATION',
];

const SECURITY_EVENTS = [
  'LOGIN_FAILED',
  'ACCOUNT_LOCKED',
  'PASSWORD_RESET',
  'USER_INACTIVATED',
  'FORCED_LOGOUT',
  'CONCURRENT_LOGIN',
  'PERMISSION_DENIED',
  'UNAUTHORIZED_API_ACCESS',
];

const LABELS: Record<string, string> = {
  LOGIN: 'Login',
  LOGOUT: 'Logout',
  CREATE: 'Membuat Data',
  UPDATE: 'Mengubah Data',
  DELETE: 'Menghapus Data',
  IMPORT: 'Import Data',
  RESET_PASSWORD: 'Reset Password',
  CHANGE_CONFIGURATION: 'Ubah Konfigurasi',
  LOGIN_FAILED: 'Login Gagal',
  ACCOUNT_LOCKED: 'Akun Terkunci',
  PASSWORD_RESET: 'Password Direset',
  USER_INACTIVATED: 'User Dinonaktifkan',
  FORCED_LOGOUT: 'Logout Paksa',
  CONCURRENT_LOGIN: 'Login Bersamaan',
  PERMISSION_DENIED: 'Akses Ditolak',
  UNAUTHORIZED_API_ACCESS: 'API Tanpa Izin',
};

function label(value: string | null | undefined) {
  if (!value) return '-';
  return (
    LABELS[value] ??
    value
      .toLowerCase()
      .split('_')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ')
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(new Date(value));
}

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'boolean') return value ? 'Ya' : 'Tidak';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

function localDateBoundary(value: string, endOfDay: boolean) {
  if (!value) return undefined;
  return new Date(
    `${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}`,
  ).toISOString();
}

function eventBadgeClass(value: string) {
  if (value.includes('FAILED') || value.includes('DENIED'))
    return 'border-rose-200 bg-rose-50 text-rose-700';
  if (value.includes('LOCKED') || value.includes('INACTIVATED'))
    return 'border-amber-200 bg-amber-50 text-amber-700';
  if (value === 'CREATE' || value === 'LOGIN')
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (value === 'DELETE' || value === 'LOGOUT')
    return 'border-rose-200 bg-rose-50 text-rose-700';
  return 'border-blue-200 bg-blue-50 text-blue-700';
}

export default function SystemLogsPage() {
  const [kind, setKind] = useState<LogKind>('activity');
  const [rows, setRows] = useState<LogItem[]>([]);
  const [meta, setMeta] = useState(EMPTY_META);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [search, setSearch] = useState('');
  const [module, setModule] = useState('ALL');
  const [activityType, setActivityType] = useState('ALL');
  const [operation, setOperation] = useState('ALL');
  const [securityEvent, setSecurityEvent] = useState('ALL');
  const [fromDate, setFromDate] = useState('');
  const [untilDate, setUntilDate] = useState('');
  const [selected, setSelected] = useState<LogItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    const currentRequest = ++requestId.current;
    const timer = window.setTimeout(async () => {
      setIsLoading(true);
      setError(null);
      const query: SystemLogQuery = {
        page,
        limit,
        ...(search.trim() ? { search: search.trim() } : {}),
        ...(module !== 'ALL' && kind !== 'security' ? { module } : {}),
        ...(kind === 'activity' && activityType !== 'ALL'
          ? { activityType }
          : {}),
        ...(kind === 'audit' && operation !== 'ALL' ? { operation } : {}),
        ...(kind === 'security' && securityEvent !== 'ALL'
          ? { event: securityEvent }
          : {}),
        ...(fromDate
          ? { fromDate: localDateBoundary(fromDate, false) }
          : {}),
        ...(untilDate
          ? { untilDate: localDateBoundary(untilDate, true) }
          : {}),
      };

      try {
        const response =
          kind === 'activity'
            ? await systemLogApi.activity(query)
            : kind === 'audit'
              ? await systemLogApi.audit(query)
              : await systemLogApi.security(query);
        if (currentRequest !== requestId.current) return;
        setRows(response.data);
        setMeta(response.meta);
      } catch (caught) {
        if (currentRequest !== requestId.current) return;
        setRows([]);
        setMeta({ ...EMPTY_META, currentPage: page, pageSize: limit });
        setError(parseApiError(caught));
      } finally {
        if (currentRequest === requestId.current) setIsLoading(false);
      }
    }, 300);

    return () => window.clearTimeout(timer);
  }, [
    activityType,
    fromDate,
    kind,
    limit,
    module,
    operation,
    page,
    search,
    securityEvent,
    untilDate,
  ]);

  const changeKind = (next: LogKind) => {
    setKind(next);
    setPage(1);
    setSelected(null);
  };

  const resetPage = (setter: () => void) => {
    setter();
    setPage(1);
  };

  return (
    <div className="min-h-full bg-slate-50 p-6">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-5">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div>
              <div className="flex items-center gap-2">
                <FileClock className="h-6 w-6 text-[#326dc8]" />
                <h2 className="text-2xl font-extrabold tracking-tight text-slate-800">
                  System Logs
                </h2>
                <Badge
                  variant="outline"
                  className="border-slate-200 bg-slate-50 text-slate-600"
                >
                  Read-only
                </Badge>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                Telusuri aktivitas pengguna, perubahan data, dan kejadian keamanan sistem.
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-right">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Data ditemukan
              </p>
              <p className="text-xl font-extrabold text-slate-800">
                {meta.totalData.toLocaleString('id-ID')}
              </p>
            </div>
          </div>
        </div>

        <div className="border-b border-slate-100 px-6 pt-4">
          <div className="flex gap-2 overflow-x-auto">
            <LogTab
              active={kind === 'activity'}
              icon={<Activity className="h-4 w-4" />}
              title="Activity Log"
              description="Siapa melakukan apa"
              onClick={() => changeKind('activity')}
            />
            <LogTab
              active={kind === 'audit'}
              icon={<ClipboardList className="h-4 w-4" />}
              title="Audit Log"
              description="Data sebelum dan sesudah"
              onClick={() => changeKind('audit')}
            />
            <LogTab
              active={kind === 'security'}
              icon={<ShieldAlert className="h-4 w-4" />}
              title="Security Log"
              description="Kejadian keamanan"
              onClick={() => changeKind('security')}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 bg-slate-50/70 p-4">
          <div className="min-w-[240px] flex-1">
            <p className="mb-1.5 text-xs font-semibold text-slate-500">Pencarian</p>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                value={search}
                onChange={(event) => resetPage(() => setSearch(event.target.value))}
                placeholder={
                  kind === 'security'
                    ? 'Cari username atau alamat IP...'
                    : 'Cari username, referensi, atau keterangan...'
                }
                className="bg-white pl-9"
              />
            </div>
          </div>

          {kind !== 'security' && (
            <FilterSelect
              label="Modul"
              value={module}
              width="w-[170px]"
              options={MODULES}
              allLabel="Semua Modul"
              onChange={(value) => resetPage(() => setModule(value))}
            />
          )}
          {kind === 'activity' && (
            <FilterSelect
              label="Jenis Aktivitas"
              value={activityType}
              width="w-[190px]"
              options={ACTIVITY_TYPES}
              allLabel="Semua Aktivitas"
              onChange={(value) => resetPage(() => setActivityType(value))}
            />
          )}
          {kind === 'audit' && (
            <FilterSelect
              label="Operasi Data"
              value={operation}
              width="w-[170px]"
              options={['CREATE', 'UPDATE', 'DELETE']}
              allLabel="Semua Operasi"
              onChange={(value) => resetPage(() => setOperation(value))}
            />
          )}
          {kind === 'security' && (
            <FilterSelect
              label="Kejadian"
              value={securityEvent}
              width="w-[210px]"
              options={SECURITY_EVENTS}
              allLabel="Semua Kejadian"
              onChange={(value) => resetPage(() => setSecurityEvent(value))}
            />
          )}

          <DateFilter
            label="Dari tanggal"
            value={fromDate}
            max={untilDate || undefined}
            onChange={(value) => resetPage(() => setFromDate(value))}
          />
          <DateFilter
            label="Sampai tanggal"
            value={untilDate}
            min={fromDate || undefined}
            onChange={(value) => resetPage(() => setUntilDate(value))}
          />
          <FilterSelect
            label="Tampilkan"
            value={String(limit)}
            width="w-[110px]"
            options={['25', '50', '100']}
            allLabel=""
            includeAll={false}
            onChange={(value) => {
              setLimit(Number(value));
              setPage(1);
            }}
          />
        </div>

        {error && (
          <div className="mx-6 mt-4 flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm font-medium text-rose-700">
            <AlertTriangle className="h-5 w-5 shrink-0" /> {error}
          </div>
        )}

        <div className="relative overflow-auto p-6 pt-4">
          {isLoading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60 backdrop-blur-[1px]">
              <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 shadow-sm">
                <Loader2 className="h-4 w-4 animate-spin" /> Memuat log...
              </div>
            </div>
          )}
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <Table className="min-w-[1050px]">
              <TableHeader className="bg-slate-100/80">
                {kind === 'activity' ? (
                  <TableRow>
                    <TableHead>Waktu</TableHead>
                    <TableHead>Pengguna</TableHead>
                    <TableHead>Aktivitas</TableHead>
                    <TableHead>Modul</TableHead>
                    <TableHead>Keterangan</TableHead>
                    <TableHead>Referensi</TableHead>
                    <TableHead className="w-16 text-center">Detail</TableHead>
                  </TableRow>
                ) : kind === 'audit' ? (
                  <TableRow>
                    <TableHead>Waktu</TableHead>
                    <TableHead>Pengguna</TableHead>
                    <TableHead>Operasi</TableHead>
                    <TableHead>Modul / Entitas</TableHead>
                    <TableHead>Referensi</TableHead>
                    <TableHead>Perubahan</TableHead>
                    <TableHead className="w-16 text-center">Detail</TableHead>
                  </TableRow>
                ) : (
                  <TableRow>
                    <TableHead>Waktu</TableHead>
                    <TableHead>Pengguna</TableHead>
                    <TableHead>Kejadian</TableHead>
                    <TableHead>Alamat IP</TableHead>
                    <TableHead>Keterangan</TableHead>
                    <TableHead>Referensi</TableHead>
                    <TableHead className="w-16 text-center">Detail</TableHead>
                  </TableRow>
                )}
              </TableHeader>
              <TableBody>
                {!isLoading && rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-16 text-center">
                      <FileClock className="mx-auto mb-3 h-9 w-9 text-slate-300" />
                      <p className="font-semibold text-slate-600">Belum ada data log</p>
                      <p className="mt-1 text-sm text-slate-400">
                        Ubah filter atau rentang tanggal untuk mencari data lain.
                      </p>
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => (
                    <LogRow key={getLogId(row)} row={row} onDetail={setSelected} />
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        <div className="flex flex-col justify-between gap-3 border-t border-slate-100 px-6 py-4 sm:flex-row sm:items-center">
          <p className="text-sm text-slate-500">
            Menampilkan <span className="font-semibold text-slate-700">{rows.length}</span>{' '}
            dari <span className="font-semibold text-slate-700">{meta.totalData}</span> data
            · Halaman {meta.currentPage} dari {Math.max(meta.totalPage, 1)}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || isLoading}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              <ChevronLeft className="mr-1 h-4 w-4" /> Sebelumnya
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= meta.totalPage || meta.totalPage === 0 || isLoading}
              onClick={() => setPage((current) => current + 1)}
            >
              Berikutnya <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <LogDetailDialog row={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function LogTab({
  active,
  icon,
  title,
  description,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-w-[190px] border-b-2 px-4 pb-3 text-left transition-colors ${
        active
          ? 'border-[#326dc8] text-[#2858a6]'
          : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
      }`}
    >
      <span className="flex items-center gap-2 text-sm font-bold">
        {icon} {title}
      </span>
      <span className="mt-0.5 block text-xs font-normal text-slate-400">{description}</span>
    </button>
  );
}

function FilterSelect({
  label: title,
  value,
  options,
  allLabel,
  onChange,
  width,
  includeAll = true,
}: {
  label: string;
  value: string;
  options: string[];
  allLabel: string;
  onChange: (value: string) => void;
  width: string;
  includeAll?: boolean;
}) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold text-slate-500">{title}</p>
      <Select
        value={value}
        onValueChange={(nextValue) => {
          if (nextValue !== null) onChange(nextValue);
        }}
      >
        <SelectTrigger className={`${width} bg-white`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="border-slate-200 bg-white shadow-xl">
          {includeAll && <SelectItem value="ALL">{allLabel}</SelectItem>}
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {/^\d+$/.test(option) ? option : label(option)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function DateFilter({
  label: title,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
}) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold text-slate-500">{title}</p>
      <Input
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(event) => onChange(event.target.value)}
        className="w-[155px] bg-white"
      />
    </div>
  );
}

function getLogId(row: LogItem) {
  if ('activityLogId' in row) return `activity-${row.activityLogId}`;
  if ('auditLogId' in row) return `audit-${row.auditLogId}`;
  return `security-${row.securityLogId}`;
}

function UserCell({ user }: { user: { username: string; fullName: string } | null }) {
  if (!user) return <span className="text-slate-400">Tidak teridentifikasi</span>;
  return (
    <div>
      <p className="font-semibold text-slate-700">{user.fullName}</p>
      <p className="text-xs text-slate-400">@{user.username}</p>
    </div>
  );
}

function LogRow({ row, onDetail }: { row: LogItem; onDetail: (row: LogItem) => void }) {
  if ('activityLogId' in row) {
    return (
      <TableRow className="hover:bg-slate-50/80">
        <TableCell className="whitespace-nowrap text-sm text-slate-500">{formatDate(row.createdAt)}</TableCell>
        <TableCell><UserCell user={row.user} /></TableCell>
        <TableCell><Badge variant="outline" className={eventBadgeClass(row.activityType)}>{label(row.activityType)}</Badge></TableCell>
        <TableCell className="font-medium text-slate-600">{label(row.module)}</TableCell>
        <TableCell className="max-w-[340px] text-slate-600"><p className="line-clamp-2">{row.description}</p></TableCell>
        <TableCell className="text-sm text-slate-500">{row.entityNumber ?? row.entityType ?? '-'}</TableCell>
        <DetailButton onClick={() => onDetail(row)} />
      </TableRow>
    );
  }
  if ('auditLogId' in row) {
    const count = Object.keys(row.changedFields ?? {}).length;
    return (
      <TableRow className="hover:bg-slate-50/80">
        <TableCell className="whitespace-nowrap text-sm text-slate-500">{formatDate(row.createdAt)}</TableCell>
        <TableCell><UserCell user={row.user} /></TableCell>
        <TableCell><Badge variant="outline" className={eventBadgeClass(row.action)}>{label(row.action)}</Badge></TableCell>
        <TableCell><p className="font-semibold text-slate-700">{label(row.module)}</p><p className="text-xs text-slate-400">{label(row.entityType)}</p></TableCell>
        <TableCell className="text-sm text-slate-500">{row.entityNumber ?? `ID ${row.entityId}`}</TableCell>
        <TableCell className="text-sm font-medium text-slate-600">{count} field berubah</TableCell>
        <DetailButton onClick={() => onDetail(row)} />
      </TableRow>
    );
  }
  return (
    <TableRow className="hover:bg-slate-50/80">
      <TableCell className="whitespace-nowrap text-sm text-slate-500">{formatDate(row.createdAt)}</TableCell>
      <TableCell><UserCell user={row.user} /></TableCell>
      <TableCell><Badge variant="outline" className={eventBadgeClass(row.eventType)}>{label(row.eventType)}</Badge></TableCell>
      <TableCell className="font-mono text-xs text-slate-600">{row.ipAddress ?? '-'}</TableCell>
      <TableCell className="max-w-[340px] text-slate-600"><p className="line-clamp-2">{row.description ?? row.failureReason ?? '-'}</p></TableCell>
      <TableCell className="text-sm text-slate-500">{row.reference ?? '-'}</TableCell>
      <DetailButton onClick={() => onDetail(row)} />
    </TableRow>
  );
}

function DetailButton({ onClick }: { onClick: () => void }) {
  return (
    <TableCell className="text-center">
      <Button type="button" variant="ghost" size="sm" onClick={onClick} className="text-slate-500 hover:bg-blue-50 hover:text-[#326dc8]" aria-label="Lihat detail log">
        <Eye className="h-4 w-4" />
      </Button>
    </TableCell>
  );
}

function LogDetailDialog({ row, onClose }: { row: LogItem | null; onClose: () => void }) {
  return (
    <Dialog open={row !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[88vh] overflow-y-auto border-slate-200 bg-white p-0 sm:max-w-3xl">
        {row && (
          <>
            <DialogHeader className="border-b border-slate-100 px-6 py-5">
              <DialogTitle className="flex items-center gap-2 text-slate-800">
                <FileClock className="h-5 w-5 text-[#326dc8]" /> Detail Log
              </DialogTitle>
              <p className="text-sm text-slate-500">Informasi ini bersifat read-only dan tidak dapat diubah.</p>
            </DialogHeader>
            <div className="space-y-5 px-6 pb-6">
              {'activityLogId' in row ? <ActivityDetail row={row} /> : 'auditLogId' in row ? <AuditDetail row={row} /> : <SecurityDetail row={row} />}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DetailGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">{children}</div>;
}

function DetailField({ title, value, mono = false }: { title: string; value: unknown; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{title}</p>
      <p className={`mt-1 break-words text-sm font-medium text-slate-700 ${mono ? 'font-mono' : ''}`}>{formatValue(value)}</p>
    </div>
  );
}

function ActivityDetail({ row }: { row: ActivityLogItem }) {
  return (
    <>
      <DetailGrid>
        <DetailField title="Waktu" value={formatDate(row.createdAt)} />
        <DetailField title="Pengguna" value={`${row.user.fullName} (@${row.user.username})`} />
        <DetailField title="Aktivitas" value={label(row.activityType)} />
        <DetailField title="Modul" value={label(row.module)} />
        <DetailField title="Jenis Data" value={label(row.entityType)} />
        <DetailField title="Referensi" value={row.entityNumber ?? row.entityId} />
      </DetailGrid>
      <DetailSection title="Keterangan"><p className="text-sm leading-6 text-slate-700">{row.description}</p></DetailSection>
      {row.metadata && <DetailSection title="Informasi Tambahan"><pre className="overflow-auto whitespace-pre-wrap text-xs text-slate-600">{formatValue(row.metadata)}</pre></DetailSection>}
    </>
  );
}

function AuditDetail({ row }: { row: AuditLogItem }) {
  const changes = Object.entries(row.changedFields ?? {});
  return (
    <>
      <DetailGrid>
        <DetailField title="Waktu" value={formatDate(row.createdAt)} />
        <DetailField title="Pengguna" value={`${row.user.fullName} (@${row.user.username})`} />
        <DetailField title="Operasi" value={label(row.action)} />
        <DetailField title="Modul" value={label(row.module)} />
        <DetailField title="Entitas" value={label(row.entityType)} />
        <DetailField title="Referensi" value={row.entityNumber ?? row.entityId} />
        <DetailField title="Sumber Perubahan" value={row.source} />
        <DetailField title="Transaction ID" value={row.transactionId} mono />
        <DetailField title="Alamat IP" value={row.ipAddress} mono />
        <DetailField title="Alasan" value={row.reason} />
      </DetailGrid>
      <DetailSection title={`Perubahan Data (${changes.length} field)`}>
        {changes.length === 0 ? (
          <p className="text-sm text-slate-500">Tidak ada rincian field yang tersedia.</p>
        ) : (
          <div className="space-y-3">
            {changes.map(([field, change]) => <ChangeCard key={field} field={field} change={change} />)}
          </div>
        )}
      </DetailSection>
    </>
  );
}

function ChangeCard({ field, change }: { field: string; change: AuditFieldChange }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <p className="mb-2 text-sm font-bold text-slate-700">{label(field)}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-md bg-rose-50 p-2.5"><p className="text-xs font-semibold text-rose-500">Sebelum</p><pre className="mt-1 whitespace-pre-wrap break-words text-xs text-slate-700">{formatValue(change.before)}</pre></div>
        <div className="rounded-md bg-emerald-50 p-2.5"><p className="text-xs font-semibold text-emerald-600">Sesudah</p><pre className="mt-1 whitespace-pre-wrap break-words text-xs text-slate-700">{formatValue(change.after)}</pre></div>
      </div>
    </div>
  );
}

function SecurityDetail({ row }: { row: SecurityLogItem }) {
  return (
    <>
      <DetailGrid>
        <DetailField title="Waktu" value={formatDate(row.createdAt)} />
        <DetailField title="Pengguna" value={row.user ? `${row.user.fullName} (@${row.user.username})` : 'Tidak teridentifikasi'} />
        <DetailField title="Kejadian" value={label(row.eventType)} />
        <DetailField title="Alamat IP" value={row.ipAddress} mono />
        <DetailField title="Referensi" value={row.reference} />
      </DetailGrid>
      <DetailSection title="Keterangan"><p className="text-sm leading-6 text-slate-700">{row.description ?? row.failureReason ?? '-'}</p></DetailSection>
    </>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section><h3 className="mb-2 text-sm font-bold text-slate-700">{title}</h3><div className="rounded-xl border border-slate-200 p-4">{children}</div></section>;
}
