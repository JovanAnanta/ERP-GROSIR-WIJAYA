import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { FifoLayerListQueryDto } from './fifo.dto.js';

describe('FifoLayerListQueryDto', () => {
  it('accepts supported filters and page sizes', async () => {
    const dto = plainToInstance(FifoLayerListQueryDto, {
      page: '2',
      limit: '50',
      originType: 'PURCHASE_INVOICE',
      status: 'ACTIVE',
      dateFrom: '2026-08-01',
      dateTo: '2026-09-01',
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects malformed identifiers and unbounded page sizes', async () => {
    const dto = plainToInstance(FifoLayerListQueryDto, {
      productId: 'abc',
      limit: '1000000',
      originType: 'UNKNOWN',
    });
    const errors = await validate(dto);
    expect(errors.map((item) => item.property).sort()).toEqual([
      'limit',
      'originType',
      'productId',
    ]);
  });
});
