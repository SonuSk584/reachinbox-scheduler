import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import DOMPurify from 'dompurify';
import { ArrowLeft, Archive, ExternalLink, Star, Trash2 } from 'lucide-react';
import { Avatar, ErrorState, IconButton, Skeleton, StatusBadge } from '@/components/ui';
import { useAuth } from '@/features/auth/useAuth';
import { useEmail } from '@/hooks/useEmails';
import { formatLong } from '@/lib/date';
import { getErrorMessage } from '@/lib/errors';

export function EmailDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: email, isLoading, isError, error, refetch } = useEmail(id);

  // The body is HTML from the rich-text editor: always sanitize before rendering it.
  const safeBody = useMemo(() => (email ? DOMPurify.sanitize(email.body) : ''), [email]);

  const goBack = () => (window.history.length > 1 ? navigate(-1) : navigate('/scheduled'));

  return (
    <div className="mx-auto flex min-h-full max-w-[1100px] flex-col px-5 py-4">
      <header className="flex items-center gap-3 border-b border-line pb-3">
        <IconButton label="Back" onClick={goBack}>
          <ArrowLeft aria-hidden className="size-5" />
        </IconButton>
        <h1 className="min-w-0 flex-1 truncate text-lg font-medium">
          {isLoading ? <Skeleton className="h-5 w-72" /> : (email?.subject ?? 'Email')}
        </h1>
        <IconButton label="Star (coming soon)" disabled><Star aria-hidden className="size-4" /></IconButton>
        <IconButton label="Archive (coming soon)" disabled><Archive aria-hidden className="size-4" /></IconButton>
        <IconButton label="Delete (coming soon)" disabled><Trash2 aria-hidden className="size-4" /></IconButton>
        {user && <Avatar name={user.name} src={user.avatarUrl} />}
      </header>

      {isError && <ErrorState message={getErrorMessage(error)} onRetry={() => refetch()} />}

      {isLoading && (
        <div role="status" aria-label="Loading email" className="mx-auto w-full max-w-3xl space-y-3 pt-8">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      )}

      {email && (
        <article className="mx-auto w-full max-w-3xl pt-8">
          <div className="flex items-start gap-3">
            <Avatar name={email.senderName} className="size-10 text-base" />
            <div className="min-w-0 flex-1">
              <p className="text-sm">
                <span className="font-semibold">{email.senderName}</span>{' '}
                <span className="text-ink-soft">&lt;{email.senderEmail}&gt;</span>
              </p>
              <p className="text-xs text-ink-soft">to {email.toEmail}</p>
            </div>
            <div className="flex flex-col items-end gap-1.5 text-xs text-ink-soft">
              <time dateTime={email.sentAt ?? email.scheduledAt}>{formatLong(email.sentAt ?? email.scheduledAt)}</time>
              <StatusBadge status={email.status} scheduledAt={email.scheduledAt} />
            </div>
          </div>

          {email.status === 'failed' && (
            <p role="alert" className="mt-5 rounded-xl bg-danger-bg px-4 py-3 text-sm text-danger-ink">
              This email could not be sent{email.error ? `: ${email.error}` : '.'}
            </p>
          )}

          <div className="rich-content mt-6" dangerouslySetInnerHTML={{ __html: safeBody }} />

          {email.previewUrl && (
            <a
              href={email.previewUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-8 inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline"
            >
              View delivered message on Ethereal
              <ExternalLink aria-hidden className="size-3.5" />
            </a>
          )}
        </article>
      )}
    </div>
  );
}
