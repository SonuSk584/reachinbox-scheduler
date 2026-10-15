import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ComposePage } from './ComposePage';
import { mockApi, renderWithProviders, user } from '@/test/utils';

describe('ComposePage', () => {
  it('loads senders into the From field and renders the form', async () => {
    mockApi({
      '/api/auth/me': user,
      '/api/senders': [{ id: 's1', email: 'sender@ethereal.email', name: 'sender' }],
    });
    renderWithProviders(<ComposePage />, '/compose');

    expect(screen.getByRole('heading', { name: 'Compose New Email' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('From')).toHaveValue('s1'));
    expect(screen.getByLabelText('Subject')).toBeInTheDocument();
    expect(screen.getByLabelText('Hourly limit')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Email body' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument();
  });

  it('turns typed and pasted addresses into chips and shows the detected count', async () => {
    mockApi({ '/api/auth/me': user, '/api/senders': [] });
    const ui = userEvent.setup();
    renderWithProviders(<ComposePage />, '/compose');

    const to = screen.getByLabelText('Recipients');
    await ui.type(to, 'a@x.com ');
    await ui.click(to);
    await ui.paste('b@x.com, c@x.com, a@x.com');

    expect(await screen.findByText(/email addresses detected/i)).toHaveTextContent('3');
    expect(screen.getByText('a@x.com')).toBeInTheDocument();
  });

  it('reads a CSV upload and reports how many addresses it found', async () => {
    mockApi({ '/api/auth/me': user, '/api/senders': [] });
    const ui = userEvent.setup();
    const { container } = renderWithProviders(<ComposePage />, '/compose');

    const file = new File(['name,email\nAnn,ann@x.com\nBob,bob@x.com'], 'leads.csv', { type: 'text/csv' });
    // jsdom's File has no .text(); give it the one real browsers have.
    Object.defineProperty(file, 'text', { value: async () => 'name,email\nAnn,ann@x.com\nBob,bob@x.com' });
    await ui.upload(container.querySelector('input[type="file"]') as HTMLInputElement, file);

    expect(await screen.findByText(/email addresses detected/i)).toHaveTextContent('2');
  });

  it('switches the button to "Send Later" after a time is picked', async () => {
    mockApi({ '/api/auth/me': user, '/api/senders': [] });
    const ui = userEvent.setup();
    renderWithProviders(<ComposePage />, '/compose');

    await ui.click(screen.getByRole('button', { name: 'Send later' }));
    await ui.click(screen.getByRole('button', { name: 'Tomorrow, 10:00 AM' }));
    await ui.click(screen.getByRole('button', { name: 'Done' }));

    expect(await screen.findByRole('button', { name: 'Send Later' })).toBeInTheDocument();
    expect(screen.getByText(/Scheduled for/)).toBeInTheDocument();
  });
});
