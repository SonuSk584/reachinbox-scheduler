import { useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, LogOut, MessageSquare, Send, Unlink, type LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { slackApi } from '@/api/slack';
import { Avatar } from '@/components/ui';
import { useAuth } from '@/features/auth/useAuth';
import { useOutsideClick } from '@/hooks/useOutsideClick';
import { useDisconnectSlack, useSendSlackTest, useSlackStatus } from '@/hooks/useSlack';
import { cn } from '@/lib/cn';

function MenuItem({ icon: Icon, onClick, children }: { icon: LucideIcon; onClick: () => void; children: ReactNode }) {
  return (
    <button role="menuitem" type="button" onClick={onClick} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-field">
      <Icon aria-hidden className="size-4" />
      {children}
    </button>
  );
}

export function UserMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  useOutsideClick(ref, () => setOpen(false), open);

  const { data: slack } = useSlackStatus();
  const disconnectSlack = useDisconnectSlack();
  const sendSlackTest = useSendSlackTest();

  if (!user) return null;

  const handleLogout = async () => {
    setOpen(false);
    await logout();
    toast.success('You have been logged out');
    navigate('/login', { replace: true });
  };

  const connectSlack = () => {
    if (slack && !slack.configured) {
      toast.error('Slack is not set up on the server yet. Add the Slack app credentials to the backend settings.');
      return;
    }
    window.location.href = slackApi.connectUrl; // leaves the app: Slack asks for consent, then sends the user back
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
          {slack?.connected ? (
            <>
              <p className="px-3 pb-1 pt-2 text-[11px] leading-tight text-ink-soft">
                Slack alerts go to <span className="font-medium text-ink">{slack.channel}</span>
                {slack.teamName && <> in {slack.teamName}</>}
              </p>
              <MenuItem icon={Send} onClick={() => sendSlackTest.mutate()}>Send test message</MenuItem>
              <MenuItem icon={Unlink} onClick={() => disconnectSlack.mutate()}>Disconnect Slack</MenuItem>
            </>
          ) : (
            <MenuItem icon={MessageSquare} onClick={connectSlack}>Connect Slack</MenuItem>
          )}
          <MenuItem icon={LogOut} onClick={handleLogout}>Log out</MenuItem>
        </div>
      )}
    </div>
  );
}
