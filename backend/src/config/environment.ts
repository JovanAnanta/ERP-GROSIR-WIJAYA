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
    } else {
      const origins = config.FRONTEND_URL.split(',').map((value) =>
        value.trim(),
      );
      for (const origin of origins) {
        let parsed: URL;
        try {
          parsed = new URL(origin);
        } catch {
          throw new Error('FRONTEND_URL contains an invalid origin.');
        }
        if (parsed.origin !== origin || parsed.protocol !== 'https:') {
          throw new Error(
            'Production FRONTEND_URL must contain HTTPS origins without paths.',
          );
        }
      }
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
