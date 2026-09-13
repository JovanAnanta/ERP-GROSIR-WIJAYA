import { ArgumentsHost, HttpException, Logger } from '@nestjs/common';
import { jest } from '@jest/globals';
import { GlobalExceptionFilter } from './global-exception.filter.js';

describe('GlobalExceptionFilter', () => {
  it('does not expose an unknown internal error message', () => {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({
          method: 'GET',
          originalUrl: '/api/v1/test',
          url: '/api/v1/test',
        }),
      }),
    } as unknown as ArgumentsHost;
    const logSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();

    new GlobalExceptionFilter().catch(
      new Error('DATABASE_URL=postgresql://secret-host/internal'),
      host,
    );

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      success: false,
      category: 'System Error',
      message: 'Terjadi kesalahan sistem internal.',
    });
    expect(logSpy.mock.calls.flat().join(' ')).not.toContain('secret-host');
    logSpy.mockRestore();
  });

  it('does not expose a raw message from an internal HttpException', () => {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({ method: 'POST', url: '/api/v1/test' }),
      }),
    } as unknown as ArgumentsHost;
    const logSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();

    new GlobalExceptionFilter().catch(
      new HttpException('database hostname is internal-db', 500),
      host,
    );

    expect(json).toHaveBeenCalledWith({
      success: false,
      category: 'System Error',
      message: 'Terjadi kesalahan sistem internal.',
    });
    expect(logSpy.mock.calls.flat().join(' ')).not.toContain('internal-db');
    logSpy.mockRestore();
  });
});
