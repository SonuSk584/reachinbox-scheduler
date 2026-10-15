import { useEffect, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Paperclip } from 'lucide-react';
import { toast } from 'sonner';
import { Button, IconButton } from '@/components/ui';
import { useScheduleEmail } from '@/hooks/useEmails';
import { useCreateSender, useSenders } from '@/hooks/useSenders';
import { formatShort } from '@/lib/date';
import { getErrorMessage } from '@/lib/errors';
import { RecipientsField } from './RecipientsField';
import { RichTextEditor } from './RichTextEditor';
import { SendLaterControl } from './SendLaterControl';
import { useComposeForm } from './useComposeForm';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[104px_minmax(0,1fr)] items-center gap-2 border-b border-line py-3 max-sm:grid-cols-1">
      <span className="text-xs font-medium">{label}</span>
      {children}
    </div>
  );
}

const digitsOnly = (v: string) => v.replace(/\D/g, '').slice(0, 6);

export function ComposePage() {
  const navigate = useNavigate();
  const { values, set, validate, toPayload } = useComposeForm();
  const { data: senders = [] } = useSenders();
  const createSender = useCreateSender();
  const schedule = useScheduleEmail();

  // Preselect the first sender once they load.
  useEffect(() => {
    if (!values.senderId && senders.length > 0) set('senderId', senders[0].id);
  }, [senders, values.senderId, set]);

  const handleNewSender = async () => {
    try {
      const sender = await createSender.mutateAsync();
      set('senderId', sender.id);
      toast.success(`Created test sender ${sender.email}`);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const handleSubmit = async () => {
    const problem = validate();
    if (problem) {
      toast.error(problem);
      return;
    }
    try {
      const result = await schedule.mutateAsync(toPayload());
      const notes = [
        `First send ${formatShort(result.firstSendAt)}`,
        result.invalid ? `${result.invalid} invalid skipped` : '',
        result.duplicates ? `${result.duplicates} duplicates skipped` : '',
      ].filter(Boolean);
      toast.success(`${result.scheduled.toLocaleString()} email${result.scheduled === 1 ? '' : 's'} scheduled`, { description: notes.join(' - ') });
      navigate('/scheduled');
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const goBack = () => (window.history.length > 1 ? navigate(-1) : navigate('/scheduled'));

  return (
    <div className="mx-auto flex min-h-full max-w-[1000px] flex-col px-5 pb-12">
      <header className="flex items-center gap-3 py-4">
        <IconButton label="Back" onClick={goBack}>
          <ArrowLeft aria-hidden className="size-5" />
        </IconButton>
        <h1 className="text-lg font-medium">Compose New Email</h1>
        <div className="ml-auto flex items-center gap-2">
          {values.sendAt && <span className="hidden text-xs text-ink-soft sm:inline">Scheduled for {formatShort(values.sendAt)}</span>}
          <IconButton label="Attachments (coming soon)" disabled className="text-brand">
            <Paperclip aria-hidden className="size-4" />
          </IconButton>
          <SendLaterControl value={values.sendAt} onChange={(d) => set('sendAt', d)} />
          <Button variant="outline" size="sm" className="rounded-full px-5" loading={schedule.isPending} onClick={handleSubmit}>
            {values.sendAt ? 'Send Later' : 'Send'}
          </Button>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[860px]">
        <Row label="From">
          <div className="flex items-center gap-3">
            <select
              aria-label="From"
              value={values.senderId}
              onChange={(e) => set('senderId', e.target.value)}
              disabled={senders.length === 0}
              className="h-8 max-w-full rounded-lg bg-field px-3 text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              {senders.length === 0 && <option value="">No senders yet</option>}
              {senders.map((s) => (
                <option key={s.id} value={s.id}>{s.email}</option>
              ))}
            </select>
            <button type="button" onClick={handleNewSender} disabled={createSender.isPending} className="text-xs font-medium text-brand hover:underline disabled:opacity-50">
              {createSender.isPending ? 'Creating...' : '+ New test sender'}
            </button>
          </div>
        </Row>

        <Row label="To">
          <RecipientsField value={values.recipients} onChange={(next) => set('recipients', next)} />
        </Row>

        <Row label="Subject">
          <input
            value={values.subject}
            onChange={(e) => set('subject', e.target.value)}
            placeholder="Subject"
            aria-label="Subject"
            maxLength={500}
            className="w-full bg-transparent text-sm placeholder:text-muted focus:outline-none"
          />
        </Row>

        <div className="flex flex-wrap items-center gap-x-8 gap-y-2 py-3 text-xs">
          <label className="flex items-center gap-2 font-medium">
            Delay between 2 emails
            <input
              inputMode="numeric"
              value={values.delay}
              onChange={(e) => set('delay', digitsOnly(e.target.value))}
              placeholder="00"
              aria-label="Delay between 2 emails in seconds"
              className="h-8 w-14 rounded-lg bg-field text-center font-normal placeholder:text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            />
            <span className="font-normal text-ink-soft">sec</span>
          </label>
          <label className="flex items-center gap-2 font-medium">
            Hourly Limit
            <input
              inputMode="numeric"
              value={values.hourlyLimit}
              onChange={(e) => set('hourlyLimit', digitsOnly(e.target.value))}
              placeholder="00"
              aria-label="Hourly limit"
              className="h-8 w-14 rounded-lg bg-field text-center font-normal placeholder:text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            />
          </label>
        </div>

        <RichTextEditor onChange={(html, isEmpty) => { set('body', html); set('bodyEmpty', isEmpty); }} />
      </div>
    </div>
  );
}

export default ComposePage;
