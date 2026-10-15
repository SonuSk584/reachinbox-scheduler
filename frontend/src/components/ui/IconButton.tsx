import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

interface IconButtonProps extends ComponentProps<'button'> {
  /** Required: icon-only buttons need an accessible name. */
  label: string;
  active?: boolean;
}

export function IconButton({ label, active, className, children, type = 'button', ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'inline-grid size-8 place-items-center rounded-lg text-ink-soft transition-colors hover:bg-field',
        'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent',
        active && 'bg-field text-brand',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
