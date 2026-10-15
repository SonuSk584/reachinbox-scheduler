import { Link } from 'react-router-dom';
import { Star } from 'lucide-react';
import { StatusBadge } from '@/components/ui';
import { formatShort } from '@/lib/date';
import type { EmailListItem, InboxKind } from '@/types/api';

interface EmailRowProps {
  email: EmailListItem;
  kind: InboxKind;
}

export function EmailRow({ email, kind }: EmailRowProps) {
  return (
    <li>
      <Link
        to={`/email/${email.id}`}
        className="grid grid-cols-[minmax(0,170px)_minmax(0,1fr)_auto] items-center gap-4 border-b border-line px-5 py-3 text-xs transition-colors hover:bg-field/70 max-sm:grid-cols-[minmax(0,1fr)_auto]"
      >
        <span className="truncate font-medium max-sm:col-span-2">To: {email.toEmail}</span>
        <span className="flex min-w-0 items-center gap-2">
          <StatusBadge status={email.status} scheduledAt={email.scheduledAt} />
          <span className="truncate">
            <span className="font-medium">{email.subject}</span>
            {email.snippet && <span className="text-muted"> - {email.snippet}</span>}
          </span>
        </span>
        <span className="flex items-center gap-3 text-[11px] text-muted">
          {kind === 'sent' && <time dateTime={email.sentAt ?? email.updatedAt}>{formatShort(email.sentAt ?? email.updatedAt)}</time>}
          <Star aria-hidden className="size-4" />
        </span>
      </Link>
    </li>
  );
}
