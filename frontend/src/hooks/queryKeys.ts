import type { InboxKind } from '@/types/api';

export const queryKeys = {
  me: ['me'] as const,
  senders: ['senders'] as const,
  emails: ['emails'] as const,
  counts: ['emails', 'counts'] as const,
  list: (kind: InboxKind, page: number, q: string) => ['emails', 'list', kind, page, q] as const,
  detail: (id: string) => ['emails', 'detail', id] as const,
};
