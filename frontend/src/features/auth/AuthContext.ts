import { createContext } from 'react';
import type { User } from '@/types/api';

export interface AuthState {
  user: User | null;
  isLoading: boolean;
  /** Re-check the session with the backend (used by "Continue as dev user"). */
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthState | null>(null);
