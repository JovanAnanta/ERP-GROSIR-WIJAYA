import { PrismaService } from '../../../database/prisma.service.js';
import { jest } from '@jest/globals';
import { CurrentUserWithRole, UserService } from './user.service.js';

describe('UserService resetPassword', () => {
  it('revokes every active session in the password-reset transaction', async () => {
    const target = {
      userId: BigInt(2),
      username: 'owner',
      roleId: BigInt(2),
      role: { roleCode: 'OWNER' },
    };
    const tx = {
      user: { update: jest.fn().mockResolvedValue(target) },
      userSession: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
      activityLog: { create: jest.fn().mockResolvedValue({}) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
      securityLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(target) },
      $transaction: jest
        .fn()
        .mockImplementation(async (callback: (client: typeof tx) => unknown) =>
          callback(tx),
        ),
    } as unknown as PrismaService;
    const service = new UserService(prisma);
    const currentUser = {
      userId: BigInt(2),
      role: { roleCode: 'OWNER' },
    } as CurrentUserWithRole;

    await service.resetPassword(
      currentUser,
      BigInt(2),
      'newPassword1',
      '127.0.0.1',
      'jest',
    );

    expect(tx.userSession.updateMany).toHaveBeenCalledWith({
      where: { userId: BigInt(2), revokedAt: null },
      data: {
        revokedAt: expect.any(Date),
        revokeReason: 'Password Reset',
      },
    });
  });
});
