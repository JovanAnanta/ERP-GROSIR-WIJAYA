import {
  changedFields,
  createAuditTransactionId,
  toLogJson,
  writeActivityLog,
  writeAuditLog,
} from './business-logger.js';
import { jest } from '@jest/globals';

describe('business logger', () => {
  it('stores only fields that changed using before/after values', () => {
    expect(
      changedFields(
        { name: 'Lama', active: true, quantity: BigInt(2) },
        { name: 'Baru', active: true, quantity: BigInt(3) },
      ),
    ).toEqual({
      name: { before: 'Lama', after: 'Baru' },
      quantity: { before: '2', after: '3' },
    });
  });

  it('redacts sensitive keys recursively', () => {
    expect(
      toLogJson({
        username: 'owner',
        password: 'secret',
        nested: { sessionToken: 'raw', safe: true },
      }),
    ).toEqual({
      username: 'owner',
      nested: { safe: true },
    });
  });

  it('groups activity and audit writes without duplicating their payload purpose', async () => {
    const activityCreate = jest.fn().mockResolvedValue({});
    const auditCreate = jest.fn().mockResolvedValue({});
    const tx = {
      activityLog: { create: activityCreate },
      auditLog: { create: auditCreate },
    } as never;
    const transactionId = createAuditTransactionId();
    await writeActivityLog(tx, {
      userId: BigInt(1),
      activityType: 'UPDATE',
      module: 'PRODUCT',
      entityType: 'PRODUCT',
      entityId: BigInt(2),
      description: 'Memperbarui produk Kopi',
    });
    await writeAuditLog(tx, {
      userId: BigInt(1),
      transactionId,
      module: 'PRODUCT',
      operation: 'UPDATE',
      entityType: 'PRODUCT',
      entityId: BigInt(2),
      source: 'Updated via Product Master',
      changedFields: changedFields({ name: 'A' }, { name: 'B' }),
    });
    expect(activityCreate).toHaveBeenCalledTimes(1);
    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          transactionId,
          changedFields: { name: { before: 'A', after: 'B' } },
        }),
      }),
    );
  });
});
