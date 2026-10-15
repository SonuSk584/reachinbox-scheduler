import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

/** The soft grey field used across the design. */
export function Input({ className, ...rest }: ComponentProps<'input'>) {
  return (
    <input
      className={cn(
        'h-[52px] w-full rounded-xl bg-field px-5 text-sm text-ink placeholder:text-ink-soft/80',
        'border border-transparent transition-colors focus:border-brand focus:bg-white focus:outline-none',
        className,
      )}
      {...rest}
    />
  );
}
