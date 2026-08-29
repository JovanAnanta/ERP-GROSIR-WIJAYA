import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { Prisma } from '../../../../generated/prisma/client.js';
import { SECURITY_EVENTS } from '../../../common/logging/business-logger.js';
import {
  ActivityLogQueryDto,
  AuditLogQueryDto,
  BaseLogQueryDto,
  SecurityLogQueryDto,
} from './dto/log-query.dto.js';

@Injectable()
export class SystemLogService {
  private readonly securityEvents = Object.values(SECURITY_EVENTS);

  constructor(private readonly prisma: PrismaService) {}

  private pagination(query: BaseLogQueryDto) {
    return { skip: (query.page - 1) * query.limit, take: query.limit };
  }

  private dateRange(query: BaseLogQueryDto) {
    const from = query.fromDate ? new Date(query.fromDate) : undefined;
    const until = query.untilDate ? new Date(query.untilDate) : undefined;
    if (from && until && from > until)
      throw new BadRequestException('Rentang tanggal tidak valid.');
    return from || until
      ? { ...(from ? { gte: from } : {}), ...(until ? { lte: until } : {}) }
      : undefined;
  }

  private result<T>(data: T[], total: number, query: BaseLogQueryDto) {
    return {
      data,
      meta: {
        currentPage: query.page,
        pageSize: query.limit,
        totalData: total,
        totalPage: Math.ceil(total / query.limit),
      },
    };
  }

  private withoutLegacyUserAgent<T extends { userAgent?: string | null }>(
    row: T,
  ): Omit<T, 'userAgent'> {
    const { userAgent, ...safeRow } = row;
    void userAgent;
    return safeRow;
  }

  async activity(query: ActivityLogQueryDto) {
    const createdAt = this.dateRange(query);
    const where: Prisma.ActivityLogWhereInput = {
      ...(query.userId ? { userId: BigInt(query.userId) } : {}),
      ...(query.module ? { module: query.module } : {}),
      ...(query.activityType ? { activityType: query.activityType } : {}),
      ...(createdAt ? { createdAt } : {}),
      ...(query.search
        ? {
            OR: [
              { entityNumber: { contains: query.search, mode: 'insensitive' } },
              { description: { contains: query.search, mode: 'insensitive' } },
              {
                user: {
                  username: { contains: query.search, mode: 'insensitive' },
                },
              },
            ],
          }
        : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.activityLog.count({ where }),
      this.prisma.activityLog.findMany({
        where,
        ...this.pagination(query),
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { username: true, fullName: true } } },
      }),
    ]);
    return this.result(rows, total, query);
  }

  async activityDetail(id: bigint) {
    const row = await this.prisma.activityLog.findUnique({
      where: { activityLogId: id },
      include: { user: { select: { username: true, fullName: true } } },
    });
    if (!row) throw new NotFoundException('Detail Activity tidak ditemukan.');
    return row;
  }

  async audit(query: AuditLogQueryDto) {
    const createdAt = this.dateRange(query);
    const numericSearch =
      query.search && /^\d+$/.test(query.search)
        ? BigInt(query.search)
        : undefined;
    const where: Prisma.AuditLogWhereInput = {
      ...(query.userId ? { userId: BigInt(query.userId) } : {}),
      ...(query.module ? { module: query.module } : {}),
      ...(query.entity ? { entityType: query.entity } : {}),
      ...(query.operation ? { action: query.operation } : {}),
      ...(createdAt ? { createdAt } : {}),
      ...(query.search
        ? {
            OR: [
              { entityNumber: { contains: query.search, mode: 'insensitive' } },
              { source: { contains: query.search, mode: 'insensitive' } },
              ...(numericSearch ? [{ entityId: numericSearch }] : []),
              {
                user: {
                  username: { contains: query.search, mode: 'insensitive' },
                },
              },
            ],
          }
        : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        ...this.pagination(query),
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { username: true, fullName: true } } },
      }),
    ]);
    return this.result(
      rows.map((row) => this.withoutLegacyUserAgent(row)),
      total,
      query,
    );
  }

  async auditDetail(id: bigint) {
    const row = await this.prisma.auditLog.findUnique({
      where: { auditLogId: id },
      include: { user: { select: { username: true, fullName: true } } },
    });
    if (!row) throw new NotFoundException('Detail Audit tidak ditemukan.');
    return this.withoutLegacyUserAgent(row);
  }

  async security(query: SecurityLogQueryDto) {
    const createdAt = this.dateRange(query);
    const where: Prisma.SecurityLogWhereInput = {
      ...(query.userId ? { userId: BigInt(query.userId) } : {}),
      eventType: query.event ? query.event : { in: this.securityEvents },
      ...(createdAt ? { createdAt } : {}),
      ...(query.search
        ? {
            OR: [
              { ipAddress: { contains: query.search } },
              { description: { contains: query.search, mode: 'insensitive' } },
              {
                failureReason: {
                  contains: query.search,
                  mode: 'insensitive',
                },
              },
              { reference: { contains: query.search, mode: 'insensitive' } },
              {
                user: {
                  username: { contains: query.search, mode: 'insensitive' },
                },
              },
            ],
          }
        : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.securityLog.count({ where }),
      this.prisma.securityLog.findMany({
        where,
        ...this.pagination(query),
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { username: true, fullName: true } } },
      }),
    ]);
    return this.result(
      rows.map((row) => this.withoutLegacyUserAgent(row)),
      total,
      query,
    );
  }

  async securityDetail(id: bigint) {
    const row = await this.prisma.securityLog.findUnique({
      where: {
        securityLogId: id,
        eventType: { in: this.securityEvents },
      },
      include: { user: { select: { username: true, fullName: true } } },
    });
    if (!row) throw new NotFoundException('Detail Security tidak ditemukan.');
    return this.withoutLegacyUserAgent(row);
  }
}
