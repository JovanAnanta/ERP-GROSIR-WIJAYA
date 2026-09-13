import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { jest } from '@jest/globals';

describe('AuthController current user', () => {
  it('returns only the frontend-safe current user fields', async () => {
    const authService = {
      getEffectivePermissions: jest.fn().mockResolvedValue(['*']),
    } as unknown as AuthService;
    const controller = new AuthController(authService);
    const result = await controller.getCurrentUser({
      user: {
        userId: BigInt(7),
        username: 'owner',
        fullName: 'Owner Wijaya',
        roleId: BigInt(2),
        passwordHash: 'must-not-leak',
        role: { roleCode: 'OWNER' },
      },
    } as never);

    expect(result).toEqual({
      userId: '7',
      username: 'owner',
      fullName: 'Owner Wijaya',
      roleId: '2',
      permissions: ['*'],
    });
    expect(result).not.toHaveProperty('passwordHash');
    expect(result).not.toHaveProperty('sessionTokenHash');
  });

  it('sets an HttpOnly secure cookie in production login', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const authService = {
      login: jest.fn().mockResolvedValue({
        token: 'plain-token-only-for-cookie',
        user: {
          userId: BigInt(7),
          username: 'owner',
          fullName: 'Owner Wijaya',
          roleId: BigInt(2),
        },
      }),
      getEffectivePermissions: jest.fn().mockResolvedValue(['*']),
    } as unknown as AuthService;
    const json = jest.fn();
    const response = {
      cookie: jest.fn(),
      status: jest.fn().mockReturnValue({ json }),
    };
    const controller = new AuthController(authService);

    await controller.login(
      { username: 'owner', password: 'validPassword1' },
      { socket: { remoteAddress: '127.0.0.1' } } as never,
      response as never,
      '127.0.0.1',
      'jest',
      'device-1',
    );

    expect(response.cookie).toHaveBeenCalledWith(
      'erp_session',
      'plain-token-only-for-cookie',
      expect.objectContaining({
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
      }),
    );
    expect(json.mock.calls.flat().join(' ')).not.toContain(
      'plain-token-only-for-cookie',
    );

    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  });
});
