export const env = {
  port: Number(process.env.PORT ?? 3000),
  /** PostgreSQL connection string; when absent an in-memory store is used. */
  databaseUrl: process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? '',
  /** Directory for JSON file fallback storage. */
  dataDir: process.env.DATA_DIR ?? './data',
  turnTimerSeconds: Number(process.env.TURN_TIMER_SECONDS ?? 0),
  /** Reconnect grace period in ms. */
  reconnectGraceMs: Number(process.env.RECONNECT_GRACE_MS ?? 60_000),
  /** Public URL origin for CORS (dev only). */
  corsOrigin: process.env.CORS_ORIGIN ?? '*',
};