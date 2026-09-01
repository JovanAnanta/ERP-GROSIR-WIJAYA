const REQUIRED_IN_ALL_ENVIRONMENTS = ['DATABASE_URL'] as const;
const DEVELOPMENT_FRONTEND_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
] as const;

export function validateEnvironment(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const missing: string[] = REQUIRED_IN_ALL_ENVIRONMENTS.filter(
    (key) => typeof config[key] !== 'string' || config[key] === '',
  );

  if (config.NODE_ENV === 'production') {
    if (typeof config.FRONTEND_URL !== 'string' || !config.FRONTEND_URL) {
      missing.push('FRONTEND_URL');
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Environment configuration is incomplete: ${missing.join(', ')}`,
    );
  }

  return config;
}

export function getTrustedOrigins(): string[] {
  const configured = process.env.FRONTEND_URL?.trim();
  const origins = configured
    ? configured.split(',')
    : process.env.NODE_ENV === 'production'
      ? []
      : [...DEVELOPMENT_FRONTEND_ORIGINS];

  return origins
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => {
      try {
        return new URL(origin).origin;
      } catch {
        throw new Error('FRONTEND_URL contains an invalid origin.');
      }
    });
}
