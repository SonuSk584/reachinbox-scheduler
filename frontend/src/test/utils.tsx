import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { AuthProvider } from '@/features/auth/AuthProvider';

export const user = { id: 'u1', email: 'oliver@domain.io', name: 'Oliver Brown', avatarUrl: null };

type Handler = (url: URL, init?: RequestInit) => { status?: number; body?: unknown };

/** Replace fetch with a router keyed by pathname. Unmatched paths fail loudly. */
export function mockApi(routes: Record<string, Handler | unknown>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    const route = routes[url.pathname];
    if (route === undefined) throw new Error(`Unmocked request: ${url.pathname}`);
    const res = typeof route === 'function' ? (route as Handler)(url, init) : { body: route };
    if (res.status === 204) return new Response(null, { status: 204 });
    return new Response(JSON.stringify(res.body ?? null), { status: res.status ?? 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

export function renderWithProviders(ui: ReactElement, path = '/') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>{ui}</AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
