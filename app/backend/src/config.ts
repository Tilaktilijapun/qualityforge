const env = process.env;
const isProd = env.NODE_ENV === 'production';

if (isProd && !env.JWT_SECRET) {
  throw new Error('JWT_SECRET must be set in production');
}

export const config = {
  nodeEnv: env.NODE_ENV ?? 'development',
  port: Number(env.PORT ?? 4000),
  databaseUrl: env.DATABASE_URL ?? 'postgres://qf:qf@localhost:5432/qualityforge',
  jwtSecret: env.JWT_SECRET ?? 'dev-only-secret-change-me',
  jwtExpiresIn: '1h',
  bcryptCost: env.NODE_ENV === 'test' ? 4 : 10,
  /** Payments are always simulated; the client may pick the outcome outside production. */
  allowSimulatedOutcomes: !isProd,
};
