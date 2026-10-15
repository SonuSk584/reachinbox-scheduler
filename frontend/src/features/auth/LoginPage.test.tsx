import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { LoginPage } from './LoginPage';
import { ProtectedRoute } from './ProtectedRoute';
import { mockApi, renderWithProviders, user } from '@/test/utils';

const tree = (
  <Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route element={<ProtectedRoute />}>
      <Route path="/scheduled" element={<p>Inbox</p>} />
    </Route>
  </Routes>
);

describe('auth routing', () => {
  it('sends a logged-out visitor to the login page', async () => {
    mockApi({ '/api/auth/me': () => ({ status: 401, body: { error: 'Not authenticated' } }) });
    renderWithProviders(tree, '/scheduled');
    expect(await screen.findByRole('heading', { name: 'Login' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /login with google/i })).toBeInTheDocument();
    expect(screen.getByLabelText('Email ID')).toBeInTheDocument();
  });

  it('lets a logged-in user through to the inbox', async () => {
    mockApi({ '/api/auth/me': user });
    renderWithProviders(tree, '/scheduled');
    expect(await screen.findByText('Inbox')).toBeInTheDocument();
  });
});
