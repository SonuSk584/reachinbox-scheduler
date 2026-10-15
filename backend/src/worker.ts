import { pool } from './db/client';
import { emailQueue } from './queue/emailQueue';
import { reconcile } from './services/reconcile';
import { startEmailWorker } from './workers/emailWorker';
import { logger } from './utils/logger';

async function main() {
  await reconcile(); // heal MySQL <-> Redis drift BEFORE accepting jobs
  const worker = startEmailWorker();

  const shutdown = async () => {
    logger.info('Shutting down worker (finishing in-flight jobs)...');
    await worker.close(); // waits for active jobs
    await emailQueue.close();
    await pool.end();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  logger.error('Worker failed to start', err);
  process.exit(1);
});
