import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../database/prisma.service.js';
import {
  changedFields,
  createAuditTransactionId,
  writeActivityLog,
  writeAuditLog,
} from '../../common/logging/business-logger.js';
import {
  AliasQueryDto,
  CreateAliasesDto,
  ChangeAliasDto,
  DeleteAliasDto,
} from './dto/alias.dto.js';
import { displayAlias, normalizeAlias } from './alias-normalization.js';
import { parsePositiveBigInt } from '../../common/pipes/positive-bigint.pipe.js';

type Kind = 'PRODUCT' | 'UNIT';
type AliasRow = {
  id: string;
  targetId: string;
  targetName: string;
  aliasName: string;
  isActive: boolean;
};

function tables(kind: Kind) {
  return kind === 'PRODUCT'
    ? {
        table: Prisma.sql`product_alias`,
        id: Prisma.sql`product_alias_id`,
        fk: Prisma.sql`product_id`,
        target: Prisma.sql`product`,
        name: Prisma.sql`product_name`,
      }
    : {
        table: Prisma.sql`unit_alias`,
        id: Prisma.sql`unit_alias_id`,
        fk: Prisma.sql`unit_id`,
        target: Prisma.sql`unit`,
        name: Prisma.sql`unit_name`,
      };
}

@Injectable()
export class AliasService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: AliasQueryDto) {
    const t = tables(query.kind);
    const search = '%' + (query.search ?? '').replace(/[\\%_]/g, '\\$&') + '%';
    const targetId = query.targetId
      ? parsePositiveBigInt(query.targetId)
      : undefined;
    const where = Prisma.sql`WHERE (a.alias_name ILIKE ${search} OR p.${t.name} ILIKE ${search}) ${targetId ? Prisma.sql`AND a.${t.fk} = ${targetId}` : Prisma.empty}`;
    const [rows, counts] = await Promise.all([
      this.prisma.$queryRaw<AliasRow[]>(
        Prisma.sql`SELECT a.${t.id}::text AS id, a.${t.fk}::text AS "targetId", a.alias_name AS "aliasName", p.${t.name} AS "targetName", p.is_active AS "isActive" FROM ${t.table} a JOIN ${t.target} p ON p.${t.fk}=a.${t.fk} ${where} ORDER BY a.${t.id} DESC LIMIT ${query.limit} OFFSET ${(query.page - 1) * query.limit}`,
      ),
      this.prisma.$queryRaw<{ count: bigint }[]>(
        Prisma.sql`SELECT count(*) AS count FROM ${t.table} a JOIN ${t.target} p ON p.${t.fk}=a.${t.fk} ${where}`,
      ),
    ]);
    return {
      rows,
      total: Number(counts[0].count),
      page: query.page,
      limit: query.limit,
    };
  }

  async targets(query: AliasQueryDto) {
    const t = tables(query.kind);
    const search = '%' + (query.search ?? '').replace(/[\\%_]/g, '\\$&') + '%';
    return this.prisma.$queryRaw<{ id: string; name: string }[]>(
      Prisma.sql`SELECT ${t.fk}::text AS id, ${t.name} AS name FROM ${t.target} WHERE is_active = TRUE AND ${t.name} ILIKE ${search} ORDER BY ${t.name}, ${t.fk} LIMIT 50`,
    );
  }

  private async validateName(
    tx: Prisma.TransactionClient,
    kind: Kind,
    targetId: bigint,
    raw: string,
    exceptId?: bigint,
  ) {
    const name = displayAlias(raw);
    if (!name || name.length > (kind === 'UNIT' ? 100 : 255))
      throw new BadRequestException(
        'Alias wajib diisi dan tidak boleh terlalu panjang.',
      );
    const t = tables(kind);
    const key = normalizeAlias(name);
    const duplicate = await tx.$queryRaw<{ id: bigint }[]>(
      Prisma.sql`SELECT ${t.id} AS id FROM ${t.table} WHERE lower(regexp_replace(btrim(alias_name), '[[:space:]]+', ' ', 'g')) = ${key} ${exceptId ? Prisma.sql`AND ${t.id} <> ${exceptId}` : Prisma.empty} LIMIT 1`,
    );
    if (duplicate.length)
      throw new ConflictException('Alias sudah digunakan. Gunakan nama lain.');
    const names = await tx.$queryRaw<{ id: bigint }[]>(
      Prisma.sql`SELECT ${t.fk} AS id FROM ${t.target} WHERE lower(regexp_replace(btrim(${t.name}), '[[:space:]]+', ' ', 'g')) = ${key} LIMIT 1`,
    );
    if (names.length)
      throw new ConflictException(
        names[0].id === targetId
          ? 'Nama resmi sudah dikenali tanpa perlu alias.'
          : 'Alias sama dengan nama resmi produk/satuan lain.',
      );
    return name;
  }

  private async log(
    tx: Prisma.TransactionClient,
    actor: bigint,
    kind: Kind,
    id: bigint,
    operation: 'CREATE' | 'UPDATE' | 'DELETE',
    before: Record<string, unknown> | null,
    after: Record<string, unknown> | null,
    transactionId: string,
  ) {
    const entityType = kind === 'PRODUCT' ? 'ProductAlias' : 'UnitAlias';
    const alias = after?.aliasName ?? before?.aliasName;
    await writeActivityLog(tx, {
      userId: actor,
      activityType: operation,
      module: 'PRICING',
      entityType,
      entityId: id,
      description: `${operation} alias ${kind === 'PRODUCT' ? 'produk' : 'satuan'}: ${typeof alias === 'string' ? alias : ''}`,
    });
    await writeAuditLog(tx, {
      userId: actor,
      transactionId,
      operation,
      module: 'PRICING',
      entityType,
      entityId: id,
      source: 'ALIAS_MANAGEMENT',
      changedFields: changedFields(before, after),
    });
  }

  async create(actor: bigint, dto: CreateAliasesDto) {
    const keys = dto.aliases.map(normalizeAlias);
    if (new Set(keys).size !== keys.length)
      throw new ConflictException('Terdapat alias yang sama pada daftar.');
    return this.prisma.$transaction(
      async (tx) => {
        // Serializes normalized uniqueness checks, including batch saves and edit/delete.
        // The function returns PostgreSQL `void`, which Prisma cannot deserialize
        // through $queryRaw. $executeRaw acquires the same transaction lock
        // without attempting to map that unsupported return value.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(76103, 1)`;
        const targetId = parsePositiveBigInt(dto.targetId);
        const target =
          dto.kind === 'PRODUCT'
            ? await tx.product.findUnique({ where: { productId: targetId } })
            : await tx.unit.findUnique({ where: { unitId: targetId } });
        if (!target?.isActive)
          throw new BadRequestException('Pilih produk/satuan yang aktif.');
        const transactionId = createAuditTransactionId();
        for (const raw of dto.aliases) {
          const aliasName = await this.validateName(
            tx,
            dto.kind,
            targetId,
            raw,
          );
          const row =
            dto.kind === 'PRODUCT'
              ? await tx.productAlias.create({
                  data: { productId: targetId, aliasName, createdBy: actor },
                })
              : await tx.unitAlias.create({
                  data: { unitId: targetId, aliasName, createdBy: actor },
                });
          const id =
            'productAliasId' in row ? row.productAliasId : row.unitAliasId;
          await this.log(
            tx,
            actor,
            dto.kind,
            id,
            'CREATE',
            null,
            { targetId, aliasName },
            transactionId,
          );
        }
        return { count: dto.aliases.length };
      },
      { timeout: 15000 },
    );
  }

  async change(
    actor: bigint,
    id: bigint,
    dto: ChangeAliasDto | DeleteAliasDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(76103, 1)`;
      const row =
        dto.kind === 'PRODUCT'
          ? await tx.productAlias.findUnique({ where: { productAliasId: id } })
          : await tx.unitAlias.findUnique({ where: { unitAliasId: id } });
      if (!row) throw new NotFoundException('Alias tidak ditemukan.');
      if (row.aliasName !== dto.originalName)
        throw new ConflictException(
          'Alias telah diubah pengguna lain. Muat ulang daftar.',
        );
      const targetId = 'productId' in row ? row.productId : row.unitId;
      const before = { targetId, aliasName: row.aliasName };
      const aliasName =
        'aliasName' in dto
          ? await this.validateName(tx, dto.kind, targetId, dto.aliasName, id)
          : null;
      if (aliasName === row.aliasName) return { id: id.toString() };
      if (dto.kind === 'PRODUCT') {
        if (aliasName !== null)
          await tx.productAlias.update({
            where: { productAliasId: id },
            data: { aliasName },
          });
        else await tx.productAlias.delete({ where: { productAliasId: id } });
      } else {
        if (aliasName !== null)
          await tx.unitAlias.update({
            where: { unitAliasId: id },
            data: { aliasName },
          });
        else await tx.unitAlias.delete({ where: { unitAliasId: id } });
      }
      await this.log(
        tx,
        actor,
        dto.kind,
        id,
        aliasName === null ? 'DELETE' : 'UPDATE',
        before,
        aliasName === null ? null : { targetId, aliasName },
        createAuditTransactionId(),
      );
      return { id: id.toString() };
    });
  }
}
