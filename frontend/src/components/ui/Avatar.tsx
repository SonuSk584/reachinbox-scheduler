import { cn } from '@/lib/cn';

interface AvatarProps {
  name: string;
  src?: string | null;
  className?: string;
}

export function Avatar({ name, src, className }: AvatarProps) {
  if (src) {
    return <img src={src} alt="" referrerPolicy="no-referrer" className={cn('size-8 rounded-full object-cover', className)} />;
  }
  return (
    <span
      aria-hidden
      className={cn('inline-grid size-8 shrink-0 place-items-center rounded-full bg-brand text-sm font-semibold text-white', className)}
    >
      {name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  );
}
