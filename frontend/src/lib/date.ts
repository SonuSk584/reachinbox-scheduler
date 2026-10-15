const badgeFmt = new Intl.DateTimeFormat('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', second: '2-digit' });
const shortFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const longFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

/** "Tue 9:15:12 AM" - the orange scheduled badge in the design. */
export const formatBadgeTime = (iso: string) => badgeFmt.format(new Date(iso)).replace(',', '');
/** "Nov 3, 10:23 AM" */
export const formatShort = (iso: string | Date) => shortFmt.format(typeof iso === 'string' ? new Date(iso) : iso);
/** "Nov 3, 2026, 10:23 AM" */
export const formatLong = (iso: string) => longFmt.format(new Date(iso));

const pad = (n: number) => String(n).padStart(2, '0');

/** Value format required by <input type="datetime-local"> (local time, no timezone). */
export const toLocalInputValue = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** Tomorrow at the given local hour (24h clock). */
export function tomorrowAt(hour: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(hour, 0, 0, 0);
  return d;
}
