import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { slackApi } from '@/api/slack';
import { getErrorMessage } from '@/lib/errors';
import { queryKeys } from './queryKeys';

export const useSlackStatus = () => useQuery({ queryKey: queryKeys.slack, queryFn: slackApi.status });

export function useDisconnectSlack() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: slackApi.disconnect,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.slack });
      toast.success('Slack disconnected');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
}

export function useSendSlackTest() {
  return useMutation({
    mutationFn: slackApi.sendTest,
    onSuccess: () => toast.success('Test message sent. Check your Slack channel.'),
    onError: (err) => toast.error(getErrorMessage(err)),
  });
}

/**
 * After the Slack consent screen the backend returns the user to /scheduled?slack=connected
 * (or ?slack=error&message=...). Turn that into a toast, refresh the status, and tidy the URL.
 */
export function useSlackRedirectToast() {
  const [params, setParams] = useSearchParams();
  const qc = useQueryClient();

  useEffect(() => {
    const result = params.get('slack');
    if (!result) return;
    if (result === 'connected') toast.success('Slack connected. Rate-limit alerts will now be posted to your channel.');
    else toast.error(params.get('message') ?? 'Slack connection failed');

    qc.invalidateQueries({ queryKey: queryKeys.slack });
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('slack');
        next.delete('message');
        return next;
      },
      { replace: true },
    );
  }, [params, setParams, qc]);
}
