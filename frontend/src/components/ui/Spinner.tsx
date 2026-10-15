import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

export function Spinner({ className }: { className?: string }) {
  return <Loader2 aria-hidden className={cn('size-4 animate-spin', className)} />;
}

export function PageSpinner() {
  return (
    <div role="status" aria-label="Loading" className="grid h-full place-items-center text-brand">
      <Spinner className="size-7" />
    </div>
  );
}
