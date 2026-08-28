const REQUIRED_IN_ALL_ENVIRONMENTS = ['DATABASE_URL'] as const;

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
  const configured = process.env.FRONTEND_URL ?? 'http://localhost:5173';
  return configured
    .split(',')
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
