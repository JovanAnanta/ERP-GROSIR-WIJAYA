import { HttpException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { DashboardService } from './dashboard.service.js';

describe('DashboardService input safety', () => {
  const service = new DashboardService({} as PrismaService);

  it('menolak rentang tanggal terbalik sebelum menjalankan query', async () => {
    await expect(
      service.sales({
        dateFrom: '2026-09-09',
        dateTo: '2026-09-01',
        topLimit: 10,
      }),
    ).rejects.toBeInstanceOf(HttpException);
  });

  it('menolak rentang lebih dari lima tahun', async () => {
    await expect(
      service.finance({
        dateFrom: '2020-01-01',
        dateTo: '2026-09-09',
        topLimit: 10,
      }),
    ).rejects.toBeInstanceOf(HttpException);
  });
});
