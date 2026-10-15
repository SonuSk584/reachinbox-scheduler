import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { PageSpinner } from '@/components/ui';
import { useAuth } from './useAuth';

/** Wraps every page that needs a logged-in user. */
export function ProtectedRoute() {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) return <PageSpinner />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}
