import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { jest } from '@jest/globals';
import { PrismaService } from '../../database/prisma.service.js';
import { PERMISSIONS } from '../authorization/permission-catalog.js';
import { PermissionGuard } from './permissions.guard.js';

function contextFor(roleCode: string): ExecutionContext {
  return {
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: () => ({
      getRequest: () => ({
        user: { userId: BigInt(7), roleId: BigInt(3), role: { roleCode } },
        ip: '127.0.0.1',
        method: 'POST',
        originalUrl: '/api/v1/purchasing/orders',
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('PermissionGuard', () => {
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue([PERMISSIONS.PURCHASE_CREATE]),
  } as unknown as Reflector;

  it.each(['SUPER_OWNER', 'OWNER'])(
    'grants fixed full access to %s',
    async (roleCode) => {
      const findMany = jest.fn();
      const prisma = {
        rolePermission: { findMany },
      } as unknown as PrismaService;
      await expect(
        new PermissionGuard(reflector, prisma).canActivate(
          contextFor(roleCode),
        ),
      ).resolves.toBe(true);
      expect(findMany).not.toHaveBeenCalled();
    },
  );

  it('grants Admin only when every required active permission exists', async () => {
    const prisma = {
      rolePermission: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { permission: { permissionCode: PERMISSIONS.PURCHASE_CREATE } },
          ]),
      },
    } as unknown as PrismaService;

    await expect(
      new PermissionGuard(reflector, prisma).canActivate(contextFor('ADMIN')),
    ).resolves.toBe(true);
  });

  it('rejects and logs a direct API bypass attempt', async () => {
    const createSecurityLog = jest.fn().mockResolvedValue({});
    const prisma = {
      rolePermission: { findMany: jest.fn().mockResolvedValue([]) },
      securityLog: { create: createSecurityLog },
    } as unknown as PrismaService;

    await expect(
      new PermissionGuard(reflector, prisma).canActivate(contextFor('ADMIN')),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(createSecurityLog).toHaveBeenCalled();
  });
});
