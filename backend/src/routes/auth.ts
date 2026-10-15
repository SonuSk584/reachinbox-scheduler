import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { users } from '../db/schema';
import { HttpError } from '../middleware/errorHandler';

const router = Router();

// Who is logged in? The frontend calls this on load to decide login page vs dashboard.
router.get('/me', async (req, res, next) => {
  try {
    const [user] = await db
      .select({ id: users.id, email: users.email, name: users.name, avatarUrl: users.avatarUrl })
      .from(users)
      .where(eq(users.id, req.userId));
    if (!user) throw new HttpError(401, 'Not authenticated');
    res.json(user);
  } catch (err) { next(err); }
});

// Phase 5 clears the session cookie here. In AUTH_MODE=dev there is no session to clear.
router.post('/logout', (_req, res) => {
  res.status(204).end();
});

export default router;
