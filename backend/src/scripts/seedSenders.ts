import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import { db, pool } from '../db/client';
import { senders, users } from '../db/schema';
import { createEtherealAccount } from '../services/mailer';
import { logger } from '../utils/logger';

// Usage: npm run seed:senders [count]
async function main() {
  const count = Number(process.argv[2] ?? 2);
  const email = 'dev@reachinbox.local';
  let [user] = await db.select().from(users).where(eq(users.email, email));
  if (!user) {
    const id = randomUUID();
    await db.insert(users).values({ id, email, name: 'Dev User' });
    [user] = await db.select().from(users).where(eq(users.id, id));
  }

  for (let i = 0; i < count; i++) {
    const acc = await createEtherealAccount();
    await db.insert(senders).values({ id: randomUUID(), userId: user.id, name: acc.email.split('@')[0], ...acc });
    logger.info(`Created Ethereal sender ${acc.email}`);
  }
  await pool.end();
}

main().catch((e) => { logger.error('Seed failed', e); process.exit(1); });
