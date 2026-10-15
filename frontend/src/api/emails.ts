import { api } from './client';
import type {
  Counts,
  EmailDetail,
  EmailListItem,
  InboxKind,
  Paginated,
  ScheduleEmailPayload,
  ScheduleEmailResult,
} from '@/types/api';

export interface ListParams {
  page: number;
  limit: number;
  q?: string;
}

export const emailsApi = {
  list(kind: InboxKind, { page, limit, q }: ListParams) {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (q) params.set('q', q);
    return api.get<Paginated<EmailListItem>>(`/emails/${kind}?${params}`);
  },
  counts: () => api.get<Counts>('/emails/counts'),
  get: (id: string) => api.get<EmailDetail>(`/emails/${id}`),
  schedule: (payload: ScheduleEmailPayload) => api.post<ScheduleEmailResult>('/emails/schedule', payload),
};
