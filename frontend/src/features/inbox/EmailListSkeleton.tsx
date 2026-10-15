import { Skeleton } from '@/components/ui';

export function EmailListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Loading emails">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 border-b border-line px-5 py-3.5">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-5 w-24 rounded-full" />
          <Skeleton className="h-3 flex-1" />
        </div>
      ))}
    </div>
  );
}
