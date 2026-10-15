import { AlertTriangle } from 'lucide-react';
import { Button } from './Button';

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 px-6 py-24 text-center">
      <div className="grid size-14 place-items-center rounded-full bg-danger-bg text-danger-ink">
        <AlertTriangle aria-hidden className="size-6" />
      </div>
      <h2 className="text-base font-semibold">Couldn&apos;t load this page</h2>
      <p className="max-w-sm text-sm text-ink-soft">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
