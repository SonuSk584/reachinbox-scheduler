import { useRef, useState } from "react";
import { Calendar, Clock } from "lucide-react";
import { toast } from "sonner";
import { Button, IconButton } from "@/components/ui";
import { useOutsideClick } from "@/hooks/useOutsideClick";
import { formatShort, toLocalInputValue, tomorrowAt } from "@/lib/date";

interface SendLaterControlProps {
  value: Date | null;
  onChange: (next: Date | null) => void;
}

const QUICK_PICKS = [
  { label: "Tomorrow", hour: 9 },
  { label: "Tomorrow, 10:00 AM", hour: 10 },
  { label: "Tomorrow, 11:00 AM", hour: 11 },
  { label: "Tomorrow, 3:00 PM", hour: 15 },
];

/** Clock button + "Send Later" popover from the design. */
export function SendLaterControl({ value, onChange }: SendLaterControlProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const close = () => setOpen(false);
  useOutsideClick(ref, close, open);

  const toggle = () => {
    if (!open) setDraft(toLocalInputValue(value ?? tomorrowAt(9)));
    setOpen((v) => !v);
  };

  const apply = () => {
    const date = new Date(draft);
    if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) {
      toast.error("Pick a send time in the future");
      return;
    }
    onChange(date);
    close();
  };

  return (
    <div ref={ref} className="relative">
      <IconButton
        label="Send later"
        active={open || value !== null}
        onClick={toggle}
        aria-expanded={open}
        className="text-brand"
      >
        <Clock aria-hidden className="size-4" />
      </IconButton>

      {open && (
        <div
          role="dialog"
          aria-label="Send later"
          className="absolute right-0 top-full z-30 mt-2 flex max-h-[min(80vh,520px)] w-[290px] flex-col rounded-2xl border border-line bg-white p-4 shadow-xl"
        >
          <h2 className="mb-3 text-xs font-semibold">Send Later</h2>

          <label className="flex items-center gap-2 border-b border-line pb-2 text-xs text-ink-soft">
            <input
              type="datetime-local"
              aria-label="Pick date and time"
              value={draft}
              min={toLocalInputValue(new Date())}
              onChange={(e) => setDraft(e.target.value)}
              className="min-w-0 flex-1 bg-transparent focus:outline-none"
            />
            <Calendar aria-hidden className="size-3.5 shrink-0" />
          </label>

          <ul className="mt-2">
            {QUICK_PICKS.map((pick) => (
              <li key={pick.label}>
                <button
                  type="button"
                  onClick={() =>
                    setDraft(toLocalInputValue(tomorrowAt(pick.hour)))
                  }
                  className="w-full rounded-md px-1 py-2 text-left text-xs hover:bg-field"
                >
                  {pick.label}
                </button>
              </li>
            ))}
          </ul>

          <div className="mt-4 flex items-center justify-end gap-2">
            {value && (
              <button
                type="button"
                onClick={() => {
                  onChange(null);
                  close();
                }}
                className="mr-auto text-xs text-ink-soft underline"
              >
                Send now instead
              </button>
            )}
            <button type="button" onClick={close} className="px-3 py-1 text-xs">
              Cancel
            </button>
            <Button
              variant="outline"
              size="sm"
              className="rounded-full"
              onClick={apply}
            >
              Done
            </Button>
          </div>
          {value && (
            <p className="mt-3 text-[11px] text-ink-soft">
              Currently set for {formatShort(value)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
