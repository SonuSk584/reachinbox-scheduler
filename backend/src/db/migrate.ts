import path from 'path';
import { migrate } from 'drizzle-orm/mysql2/migrator';
import { db, pool } from './client';
import { logger } from '../utils/logger';

async function main() {
  await migrate(db, { migrationsFolder: path.join(__dirname, '../../drizzle') });
  logger.info('Migrations applied');
  await pool.end();
}

main().catch((err) => {
  logger.error('Migration failed', err);
  process.exit(1);
});
