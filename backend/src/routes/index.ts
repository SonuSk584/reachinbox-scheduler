import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import authRoutes from './auth';
import emailRoutes from './emails';
import senderRoutes from './senders';

const router = Router();
router.use(requireAuth);
router.use('/auth', authRoutes);
router.use('/emails', emailRoutes);
router.use('/senders', senderRoutes);

export default router;
