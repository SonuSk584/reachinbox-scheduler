import { Router } from 'express';
import { env } from '../config/env';
import { requireAuth } from '../middleware/auth';
import {
  consumeState, createAuthUrl, disconnect, exchangeCode, getConnection, isSlackConfigured, saveConnection, sendSlackMessage,
} from '../services/slackService';
import { logger } from '../utils/logger';

const router = Router();

/** Send the browser back to the app with a result the UI turns into a toast. */
const backToApp = (res: import('express').Response, params: Record<string, string>) =>
  res.redirect(`${env.FRONTEND_URL}/scheduled?${new URLSearchParams(params)}`);

// 2) Slack sends the user back here (via the public HTTPS address). There is no session cookie on this
//    host, so the user is identified by the `state` we stored when they clicked "Connect Slack".
router.get('/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query as Record<string, string | undefined>;
    if (error) {
      return backToApp(res, { slack: 'error', message: error === 'access_denied' ? 'Slack connection was cancelled' : 'Slack connection failed' });
    }
    const userId = state ? await consumeState(state) : null;
    if (!code || !userId) return backToApp(res, { slack: 'error', message: 'Your Slack sign-in expired. Please try again' });

    await saveConnection(userId, await exchangeCode(code));
    backToApp(res, { slack: 'connected' });
  } catch (err) {
    logger.error('Slack connect failed', err instanceof Error ? err.message : err);
    backToApp(res, { slack: 'error', message: 'Slack connection failed. Please try again' });
  }
});

// Does this user have Slack connected? (The sidebar menu shows the channel when they do.)
router.get('/status', requireAuth, async (req, res, next) => {
  try {
    const connection = await getConnection(req.userId);
    res.json({
      configured: isSlackConfigured(),
      connected: Boolean(connection),
      teamName: connection?.teamName ?? null,
      channel: connection?.channel ?? null,
    });
  } catch (err) { next(err); }
});

// 1) "Connect Slack" is a full-page navigation here, which redirects to Slack's consent screen.
router.get('/connect', requireAuth, async (req, res, next) => {
  try {
    if (!isSlackConfigured()) return backToApp(res, { slack: 'error', message: 'Slack is not configured on the server' });
    res.redirect(await createAuthUrl(req.userId));
  } catch (err) { next(err); }
});

router.post('/disconnect', requireAuth, async (req, res, next) => {
  try {
    await disconnect(req.userId);
    res.status(204).end();
  } catch (err) { next(err); }
});

// Lets the user (and a demo) prove the connection works without waiting for a real rate-limit hit.
router.post('/test', requireAuth, async (req, res, next) => {
  try {
    const connection = await getConnection(req.userId);
    if (!connection) return void res.status(409).json({ error: 'Slack is not connected' });
    const ok = await sendSlackMessage(connection, ':white_check_mark: ReachInbox is connected. Rate-limit alerts will appear in this channel.');
    if (!ok) return void res.status(502).json({ error: 'Slack did not accept the message' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
