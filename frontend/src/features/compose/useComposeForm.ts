import { useCallback, useState } from 'react';
import type { ScheduleEmailPayload } from '@/types/api';

export interface ComposeValues {
  senderId: string;
  recipients: string[];
  subject: string;
  /** Seconds between two emails. Kept as text so the input can be empty. */
  delay: string;
  /** Emails per hour for this batch. Empty or 0 means "use the server default". */
  hourlyLimit: string;
  body: string;
  bodyEmpty: boolean;
  /** null = send as soon as possible. */
  sendAt: Date | null;
}

const initialValues: ComposeValues = {
  senderId: '',
  recipients: [],
  subject: '',
  delay: '',
  hourlyLimit: '',
  body: '',
  bodyEmpty: true,
  sendAt: null,
};

const toInt = (text: string) => (text === '' ? 0 : Number(text));

export function useComposeForm() {
  const [values, setValues] = useState<ComposeValues>(initialValues);

  const set = useCallback(<K extends keyof ComposeValues>(key: K, value: ComposeValues[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  /** Returns the first problem as a sentence for a toast, or null when the form is valid. */
  const validate = (): string | null => {
    if (!values.senderId) return 'Choose a sender in the From field.';
    if (values.recipients.length === 0) return 'Add at least one recipient or upload a list.';
    if (!values.subject.trim()) return 'Add a subject.';
    if (values.bodyEmpty) return 'Write a message before sending.';
    if (!Number.isInteger(toInt(values.delay)) || toInt(values.delay) < 0) return 'Delay must be 0 or more seconds.';
    if (!Number.isInteger(toInt(values.hourlyLimit)) || toInt(values.hourlyLimit) < 0) return 'Hourly limit must be a whole number.';
    if (values.sendAt && values.sendAt.getTime() <= Date.now()) return 'The send time has passed. Pick a time in the future.';
    return null;
  };

  const toPayload = (): ScheduleEmailPayload => {
    const hourly = toInt(values.hourlyLimit);
    return {
      senderId: values.senderId,
      subject: values.subject.trim(),
      body: values.body,
      leads: values.recipients,
      startTime: values.sendAt?.toISOString(),
      delaySeconds: toInt(values.delay),
      hourlyLimit: hourly > 0 ? hourly : undefined,
    };
  };

  return { values, set, validate, toPayload };
}
