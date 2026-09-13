import { getTrustedOrigins, validateEnvironment } from './environment.js';

describe('environment configuration', () => {
  const originalFrontendUrl = process.env.FRONTEND_URL;
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (originalFrontendUrl === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = originalFrontendUrl;
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  });

  it('requires a trusted frontend origin in production', () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://placeholder',
      }),
    ).toThrow('FRONTEND_URL');
  });

  it('accepts an exact HTTPS origin in production', () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://placeholder',
        FRONTEND_URL: 'https://erp.example.com',
      }),
    ).not.toThrow();
  });

  it('rejects HTTP or path-based production origins', () => {
    for (const frontendUrl of [
      'http://erp.example.com',
      'https://erp.example.com/app',
    ]) {
      expect(() =>
        validateEnvironment({
          NODE_ENV: 'production',
          DATABASE_URL: 'postgresql://placeholder',
          FRONTEND_URL: frontendUrl,
        }),
      ).toThrow('HTTPS origins without paths');
    }
  });

  it('normalizes configured trusted origins', () => {
    process.env.FRONTEND_URL =
      'https://erp.example.com/, https://admin.example.com/path';

    expect(getTrustedOrigins()).toEqual([
      'https://erp.example.com',
      'https://admin.example.com',
    ]);
  });

  it('allows the standard Vite development ports when no origin is configured', () => {
    delete process.env.FRONTEND_URL;
    process.env.NODE_ENV = 'development';

    expect(getTrustedOrigins()).toEqual([
      'http://localhost:5173',
      'http://localhost:5174',
      'http://localhost:5175',
    ]);
  });
});
