import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { senders } from '../db/schema';
import { createEtherealSender } from '../services/senderService';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    res.json(await db.select({ id: senders.id, email: senders.email, name: senders.name }).from(senders).where(eq(senders.userId, req.userId)));
  } catch (err) { next(err); }
});

// Creates a brand-new Ethereal inbox and stores it as a sender.
router.post('/ethereal', async (req, res, next) => {
  try {
    res.status(201).json(await createEtherealSender(req.userId));
  } catch (err) { next(err); }
});

export default router;
