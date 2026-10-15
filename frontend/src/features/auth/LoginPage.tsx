import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { Button, Input, PageSpinner } from '@/components/ui';
import { env } from '@/config/env';
import { GoogleIcon } from './GoogleIcon';
import { useAuth } from './useAuth';

export function LoginPage() {
  const { user, isLoading, refresh } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [checking, setChecking] = useState(false);

  if (isLoading) return <PageSpinner />;
  if (user) return <Navigate to={(location.state as { from?: string } | null)?.from ?? '/scheduled'} replace />;

  const loginWithGoogle = () => {
    if (env.authMode === 'dev') {
      toast.info('Google sign-in is switched on in the next backend phase. Use "Continue as dev user" for now.');
      return;
    }
    window.location.href = `${env.apiBase}/auth/google`;
  };

  const loginWithEmail = (e: FormEvent) => {
    e.preventDefault();
    toast.info('Email sign-in is not available yet. Log in with Google instead.');
  };

  const continueAsDev = async () => {
    setChecking(true);
    await refresh();
    setChecking(false);
  };

  return (
    <main className="grid min-h-full place-items-center bg-white px-4 py-10">
      <div className="w-full max-w-[620px] rounded-2xl border border-line px-8 py-12 sm:px-[72px]">
        <h1 className="mb-8 text-center text-[40px] font-bold leading-none">Login</h1>

        <button
          type="button"
          onClick={loginWithGoogle}
          className="flex h-[60px] w-full items-center justify-center gap-3 rounded-xl bg-brand-soft text-base font-medium transition-colors hover:bg-[#d8efe1]"
        >
          <GoogleIcon />
          Login with Google
        </button>

        <div className="my-6 flex items-center gap-4 text-sm text-muted">
          <span className="h-px flex-1 bg-line" />
          or sign up through email
          <span className="h-px flex-1 bg-line" />
        </div>

        <form onSubmit={loginWithEmail} className="flex flex-col gap-4">
          <Input type="email" placeholder="Email ID" aria-label="Email ID" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-[70px]" />
          <Input type="password" placeholder="Password" aria-label="Password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="h-[70px]" />
          <Button type="submit" size="lg" className="mt-3">
            Login
          </Button>
        </form>

        {env.authMode === 'dev' && (
          <Button variant="ghost" fullWidth className="mt-4" loading={checking} onClick={continueAsDev}>
            Continue as dev user
          </Button>
        )}
      </div>
    </main>
  );
}
