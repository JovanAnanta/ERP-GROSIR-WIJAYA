import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../database/prisma.service.js';
import {
  orderTextLines,
  productCandidates,
  parseOrderText,
  type ProductWord,
  type UnitWord,
} from './whatsapp-parser.js';
import { WhatsappImportDto } from './dto/whatsapp-import.dto.js';
import { parsePositiveBigInt } from '../../common/pipes/positive-bigint.pipe.js';

@Injectable()
export class WhatsappImportService {
  constructor(private readonly prisma: PrismaService) {}

  async parse(dto: WhatsappImportDto) {
    const lines = orderTextLines(dto.text);
    if (
      !lines.length ||
      lines.length > 100 ||
      lines.some((line) => line.length > 300 || line.split(/\s+/).length > 40)
    )
      throw new BadRequestException(
        'Gunakan 1–100 baris pesanan; maksimal 300 karakter dan 40 kata per baris.',
      );
    const customerId = dto.customerId
      ? parsePositiveBigInt(dto.customerId)
      : undefined;
    if (
      customerId &&
      !(await this.prisma.customer.findFirst({
        where: { customerId, isActive: true },
        select: { customerId: true },
      }))
    )
      throw new BadRequestException(
        'Customer tidak aktif atau tidak ditemukan.',
      );
    const candidates = productCandidates(lines);
    const normalized = Prisma.sql`lower(regexp_replace(btrim(product_name), '[[:space:]]+', ' ', 'g'))`;
    const [words, unitWords] = await Promise.all([
      this.prisma.$queryRaw<ProductWord[]>(Prisma.sql`
        SELECT ${normalized} AS key, product_id::text AS "productId", TRUE AS official FROM product WHERE is_active AND ${normalized} IN (${Prisma.join(candidates)})
        UNION ALL
        SELECT lower(regexp_replace(btrim(a.alias_name), '[[:space:]]+', ' ', 'g')) AS key, a.product_id::text AS "productId", FALSE AS official FROM product_alias a JOIN product p ON p.product_id=a.product_id WHERE p.is_active AND lower(regexp_replace(btrim(a.alias_name), '[[:space:]]+', ' ', 'g')) IN (${Prisma.join(candidates)})`),
      this.prisma.$queryRaw<UnitWord[]>(Prisma.sql`
        SELECT lower(regexp_replace(btrim(unit_name), '[[:space:]]+', ' ', 'g')) AS key, unit_id::text AS "unitId", TRUE AS official FROM unit WHERE is_active
        UNION ALL
        SELECT lower(regexp_replace(btrim(a.alias_name), '[[:space:]]+', ' ', 'g')) AS key, a.unit_id::text AS "unitId", FALSE AS official FROM unit_alias a JOIN unit u ON u.unit_id=a.unit_id WHERE u.is_active`),
    ]);
    const parsed = parseOrderText(lines, words, unitWords);
    if (parsed.length > 200)
      throw new BadRequestException(
        'Hasil import maksimal 200 baris. Bagi pesan menjadi beberapa bagian.',
      );
    const productIds = [
      ...new Set(
        parsed.flatMap((row) => (row.productId ? [BigInt(row.productId)] : [])),
      ),
    ];
    const units = await this.prisma.productUnit.findMany({
      where: {
        productId: { in: productIds },
        isActive: true,
        unit: { isActive: true },
      },
      include: {
        unit: true,
        product: true,
        guestPrices: { orderBy: { updatedAt: 'desc' }, take: 1 },
        customerPrices: {
          where: { customerId: customerId ?? -1n },
          orderBy: { updatedAt: 'desc' },
          take: 1,
        },
      },
    });
    return {
      rows: parsed.map((row) => {
        const options = units.filter(
          (unit) => unit.productId.toString() === row.productId,
        );
        const matching = row.unitId
          ? options.filter((unit) => unit.unitId.toString() === row.unitId)
          : [];
        const historical = options.filter(
          (unit) => unit.customerPrices.length > 0,
        );
        const inferred =
          row.unitId === null &&
          row.reviewReasons.includes('Pilih satuan') &&
          customerId &&
          historical.length === 1;
        const chosen = inferred
          ? historical[0]
          : matching.length === 1
            ? matching[0]
            : undefined;
        const reasons = [...row.reviewReasons];
        if (inferred) {
          reasons.splice(reasons.indexOf('Pilih satuan'), 1);
          reasons.push('Satuan dari histori; periksa kembali');
        }
        if (row.unitId && !chosen)
          reasons.push('Satuan tidak tersedia atau ambigu untuk produk ini');
        const price =
          chosen?.customerPrices[0]?.suggestedPrice ??
          chosen?.guestPrices[0]?.suggestedPrice;
        if (chosen && price === undefined) reasons.push('Harga belum tersedia');
        return {
          sourceText: row.sourceText,
          productId: row.productId ?? '',
          productName:
            chosen?.product.productName ??
            options[0]?.product.productName ??
            '',
          productUnitId: chosen?.productUnitId.toString() ?? '',
          quantity: row.quantity,
          unitPrice: price === undefined ? null : Number(price),
          reviewReasons: [...new Set(reasons)],
        };
      }),
    };
  }
}
