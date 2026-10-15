import { useCallback, useMemo, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { authApi } from '@/api/auth';
import { queryKeys } from '@/hooks/queryKeys';
import { AuthContext, type AuthState } from './AuthContext';

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const { data: user = null, isLoading, refetch } = useQuery({
    queryKey: queryKeys.me,
    queryFn: authApi.me,
    staleTime: Infinity,
    retry: false,
  });

  const refresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      qc.setQueryData(queryKeys.me, null);
      qc.removeQueries({ queryKey: queryKeys.emails });
    }
  }, [qc]);

  const value = useMemo<AuthState>(() => ({ user, isLoading, refresh, logout }), [user, isLoading, refresh, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
