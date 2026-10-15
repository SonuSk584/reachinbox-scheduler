import { randomUUID } from 'crypto';
import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { senders } from '../db/schema';
import { createEtherealAccount } from '../services/mailer';

const router = Router();

const publicFields = { id: senders.id, email: senders.email, name: senders.name };

router.get('/', async (req, res, next) => {
  try {
    res.json(await db.select(publicFields).from(senders).where(eq(senders.userId, req.userId)));
  } catch (err) { next(err); }
});

// Creates a brand-new Ethereal inbox and stores it as a sender.
router.post('/ethereal', async (req, res, next) => {
  try {
    const acc = await createEtherealAccount();
    const id = randomUUID();
    const name = acc.email.split('@')[0];
    await db.insert(senders).values({ id, userId: req.userId, name, ...acc });
    res.status(201).json({ id, email: acc.email, name });
  } catch (err) { next(err); }
});

export default router;
