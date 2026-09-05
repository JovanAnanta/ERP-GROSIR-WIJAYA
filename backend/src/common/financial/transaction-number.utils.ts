import { Prisma } from '../../../generated/prisma/client.js';

function stamp(date: Date) {
  return `${String(date.getDate()).padStart(2, '0')}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getFullYear()).slice(-2)}`;
}

export async function generateBusinessDocumentNumber(
  tx: Prisma.TransactionClient,
  kind: 'SO' | 'SI' | 'SR' | 'SP' | 'AR' | 'AP',
  date = new Date(),
) {
  const prefix = `${kind}-${stamp(date)}-`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`DOCUMENT_NUMBER:${prefix}`}))`;
  const table =
    kind === 'SO'
      ? 'sales_order'
      : kind === 'SI'
        ? 'sales_invoice'
        : kind === 'SR'
          ? 'sales_return'
        : kind === 'SP'
          ? 'sales_invoice_payment'
          : kind === 'AR'
            ? 'customer_account_transaction'
            : 'supplier_account_transaction';
  const column =
    kind === 'SO'
      ? 'sales_order_number'
      : kind === 'SI'
        ? 'sales_invoice_number'
        : kind === 'SR'
          ? 'sales_return_number'
        : kind === 'SP'
          ? 'payment_number'
          : 'transaction_number';
  const rows = await tx.$queryRawUnsafe<Array<{ value: string }>>(
    `SELECT ${column} AS value FROM ${table} WHERE ${column} LIKE $1 ORDER BY ${column} DESC LIMIT 1`,
    `${prefix}%`,
  );
  const next = rows[0] ? Number(rows[0].value.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(next).padStart(7, '0')}`;
}

export async function generateFinancialAccountTransactionNumber(
  tx: Prisma.TransactionClient,
  date = new Date(),
) {
  const prefix = `FA-${stamp(date)}-`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`FINANCIAL_TRANSACTION_NUMBER:${prefix}`}))`;
  const last = await tx.financialAccountTransaction.findFirst({
    where: { transactionNumber: { startsWith: prefix } },
    orderBy: { transactionNumber: 'desc' },
    select: { transactionNumber: true },
  });
  const next = last
    ? Number(last.transactionNumber.slice(prefix.length)) + 1
    : 1;
  return `${prefix}${String(next).padStart(7, '0')}`;
}
