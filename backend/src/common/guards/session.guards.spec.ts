import { ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { jest } from '@jest/globals';
import * as crypto from 'crypto';
import { PrismaService } from '../../database/prisma.service.js';
import { SESSION_ABSOLUTE_TTL_MS } from '../../modules/system/auth.constants.js';
import { SessionGuard } from './session.guards.js';

describe('SessionGuard', () => {
  const token = 'opaque-session-token';
  const createContext = (request: Record<string, unknown>) =>
    ({
      switchToHttp: () => ({ getRequest: () => request }),
    }) as unknown as ExecutionContext;

  const createSession = (overrides: Record<string, unknown> = {}) => {
    const now = Date.now();
    return {
      sessionId: BigInt(1),
      sessionTokenHash: crypto.createHash('sha256').update(token).digest('hex'),
      createdAt: new Date(now - 60_000),
      lastActivityAt: new Date(now - 1_000),
      expiresAt: new Date(now + SESSION_ABSOLUTE_TTL_MS),
      revokedAt: null,
      user: {
        userId: BigInt(1),
        roleId: BigInt(1),
        isActive: true,
        role: { roleCode: 'SUPER_OWNER' },
      },
      ...overrides,
    };
  };

  it('rejects a request without a session cookie', async () => {
    const prisma = { userSession: {} } as unknown as PrismaService;
    const guard = new SessionGuard(prisma);

    await expect(
      guard.canActivate(createContext({ cookies: {} })),
    ).rejects.toMatchObject({ status: HttpStatus.UNAUTHORIZED });
  });

  it('revokes and rejects an absolutely expired session', async () => {
    const session = createSession({
      createdAt: new Date(Date.now() - SESSION_ABSOLUTE_TTL_MS - 1),
    });
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      userSession: {
        findUnique: jest.fn().mockResolvedValue(session),
        updateMany,
      },
    } as unknown as PrismaService;
    const guard = new SessionGuard(prisma);

    await expect(
      guard.canActivate(createContext({ cookies: { erp_session: token } })),
    ).rejects.toMatchObject({ status: HttpStatus.UNAUTHORIZED });
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          revokeReason: 'Absolute session expired',
        }),
      }),
    );
  });

  it('rejects a revoked session', async () => {
    const prisma = {
      userSession: {
        findUnique: jest
          .fn()
          .mockResolvedValue(createSession({ revokedAt: new Date() })),
      },
    } as unknown as PrismaService;
    const guard = new SessionGuard(prisma);

    await expect(
      guard.canActivate(createContext({ cookies: { erp_session: token } })),
    ).rejects.toMatchObject({ status: HttpStatus.UNAUTHORIZED });
  });

  it('rejects an idle session without revoking its absolute lifetime', async () => {
    const session = createSession({
      lastActivityAt: new Date(Date.now() - 31 * 60 * 1000),
    });
    const prisma = {
      userSession: {
        findUnique: jest.fn().mockResolvedValue(session),
        updateMany: jest.fn(),
      },
    } as unknown as PrismaService;
    const guard = new SessionGuard(prisma);

    try {
      await guard.canActivate(
        createContext({ cookies: { erp_session: token } }),
      );
      throw new Error('Expected idle session to be rejected');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(HttpStatus.FORBIDDEN);
      expect((error as HttpException).message).toBe('Session_Locked_Idle');
    }
  });

  it('attaches the user and synchronously records valid activity', async () => {
    const session = createSession();
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      userSession: {
        findUnique: jest.fn().mockResolvedValue(session),
        updateMany,
      },
    } as unknown as PrismaService;
    const guard = new SessionGuard(prisma);
    const request: Record<string, unknown> = {
      cookies: { erp_session: token },
    };

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
    expect(request.user).toBe(session.user);
    expect(updateMany).toHaveBeenCalledTimes(1);
  });
});
