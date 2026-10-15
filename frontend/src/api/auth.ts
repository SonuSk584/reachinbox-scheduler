import { api, ApiError } from './client';
import type { User } from '@/types/api';

export const authApi = {
  /** Returns null (not an error) when nobody is logged in. */
  async me(): Promise<User | null> {
    try {
      return await api.get<User>('/auth/me');
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return null;
      throw err;
    }
  },
  logout: () => api.post<void>('/auth/logout'),
};
