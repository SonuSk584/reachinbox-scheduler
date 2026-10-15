import { ChevronLeft, ChevronRight } from 'lucide-react';
import { IconButton } from '@/components/ui';

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
}

export function Pagination({ page, pageSize, total, onChange }: PaginationProps) {
  if (total <= pageSize) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const lastPage = Math.ceil(total / pageSize);

  return (
    <nav aria-label="Pagination" className="flex items-center justify-end gap-2 px-5 py-3 text-xs text-ink-soft">
      <span>
        {from.toLocaleString()}-{to.toLocaleString()} of {total.toLocaleString()}
      </span>
      <IconButton label="Previous page" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        <ChevronLeft aria-hidden className="size-4" />
      </IconButton>
      <IconButton label="Next page" disabled={page >= lastPage} onClick={() => onChange(page + 1)}>
        <ChevronRight aria-hidden className="size-4" />
      </IconButton>
    </nav>
  );
}
