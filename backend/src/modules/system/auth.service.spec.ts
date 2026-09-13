import { HttpStatus } from '@nestjs/common';
import { jest } from '@jest/globals';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../database/prisma.service.js';
import { SESSION_ABSOLUTE_TTL_MS } from './auth.constants.js';
import { AuthService } from './auth.service.js';

describe('AuthService', () => {
  let passwordHash: string;

  beforeAll(async () => {
    passwordHash = await bcrypt.hash('validPassword1', 4);
  });

  const user = (isActive = true) => ({
    userId: BigInt(1),
    username: 'admin',
    passwordHash,
    fullName: 'Administrator',
    roleId: BigInt(1),
    isActive,
    lastLoginAt: null,
    lastLoginIp: null,
    createdAt: new Date(),
    createdBy: null,
    updatedAt: null,
    updatedBy: null,
  });

  it('creates a hashed opaque session for valid credentials', async () => {
    const tx = {
      userSession: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn().mockResolvedValue({}),
      },
      user: { update: jest.fn().mockResolvedValue({}) },
      securityLog: { create: jest.fn().mockResolvedValue({}) },
      activityLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(user()) },
      securityLog: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest
        .fn()
        .mockImplementation(async (callback: (client: typeof tx) => unknown) =>
          callback(tx),
        ),
    } as unknown as PrismaService;
    const service = new AuthService(prisma);

    const result = await service.login({
      username: 'admin',
      password: 'validPassword1',
      ip: '127.0.0.1',
      userAgent: 'jest',
      deviceId: 'test-device',
    });

    expect(result.token).not.toHaveLength(0);
    expect(tx.userSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          deviceIdentifier: 'test-device',
          sessionTokenHash: expect.not.stringContaining(result.token),
        }),
      }),
    );
  });

  it('rejects an unknown username with a generic credential error', async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(null) },
      securityLog: { create: jest.fn().mockResolvedValue({}) },
      activityLog: { create: jest.fn().mockResolvedValue({}) },
    } as unknown as PrismaService;
    const service = new AuthService(prisma);

    await expect(
      service.login({
        username: 'missing',
        password: 'wrong',
        ip: '127.0.0.1',
        userAgent: 'jest',
        deviceId: 'test-device',
      }),
    ).rejects.toMatchObject({
      status: HttpStatus.UNAUTHORIZED,
      message: 'Username atau Password salah.',
    });
  });

  it('rejects an inactive user', async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(user(false)) },
      securityLog: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      },
    } as unknown as PrismaService;
    const service = new AuthService(prisma);

    await expect(
      service.login({
        username: 'admin',
        password: 'validPassword1',
        ip: '127.0.0.1',
        userAgent: 'jest',
        deviceId: 'test-device',
      }),
    ).rejects.toMatchObject({ status: HttpStatus.FORBIDDEN });
  });

  it('rejects a user while the account lock is active', async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(user()) },
      activityLog: { findFirst: jest.fn().mockResolvedValue(null) },
      securityLog: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({ createdAt: new Date() })
          .mockResolvedValueOnce(null),
        create: jest.fn().mockResolvedValue({}),
      },
    } as unknown as PrismaService;
    const service = new AuthService(prisma);

    await expect(
      service.login({
        username: 'admin',
        password: 'validPassword1',
        ip: '127.0.0.1',
        userAgent: 'jest',
        deviceId: 'test-device',
      }),
    ).rejects.toMatchObject({ status: HttpStatus.FORBIDDEN });
  });

  it('does not allow unlock to extend absolute expiration', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      userSession: {
        findUnique: jest.fn().mockResolvedValue({
          sessionId: BigInt(1),
          userId: BigInt(1),
          revokedAt: null,
          createdAt: new Date(Date.now() - SESSION_ABSOLUTE_TTL_MS - 1),
          expiresAt: new Date(Date.now() + SESSION_ABSOLUTE_TTL_MS),
          user: user(),
        }),
        updateMany,
      },
    } as unknown as PrismaService;
    const service = new AuthService(prisma);

    await expect(
      service.unlockSession(
        'expired-token',
        'validPassword1',
        '127.0.0.1',
        'jest',
      ),
    ).rejects.toMatchObject({ status: HttpStatus.UNAUTHORIZED });
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          revokeReason: 'Absolute session expired',
        }),
      }),
    );
  });

  it('unlocks an idle session without changing absolute expiresAt', async () => {
    const update = jest.fn().mockResolvedValue({});
    const prisma = {
      userSession: {
        findUnique: jest.fn().mockResolvedValue({
          sessionId: BigInt(1),
          userId: BigInt(1),
          revokedAt: null,
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + SESSION_ABSOLUTE_TTL_MS),
          user: user(),
        }),
        update,
      },
      securityLog: { create: jest.fn().mockResolvedValue({}) },
    } as unknown as PrismaService;
    const service = new AuthService(prisma);

    await expect(
      service.unlockSession(
        'valid-token',
        'validPassword1',
        '127.0.0.1',
        'jest',
      ),
    ).resolves.toEqual({ success: true });
    expect(update).toHaveBeenCalledWith({
      where: { sessionId: BigInt(1) },
      data: { lastActivityAt: expect.any(Date) },
    });
    expect(update.mock.calls[0]?.[0]?.data).not.toHaveProperty('expiresAt');
  });

  it('revokes the current session during logout', async () => {
    const update = jest.fn().mockResolvedValue({});
    const tx = {
      userSession: { update },
      securityLog: { create: jest.fn().mockResolvedValue({}) },
      activityLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      userSession: {
        findUnique: jest.fn().mockResolvedValue({
          sessionId: BigInt(9),
          userId: BigInt(1),
          revokedAt: null,
        }),
      },
      $transaction: jest
        .fn()
        .mockImplementation(async (callback: (client: typeof tx) => unknown) =>
          callback(tx),
        ),
    } as unknown as PrismaService;
    const service = new AuthService(prisma);

    await service.logout('valid-token', '127.0.0.1', 'jest');

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sessionId: BigInt(9) },
        data: expect.objectContaining({ revokeReason: 'User Logout' }),
      }),
    );
  });
});
