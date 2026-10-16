import { env } from '@/config/env';
import { api } from './client';
import type { SlackStatus } from '@/types/api';

export const slackApi = {
  status: () => api.get<SlackStatus>('/slack/status'),
  disconnect: () => api.post<void>('/slack/disconnect'),
  sendTest: () => api.post<{ ok: boolean }>('/slack/test'),
  /** Connecting is a full-page navigation: the backend redirects the browser on to Slack's consent screen. */
  connectUrl: `${env.apiBase}/slack/connect`,
};
