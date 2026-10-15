import cors from 'cors';
import express from 'express';
import { env } from './config/env';
import { pool } from './db/client';
import { emailQueue } from './queue/emailQueue';
import { errorHandler } from './middleware/errorHandler';
import routes from './routes';
import { logger } from './utils/logger';

const app = express();
app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
app.use(express.json({ limit: '10mb' }));

app.get('/health', async (_req, res) => {
  try {
    await pool.query('select 1');
    await emailQueue.waitUntilReady();
    res.json({ ok: true });
  } catch {
    res.status(503).json({ ok: false });
  }
});

app.use('/api', routes);
app.use(errorHandler);

const server = app.listen(env.PORT, () => logger.info(`API listening on :${env.PORT}`));

async function shutdown() {
  server.close();
  await emailQueue.close();
  await pool.end();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
