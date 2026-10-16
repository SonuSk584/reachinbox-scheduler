import { pool } from '../db/client';
import { reindexAll, resetIndex } from '../services/searchService';
import { logger } from '../utils/logger';

// Usage: npm run search:reindex           (adds/updates every email)
//        npm run search:reindex -- --reset (drops the index first)
async function main() {
  if (process.argv.includes('--reset')) await resetIndex();
  logger.info(`Re-indexed ${await reindexAll()} emails`);
  await pool.end();
}

main().catch((err) => {
  logger.error('Reindex failed', err.message);
  process.exit(1);
});
