import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { PenSquare } from 'lucide-react';
import { IconButton } from '@/components/ui';
import { cn } from '@/lib/cn';
import { Sidebar } from './Sidebar';

const tabClass = ({ isActive }: { isActive: boolean }) =>
  cn('rounded-full px-3 py-1 text-xs', isActive ? 'bg-brand-soft font-semibold' : 'text-ink-soft');

/** Sidebar + main pane. Used by the Scheduled and Sent inboxes. Below `md` the sidebar becomes a slim top bar. */
export function AppLayout() {
  const navigate = useNavigate();
  return (
    <div className="flex h-full max-md:flex-col">
      <Sidebar />
      <header className="flex items-center gap-2 border-b border-line px-3 py-2 md:hidden">
        <span className="mr-2 font-pixel text-2xl leading-none">ONB</span>
        <NavLink to="/scheduled" className={tabClass}>Scheduled</NavLink>
        <NavLink to="/sent" className={tabClass}>Sent</NavLink>
        <IconButton label="Compose" className="ml-auto" onClick={() => navigate('/compose')}>
          <PenSquare aria-hidden className="size-4" />
        </IconButton>
      </header>
      <main className="min-w-0 flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
