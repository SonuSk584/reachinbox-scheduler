
import { NavLink, useNavigate } from 'react-router-dom';
import {
  Activity,
  Clock,
  Send,
  Info,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui';
import { useCounts } from '@/hooks/useEmails';
import { cn } from '@/lib/cn';
import { UserMenu } from './UserMenu';

interface NavItemProps {
  to: string;
  label: string;
  icon: LucideIcon;
  count?: number;
}

function NavItem({ to, label, icon: Icon, count }: NavItemProps) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'flex h-9 items-center gap-2.5 rounded-lg px-3 text-xs transition-colors',
          isActive
            ? 'bg-brand-soft font-semibold text-ink'
            : 'text-ink-soft hover:bg-field',
        )
      }
    >
      <Icon aria-hidden className="size-4" />
      <span className="flex-1">{label}</span>
      {count !== undefined && (
        <span className="text-[11px] text-ink-soft">
          {count.toLocaleString()}
        </span>
      )}
    </NavLink>
  );
}

export function Sidebar() {
  const navigate = useNavigate();
  const { data: counts } = useCounts();

  const apiBase =
    import.meta.env.VITE_API_BASE || 'http://localhost:4000/api';

  const queueDashboardUrl = `${apiBase.replace(/\/api\/?$/, '')}/admin/queues`;

  return (
    <aside className="flex w-[216px] shrink-0 flex-col gap-3 border-r border-line p-3 max-md:hidden">
      <span className="px-1 pt-1 font-pixel text-[30px] leading-none">
        ONB
      </span>

      <UserMenu />

      <Button
        variant="outline"
        size="sm"
        className="h-9 rounded-full"
        onClick={() => navigate('/compose')}
      >
        Compose
      </Button>

      <nav aria-label="Mailboxes" className="mt-1 flex flex-col gap-0.5">
        <span className="px-3 pb-1 text-[10px] text-muted">Core</span>

        <NavItem
          to="/scheduled"
          label="Scheduled"
          icon={Clock}
          count={counts?.scheduled}
        />

        <NavItem
          to="/sent"
          label="Sent"
          icon={Send}
          count={
            counts ? counts.sent + counts.failed : undefined
          }
        />
      </nav>

      <a
        href={queueDashboardUrl}
        target="_blank"
        rel="noreferrer"
        className="mt-auto flex h-9 items-center gap-2.5 rounded-lg px-3 text-xs text-ink-soft transition-colors hover:bg-field"
      >
        <Activity aria-hidden className="size-4" />
        Queue dashboard
      </a>

      {/* Deployment notice */}
      <div className="rounded-lg border border-line bg-field p-3">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-ink">
          <Info className="size-4 shrink-0" aria-hidden />
          Deployment Notice
        </div>

        <p className="text-[11px] leading-relaxed text-ink-soft">
          Email scheduling uses BullMQ and Redis. The deployed free
          hosting environment restricts outbound SMTP connections,
          so Ethereal email sending is demonstrated locally.
        </p>
      </div>
    </aside>
  );
}
