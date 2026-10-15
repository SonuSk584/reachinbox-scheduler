import { Toaster } from 'sonner';
import { AppRoutes } from '@/routes/AppRoutes';

export function App() {
  return (
    <>
      <AppRoutes />
      <Toaster position="top-right" richColors closeButton />
    </>
  );
}
