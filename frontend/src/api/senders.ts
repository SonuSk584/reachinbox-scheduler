import { api } from './client';
import type { Sender } from '@/types/api';

export const sendersApi = {
  list: () => api.get<Sender[]>('/senders'),
  /** Creates a fresh Ethereal (fake SMTP) inbox and returns it as a sender. */
  createEthereal: () => api.post<Sender>('/senders/ethereal'),
};
