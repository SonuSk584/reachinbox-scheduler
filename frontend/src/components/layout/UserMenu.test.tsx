import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Toaster } from 'sonner';
import { describe, expect, it } from 'vitest';
import { UserMenu } from './UserMenu';
import { mockApi, renderWithProviders, user } from '@/test/utils';

const disconnected = { configured: true, connected: false, teamName: null, channel: null };
const connected = { configured: true, connected: true, teamName: 'Acme Workspace', channel: '#alerts' };

async function openMenu() {
  const ui = userEvent.setup();
  await ui.click(await screen.findByRole('button', { name: /Oliver Brown/ }));
  return ui;
}

describe('UserMenu Slack section', () => {
  it('offers "Connect Slack" when Slack is not connected', async () => {
    mockApi({ '/api/auth/me': user, '/api/slack/status': disconnected });
    renderWithProviders(<UserMenu />);
    await openMenu();
    expect(await screen.findByRole('menuitem', { name: 'Connect Slack' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Disconnect Slack' })).not.toBeInTheDocument();
  });

  it('shows the channel and offers test + disconnect when connected', async () => {
    mockApi({ '/api/auth/me': user, '/api/slack/status': connected });
    renderWithProviders(<UserMenu />);
    await openMenu();
    expect(await screen.findByText('#alerts')).toBeInTheDocument();
    expect(screen.getByText(/Acme Workspace/)).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Send test message' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Connect Slack' })).not.toBeInTheDocument();
  });

  it('disconnecting calls the API and switches back to "Connect Slack"', async () => {
    let isConnected = true;
    const fetchMock = mockApi({
      '/api/auth/me': user,
      '/api/slack/status': () => ({ body: isConnected ? connected : disconnected }),
      '/api/slack/disconnect': () => {
        isConnected = false;
        return { status: 204 };
      },
    });
    renderWithProviders(<UserMenu />);
    const ui = await openMenu();
    await ui.click(await screen.findByRole('menuitem', { name: 'Disconnect Slack' }));

    await waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) => String(url).endsWith('/slack/disconnect') && init?.method === 'POST')).toBe(true));
    expect(await screen.findByRole('menuitem', { name: 'Connect Slack' })).toBeInTheDocument();
  });

  it('explains when the server has no Slack app configured', async () => {
    mockApi({ '/api/auth/me': user, '/api/slack/status': { ...disconnected, configured: false } });
    renderWithProviders(
      <>
        <UserMenu />
        <Toaster />
      </>,
    );
    const ui = await openMenu();
    await ui.click(await screen.findByRole('menuitem', { name: 'Connect Slack' }));
    expect(await screen.findByText(/Slack is not set up on the server yet/)).toBeInTheDocument();
  });
});
