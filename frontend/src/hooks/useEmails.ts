import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { emailsApi } from '@/api/emails';
import type { InboxKind } from '@/types/api';
import { queryKeys } from './queryKeys';

export const PAGE_SIZE = 20;
const LIVE_REFRESH_MS = 10_000;

/** Paginated, searchable inbox list. Polls so status changes appear without a manual refresh. */
export function useEmailList(kind: InboxKind, page: number, q: string) {
  return useQuery({
    queryKey: queryKeys.list(kind, page, q),
    queryFn: () => emailsApi.list(kind, { page, limit: PAGE_SIZE, q: q || undefined }),
    placeholderData: keepPreviousData,
    refetchInterval: LIVE_REFRESH_MS,
  });
}

export const useCounts = () =>
  useQuery({ queryKey: queryKeys.counts, queryFn: emailsApi.counts, refetchInterval: LIVE_REFRESH_MS });

export const useEmail = (id: string) =>
  useQuery({ queryKey: queryKeys.detail(id), queryFn: () => emailsApi.get(id), enabled: Boolean(id) });

export function useScheduleEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: emailsApi.schedule,
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.emails }),
  });
}
