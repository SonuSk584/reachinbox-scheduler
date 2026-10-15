import { ApiError } from '@/api/client';

interface Issue {
  message: string;
  path?: unknown[];
}

/** Turn any thrown value into one readable sentence for a toast. */
export function getErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    const first = Array.isArray(err.details) ? (err.details[0] as Issue | undefined) : undefined;
    if (first?.message) return first.path?.length ? `${first.path.join('.')}: ${first.message}` : first.message;
    return err.message;
  }
  if (err instanceof TypeError) return 'Cannot reach the server. Is the backend running?';
  return err instanceof Error ? err.message : 'Something went wrong';
}
