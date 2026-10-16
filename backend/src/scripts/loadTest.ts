/**
 * Demonstrates behaviour under load: schedule many emails at once with a small hourly limit
 * and show where each one ends up.
 *
 *   npm run load:test -- --count 1000 --limit 5 --wait 20
 *
 * Needs the API and at least one worker running. Only the emails that fit in the current hour
 * are really sent through SMTP; the rest are given later slots.
 */
const API = process.env.API_URL ?? 'http://localhost:4000/api';

const arg = (name: string, fallback: number) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? Number(process.argv[i + 1]) : fallback;
};

interface Item { toEmail: string; subject: string; status: string; scheduledAt: string; sentAt: string | null }

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: { 'Content-Type': 'application/json' }, ...init });
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

async function fetchAll(kind: 'scheduled' | 'sent', subject: string): Promise<Item[]> {
  const out: Item[] = [];
  for (let page = 1; ; page++) {
    const r = await call<{ items: Item[]; total: number }>(`/emails/${kind}?page=${page}&limit=100&q=${encodeURIComponent(subject)}`);
    out.push(...r.items.filter((i) => i.subject === subject));
    if (page * 100 >= r.total) return out;
  }
}

async function main() {
  const count = arg('count', 1000);
  const limit = arg('limit', 5);
  const waitSec = arg('wait', 20);
  const runId = Date.now().toString(36);
  const subject = `Load test ${runId}`;

  const senders = await call<{ id: string; email: string }[]>('/senders');
  if (!senders.length) throw new Error('No senders. Run: npm run seed:senders 2');
  const sender = senders[senders.length - 1];

  console.log(`Scheduling ${count} emails from ${sender.email} with hourlyLimit=${limit} ...`);
  const started = Date.now();
  await call('/emails/schedule', {
    method: 'POST',
    body: JSON.stringify({
      senderId: sender.id,
      subject,
      body: '<p>Load test</p>',
      leads: Array.from({ length: count }, (_, i) => `load-${runId}-${String(i).padStart(5, '0')}@example.com`),
      delaySeconds: 0,
      hourlyLimit: limit,
    }),
  });
  console.log(`API accepted all ${count} in ${Date.now() - started} ms. Waiting ${waitSec}s for workers to assign slots...\n`);
  await new Promise((r) => setTimeout(r, waitSec * 1000));

  const [scheduled, sent] = await Promise.all([fetchAll('scheduled', subject), fetchAll('sent', subject)]);

  // Effective time of each email: when it was sent, or the slot it is now waiting for.
  const when = new Map<string, { at: number; status: string }>();
  for (const i of sent) when.set(i.toEmail, { at: new Date(i.sentAt ?? i.scheduledAt).getTime(), status: i.status });
  for (const i of scheduled) when.set(i.toEmail, { at: new Date(i.scheduledAt).getTime(), status: i.status });

  const perHour = new Map<string, number>();
  for (const { at } of when.values()) {
    const h = new Date(Math.floor(at / 3_600_000) * 3_600_000).toISOString().slice(0, 13) + ':00Z';
    perHour.set(h, (perHour.get(h) ?? 0) + 1);
  }

  const ordered = [...when.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v.at);
  let inversions = 0;
  for (let i = 1; i < ordered.length; i++) if (ordered[i] < ordered[i - 1]) inversions++;

  const rows = [...perHour.entries()].sort(([a], [b]) => a.localeCompare(b));
  console.log(`Accounted for ${when.size}/${count} emails  (sent so far: ${sent.length}, waiting: ${scheduled.length})`);
  console.log(`Busiest hour holds ${Math.max(...perHour.values())} emails (limit is ${limit})`);
  console.log(`Order inversions between neighbouring emails: ${inversions} of ${ordered.length - 1}`);
  console.log(`\nFirst 6 and last 2 hourly windows (UTC):`);
  for (const [h, n] of [...rows.slice(0, 6), ...(rows.length > 8 ? [['...', ''] as [string, string]] : []), ...rows.slice(-2)]) console.log(`  ${h}  ${n}`);
  console.log(`\nTotal windows used: ${rows.length}, last slot: ${new Date(Math.max(...ordered)).toISOString()}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
