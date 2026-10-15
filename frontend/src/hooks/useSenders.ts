import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { sendersApi } from '@/api/senders';
import { queryKeys } from './queryKeys';

export const useSenders = () => useQuery({ queryKey: queryKeys.senders, queryFn: sendersApi.list });

export function useCreateSender() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: sendersApi.createEthereal,
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.senders }),
  });
}
