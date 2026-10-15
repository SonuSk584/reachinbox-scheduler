import { Router } from 'express';
import { z } from 'zod';
import { getCounts, getEmail, listEmails, scheduleBatch } from '../services/emailService';

const router = Router();

const scheduleSchema = z.object({
  senderId: z.string().uuid(),
  subject: z.string().trim().min(1).max(500),
  body: z.string().min(1),
  leads: z.array(z.string()).min(1).max(100_000),
  startTime: z.coerce.date().optional(),
  delaySeconds: z.coerce.number().int().min(0).max(86_400).default(0),
  hourlyLimit: z.coerce.number().int().positive().optional(),
});

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(200).optional(),
});

router.post('/schedule', async (req, res, next) => {
  try {
    const input = scheduleSchema.parse(req.body);
    res.status(201).json(await scheduleBatch(req.userId, input));
  } catch (err) { next(err); }
});

router.get('/scheduled', async (req, res, next) => {
  try {
    const { page, limit, q } = listSchema.parse(req.query);
    res.json(await listEmails(req.userId, 'scheduled', page, limit, q));
  } catch (err) { next(err); }
});

router.get('/sent', async (req, res, next) => {
  try {
    const { page, limit, q } = listSchema.parse(req.query);
    res.json(await listEmails(req.userId, 'sent', page, limit, q));
  } catch (err) { next(err); }
});

router.get('/counts', async (req, res, next) => {
  try { res.json(await getCounts(req.userId)); } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try { res.json(await getEmail(req.userId, z.string().uuid().parse(req.params.id))); }
  catch (err) { next(err); }
});

export default router;
