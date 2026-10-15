import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { InboxPage } from './InboxPage';
import { mockApi, renderWithProviders, user } from '@/test/utils';

const item = (over: object) => ({
  id: 'e1', toEmail: 'john@x.com', subject: 'Meeting follow-up', snippet: 'Hi John, just wanted to follow up',
  status: 'scheduled', scheduledAt: '2030-01-01T09:15:12.000Z', sentAt: null, updatedAt: '2030-01-01T00:00:00.000Z',
  previewUrl: null, error: null, ...over,
});
const page = (items: object[]) => ({ items, page: 1, limit: 20, total: items.length });

describe('InboxPage', () => {
  it('shows skeleton, then rows with recipient, subject and snippet', async () => {
    mockApi({
      '/api/auth/me': user,
      '/api/emails/counts': { scheduled: 2, sent: 0, failed: 0 },
      '/api/emails/scheduled': page([item({}), item({ id: 'e2', toEmail: 'olive@x.com', subject: 'Great to meet you' })]),
    });
    renderWithProviders(<InboxPage kind="scheduled" />);

    expect(screen.getByRole('status', { name: /loading emails/i })).toBeInTheDocument();
    expect(await screen.findByText('To: john@x.com')).toBeInTheDocument();
    expect(screen.getByText('To: olive@x.com')).toBeInTheDocument();
    expect(screen.getByText('Meeting follow-up')).toBeInTheDocument();
  });

  it('shows an empty state when there are no scheduled emails', async () => {
    mockApi({ '/api/auth/me': user, '/api/emails/scheduled': page([]) });
    renderWithProviders(<InboxPage kind="scheduled" />);
    expect(await screen.findByText('No scheduled emails')).toBeInTheDocument();
  });

  it('shows a "no results" message for an empty search', async () => {
    mockApi({ '/api/auth/me': user, '/api/emails/sent': page([]) });
    renderWithProviders(<InboxPage kind="sent" />, '/sent?q=zzz');
    expect(await screen.findByText('No results for "zzz"')).toBeInTheDocument();
  });

  it('shows failed and sent badges in the sent inbox', async () => {
    mockApi({
      '/api/auth/me': user,
      '/api/emails/sent': page([item({ status: 'sent' }), item({ id: 'e2', status: 'failed', toEmail: 'bad@x.com' })]),
    });
    renderWithProviders(<InboxPage kind="sent" />, '/sent');
    expect(await screen.findByText('Sent')).toBeInTheDocument();
    expect(screen.getByText('Failed')).toBeInTheDocument();
  });

  it('shows an error state with a retry button when the API fails', async () => {
    mockApi({ '/api/auth/me': user, '/api/emails/scheduled': () => ({ status: 500, body: { error: 'Internal server error' } }) });
    renderWithProviders(<InboxPage kind="scheduled" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Internal server error');
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });
});
