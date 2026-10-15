import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageSpinner } from '@/components/ui';
import { LoginPage } from '@/features/auth/LoginPage';
import { ProtectedRoute } from '@/features/auth/ProtectedRoute';
import { EmailDetailPage } from '@/features/email-detail/EmailDetailPage';
import { InboxPage } from '@/features/inbox/InboxPage';

// The rich-text editor is heavy and only needed on this screen, so it loads on demand.
const ComposePage = lazy(() => import('@/features/compose/ComposePage'));

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/scheduled" element={<InboxPage key="scheduled" kind="scheduled" />} />
          <Route path="/sent" element={<InboxPage key="sent" kind="sent" />} />
        </Route>
        <Route path="/email/:id" element={<EmailDetailPage />} />
        <Route
          path="/compose"
          element={
            <Suspense fallback={<PageSpinner />}>
              <ComposePage />
            </Suspense>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/scheduled" replace />} />
    </Routes>
  );
}
