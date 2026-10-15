import { useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Clock, Filter, RefreshCw, Search, Send } from 'lucide-react';
import { Button, EmptyState, ErrorState, IconButton } from '@/components/ui';
import { PAGE_SIZE, useEmailList } from '@/hooks/useEmails';
import { getErrorMessage } from '@/lib/errors';
import { cn } from '@/lib/cn';
import type { InboxKind } from '@/types/api';
import { EmailListSkeleton } from './EmailListSkeleton';
import { EmailRow } from './EmailRow';
import { Pagination } from './Pagination';
import { SearchBar } from './SearchBar';

export function InboxPage({ kind }: { kind: InboxKind }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page')) || 1);
  const q = params.get('q') ?? '';

  const { data, isLoading, isError, error, isFetching, refetch } = useEmailList(kind, page, q);

  const updateParams = useCallback(
    (mutate: (next: URLSearchParams) => void) =>
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        mutate(next);
        return next;
      }, { replace: true }),
    [setParams],
  );

  const onSearch = useCallback(
    (value: string) =>
      updateParams((n) => {
        if (value) n.set('q', value);
        else n.delete('q');
        n.delete('page');
      }),
    [updateParams],
  );

  const onPageChange = (next: number) => updateParams((n) => n.set('page', String(next)));

  const renderBody = () => {
    if (isLoading) return <EmailListSkeleton />;
    if (isError) return <ErrorState message={getErrorMessage(error)} onRetry={() => refetch()} />;
    if (!data || data.items.length === 0) {
      if (q) {
        return <EmptyState icon={<Search aria-hidden className="size-6" />} title={`No results for "${q}"`} description="Check the spelling, or search by recipient address or subject." />;
      }
      return kind === 'scheduled' ? (
        <EmptyState
          icon={<Clock aria-hidden className="size-6" />}
          title="No scheduled emails"
          description="Emails you schedule will wait here until their send time."
          action={<Button size="sm" onClick={() => navigate('/compose')}>Compose an email</Button>}
        />
      ) : (
        <EmptyState icon={<Send aria-hidden className="size-6" />} title="No sent emails yet" description="Once a scheduled email goes out, it shows up here." />
      );
    }
    return (
      <>
        <ul>{data.items.map((email) => <EmailRow key={email.id} email={email} kind={kind} />)}</ul>
        <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onChange={onPageChange} />
      </>
    );
  };

  return (
    <section aria-label={kind === 'scheduled' ? 'Scheduled emails' : 'Sent emails'}>
      <div className="sticky top-0 z-10 flex items-center gap-3 bg-white px-5 py-3">
        <SearchBar query={q} onSearch={onSearch} />
        <IconButton label="Filters (coming soon)" disabled>
          <Filter aria-hidden className="size-4" />
        </IconButton>
        <IconButton label="Refresh" onClick={() => refetch()}>
          <RefreshCw aria-hidden className={cn('size-4', isFetching && 'animate-spin')} />
        </IconButton>
      </div>
      {renderBody()}
    </section>
  );
}
