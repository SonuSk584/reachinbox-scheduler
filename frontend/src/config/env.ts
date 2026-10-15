export const env = {
  apiBase: (import.meta.env.VITE_API_BASE as string | undefined) ?? '/api',
  authMode: ((import.meta.env.VITE_AUTH_MODE as string | undefined) ?? 'google') as 'dev' | 'google',
} as const;
