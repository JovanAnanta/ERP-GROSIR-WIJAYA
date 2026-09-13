import { jest } from '@jest/globals';
import { Prisma } from '../../../generated/prisma/client.js';
import { generateBusinessDocumentNumber } from './transaction-number.utils.js';

describe('financial business document numbering', () => {
  it('generates a serialized AP ledger number from supplier transactions', async () => {
    const executeRaw = jest.fn<any>().mockResolvedValue(0);
    const queryRawUnsafe = jest
      .fn<any>()
      .mockResolvedValue([{ value: 'AP-040926-0000008' }]);
    const tx = {
      $executeRaw: executeRaw,
      $queryRawUnsafe: queryRawUnsafe,
    } as unknown as Prisma.TransactionClient;

    await expect(
      generateBusinessDocumentNumber(tx, 'AP', new Date('2026-09-04')),
    ).resolves.toBe('AP-040926-0000009');
    expect(queryRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('supplier_account_transaction'),
      'AP-040926-%',
    );
    expect(executeRaw).toHaveBeenCalledTimes(1);
  });
});
