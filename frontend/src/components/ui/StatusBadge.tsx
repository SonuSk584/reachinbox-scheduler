import { Clock } from 'lucide-react';
import { formatBadgeTime } from '@/lib/date';
import { cn } from '@/lib/cn';
import type { EmailStatus } from '@/types/api';

interface StatusBadgeProps {
  status: EmailStatus;
  scheduledAt: string;
  className?: string;
}

const base = 'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium';

export function StatusBadge({ status, scheduledAt, className }: StatusBadgeProps) {
  if (status === 'scheduled') {
    return (
      <span className={cn(base, 'bg-warn-bg text-warn-ink', className)}>
        <Clock aria-hidden className="size-3" />
        {formatBadgeTime(scheduledAt)}
      </span>
    );
  }
  if (status === 'sending') return <span className={cn(base, 'bg-warn-bg text-warn-ink', className)}>Sending</span>;
  if (status === 'failed') return <span className={cn(base, 'bg-danger-bg text-danger-ink', className)}>Failed</span>;
  return <span className={cn(base, 'bg-neutral-bg text-ink-soft', className)}>Sent</span>;
}
