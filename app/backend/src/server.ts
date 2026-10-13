import { createApp } from './app';
import { config } from './config';
import { pool } from './db';

const server = createApp().listen(config.port, () => {
  console.log(`QualityForge API listening on :${config.port} (${config.nodeEnv})`);
});

const shutdown = () => { server.close(() => { void pool.end().then(() => process.exit(0)); }); };
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
