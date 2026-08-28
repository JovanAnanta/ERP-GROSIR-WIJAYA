import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { UpdateSystemConfigurationDto } from './dto/system-configuration.dto.js';
import type {
  Prisma,
  SystemConfiguration,
} from '../../../../generated/prisma/client.js';

export interface ConfigResponse extends SystemConfiguration {
  currency: string;
  timezone: string;
  dateFormat: string;
  quantityDecimal: number;
  priceDecimal: number;
  language: string;
}

@Injectable()
export class SystemConfigurationService {
  constructor(private readonly prisma: PrismaService) {}

  async getConfig(): Promise<ConfigResponse> {
    const config: SystemConfiguration | null =
      await this.prisma.systemConfiguration.findUnique({
        where: { id: 1 },
      });

    const defaultConfig = {
      currency: 'IDR',
      timezone: 'Asia/Jakarta',
      dateFormat: 'DD/MM/YYYY',
      quantityDecimal: 3,
      priceDecimal: 2,
      language: 'Bahasa Indonesia',
    };

    if (!config) {
      return {
        id: 1,
        companyName: '',
        address: '',
        phone: '',
        logoBase64: null,
        receiptHeader1: null,
        receiptHeader2: null,
        receiptHeader3: null,
        receiptFooter1: null,
        receiptFooter2: null,
        receiptFooter3: null,
        updatedAt: new Date(),
        updatedBy: null,
        ...defaultConfig,
      };
    }

    return {
      ...config,
      ...defaultConfig,
    };
  }

  async updateConfig(
    userId: bigint,
    dto: UpdateSystemConfigurationDto,
    ip: string,
    ua: string,
  ): Promise<void> {
    const existing: SystemConfiguration | null =
      await this.prisma.systemConfiguration.findUnique({
        where: { id: 1 },
      });

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const savedConfig: SystemConfiguration =
        await tx.systemConfiguration.upsert({
          where: { id: 1 },
          update: { ...dto, updatedBy: userId, updatedAt: new Date() },
          create: { ...dto, id: 1, updatedBy: userId },
        });

      const now = new Date();

      await tx.activityLog.create({
        data: {
          userId,
          activityType: 'SYSTEM_CONFIG_UPDATED',
          entityType: 'CONFIGURATION',
          description: `Memperbarui System Configuration`,
          createdAt: now,
        },
      });

      const changedFieldsPayload: Record<string, unknown> = {
        oldName: existing?.companyName ?? '',
        newName: savedConfig.companyName,
      };

      await tx.auditLog.create({
        data: {
          userId,
          action: 'UPDATE_CONFIG',
          entityType: 'CONFIGURATION',
          entityId: BigInt(1),
          changedFields: changedFieldsPayload as Prisma.InputJsonValue,
          ipAddress: ip,
          userAgent: ua,
          createdAt: now,
        },
      });
    });
  }
}
