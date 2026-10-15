import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, LogOut, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { Avatar } from '@/components/ui';
import { useOutsideClick } from '@/hooks/useOutsideClick';
import { useAuth } from '@/features/auth/useAuth';
import { cn } from '@/lib/cn';

export function UserMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  useOutsideClick(ref, () => setOpen(false), open);

  if (!user) return null;

  const handleLogout = async () => {
    setOpen(false);
    await logout();
    toast.success('You have been logged out');
    navigate('/login', { replace: true });
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-xl bg-field p-2 text-left transition-colors hover:bg-[#edf0ef]"
      >
        <Avatar name={user.name} src={user.avatarUrl} className="size-7" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-medium leading-tight">{user.name}</span>
          <span className="block truncate text-[10px] leading-tight text-ink-soft">{user.email}</span>
        </span>
        <ChevronDown aria-hidden className={cn('size-4 text-muted transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div role="menu" className="absolute inset-x-0 top-full z-20 mt-1 rounded-xl border border-line bg-white p-1 shadow-lg">
          <button
            role="menuitem"
            type="button"
            disabled
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-soft disabled:cursor-not-allowed disabled:opacity-60"
          >
            <MessageSquare aria-hidden className="size-4" />
            Connect Slack
            <span className="ml-auto rounded bg-field px-1.5 py-0.5 text-[10px]">Soon</span>
          </button>
          <button role="menuitem" type="button" onClick={handleLogout} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-field">
            <LogOut aria-hidden className="size-4" />
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
