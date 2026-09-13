import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { jest } from '@jest/globals';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard.js';

describe('RolesGuard', () => {
  const createContext = (roleCode?: string) =>
    ({
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({
        getRequest: () =>
          roleCode ? { user: { role: { roleCode } } } : { user: undefined },
      }),
    }) as unknown as ExecutionContext;

  it('allows a configured role', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(['SUPER_OWNER']),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    await expect(guard.canActivate(createContext('SUPER_OWNER'))).resolves.toBe(
      true,
    );
  });

  it('rejects direct API access from a role that is not configured', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(['SUPER_OWNER', 'OWNER']),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    await expect(guard.canActivate(createContext('ADMIN'))).rejects.toThrow(
      ForbiddenException,
    );
  });
});
