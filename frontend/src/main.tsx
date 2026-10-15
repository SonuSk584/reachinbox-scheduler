import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@fontsource-variable/inter';
import '@fontsource/silkscreen/400.css';
import './index.css';
import { ApiError } from '@/api/client';
import { App } from '@/App';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { queryKeys } from '@/hooks/queryKeys';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
  queryCache: new QueryCache({
    // A 401 anywhere means the session ended: drop the user so ProtectedRoute sends them to /login.
    onError: (error) => {
      if (error instanceof ApiError && error.status === 401) queryClient.setQueryData(queryKeys.me, null);
    },
  }),
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
