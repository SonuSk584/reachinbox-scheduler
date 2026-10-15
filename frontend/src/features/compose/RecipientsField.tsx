import { useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { extractEmails, mergeUnique } from '@/lib/emails';

interface RecipientsFieldProps {
  value: string[];
  onChange: (next: string[]) => void;
}

const COLLAPSED_CHIPS = 3;
const MAX_RENDERED_CHIPS = 200; // keeps the DOM light when a list has thousands of leads

export function RecipientsField({ value, onChange }: RecipientsFieldProps) {
  const [draft, setDraft] = useState('');
  const [expanded, setExpanded] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const add = (text: string) => {
    const found = extractEmails(text);
    if (found.length === 0) return false;
    onChange(mergeUnique(value, found));
    return true;
  };

  const commitDraft = () => {
    const text = draft.trim();
    if (!text) return;
    if (add(text)) setDraft('');
    else toast.error(`"${text}" is not a valid email address`);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (['Enter', ',', ' ', ';'].includes(e.key)) {
      e.preventDefault();
      commitDraft();
    } else if (e.key === 'Backspace' && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  };

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text');
    if (extractEmails(text).length > 1 && add(text)) e.preventDefault();
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const found = extractEmails(await file.text());
    if (found.length === 0) {
      toast.error('No email addresses were found in that file');
      return;
    }
    onChange(mergeUnique(value, found));
    toast.success(`${found.length.toLocaleString()} email address${found.length === 1 ? '' : 'es'} detected in ${file.name}`);
    if (fileRef.current) fileRef.current.value = ''; // allow re-uploading the same file
  };

  const visible = expanded ? value.slice(0, MAX_RENDERED_CHIPS) : value.slice(0, COLLAPSED_CHIPS);
  const hidden = value.length - visible.length;

  return (
    <div>
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          {visible.map((email) => (
            <span key={email} className="inline-flex items-center gap-1 rounded-full border border-brand/60 bg-brand-soft py-0.5 pl-2.5 pr-1.5 text-[11px]">
              {email}
              <button type="button" aria-label={`Remove ${email}`} onClick={() => onChange(value.filter((e) => e !== email))} className="rounded-full p-0.5 hover:bg-white">
                <X aria-hidden className="size-3" />
              </button>
            </span>
          ))}
          {hidden > 0 && (
            <button type="button" onClick={() => setExpanded(true)} className="rounded-full border border-brand/60 bg-brand-soft px-2 py-0.5 text-[11px] font-medium">
              +{hidden.toLocaleString()}
            </button>
          )}
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            onBlur={commitDraft}
            placeholder={value.length ? '' : 'recipient@example.com'}
            aria-label="Recipients"
            className="min-w-[160px] flex-1 bg-transparent py-1 text-xs placeholder:text-muted focus:outline-none"
          />
        </div>
        <input ref={fileRef} type="file" accept=".csv,.txt,text/csv,text/plain" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
        <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-brand hover:underline">
          <Upload aria-hidden className="size-3.5" />
          Upload List
        </button>
      </div>

      {value.length > 0 && (
        <p className="mt-1.5 flex items-center gap-3 text-[11px] text-ink-soft" aria-live="polite">
          <span>
            <strong className="font-semibold text-brand">{value.length.toLocaleString()}</strong> email address{value.length === 1 ? '' : 'es'} detected
          </span>
          {expanded && value.length > COLLAPSED_CHIPS && (
            <button type="button" onClick={() => setExpanded(false)} className="underline">Show fewer</button>
          )}
          <button type="button" onClick={() => onChange([])} className="underline">Clear all</button>
        </p>
      )}
    </div>
  );
}
