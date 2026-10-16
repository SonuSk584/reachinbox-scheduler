import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import authRoutes from './auth';
import emailRoutes from './emails';
import senderRoutes from './senders';
import slackRoutes from './slack';

const router = Router();

// Login endpoints must be reachable while logged out, so they are mounted BEFORE requireAuth
// (the ones that need a user, like /auth/me, apply requireAuth themselves).
router.use('/auth', authRoutes);
// The Slack callback must work with no session cookie; the other Slack routes apply requireAuth themselves.
router.use('/slack', slackRoutes);

router.use(requireAuth);
router.use('/emails', emailRoutes);
router.use('/senders', senderRoutes);

export default router;
