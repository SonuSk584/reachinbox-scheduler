import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import cors from 'cors';
import express from 'express';
import { env } from './config/env';
import { pool } from './db/client';
import { emailQueue } from './queue/emailQueue';
import { requireAuth } from './middleware/auth';
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

// Live BullMQ dashboard: waiting / delayed / active / completed / failed jobs, updating in real time.
const boardAdapter = new ExpressAdapter();
boardAdapter.setBasePath('/admin/queues');
createBullBoard({ queues: [new BullMQAdapter(emailQueue)], serverAdapter: boardAdapter });
app.use('/admin/queues', requireAuth, boardAdapter.getRouter());

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
