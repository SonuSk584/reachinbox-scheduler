import { relations, sql } from 'drizzle-orm';
import {
  datetime,
  index,
  int,
  longtext,
  mysqlEnum,
  mysqlTable,
  text,
  varchar,
} from 'drizzle-orm/mysql-core';

// MySQL has no RETURNING and no native uuid type, so ids are CHAR(36) UUIDs
// generated in application code (randomUUID) - we always know the id before insert.
const id = () => varchar('id', { length: 36 }).primaryKey();
const ts = (name: string) => datetime(name, { mode: 'date', fsp: 3 });
const now = sql`CURRENT_TIMESTAMP(3)`;

export const EMAIL_STATUSES = ['scheduled', 'sending', 'sent', 'failed'] as const;
export type EmailStatus = (typeof EMAIL_STATUSES)[number];

export const users = mysqlTable('users', {
  id: id(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  avatarUrl: text('avatar_url'),
  googleId: varchar('google_id', { length: 64 }).unique(),
  passwordHash: varchar('password_hash', { length: 255 }),
  createdAt: ts('created_at').notNull().default(now),
});

// A "sender" is an SMTP identity (Ethereal accounts for this project).
export const senders = mysqlTable(
  'senders',
  {
    id: id(),
    userId: varchar('user_id', { length: 36 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
    email: varchar('email', { length: 255 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    smtpHost: varchar('smtp_host', { length: 255 }).notNull(),
    smtpPort: int('smtp_port').notNull(),
    smtpUser: varchar('smtp_user', { length: 255 }).notNull(),
    smtpPass: varchar('smtp_pass', { length: 255 }).notNull(),
    createdAt: ts('created_at').notNull().default(now),
  },
  (t) => [index('senders_user_idx').on(t.userId)],
);

// One compose action = one batch. Subject/body live here once, not per recipient.
export const batches = mysqlTable('batches', {
  id: id(),
  userId: varchar('user_id', { length: 36 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  senderId: varchar('sender_id', { length: 36 }).notNull().references(() => senders.id),
  subject: varchar('subject', { length: 500 }).notNull(),
  body: longtext('body').notNull(), // HTML from the rich-text editor
  startTime: ts('start_time').notNull(),
  delaySeconds: int('delay_seconds').notNull().default(0),
  hourlyLimit: int('hourly_limit'), // null => use MAX_EMAILS_PER_HOUR_PER_SENDER
  createdAt: ts('created_at').notNull().default(now),
});

// One row per recipient. This is the source of truth; BullMQ is only the timer.
export const emails = mysqlTable(
  'emails',
  {
    id: id(), // also used as the BullMQ jobId
    batchId: varchar('batch_id', { length: 36 }).notNull().references(() => batches.id, { onDelete: 'cascade' }),
    userId: varchar('user_id', { length: 36 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
    senderId: varchar('sender_id', { length: 36 }).notNull().references(() => senders.id),
    seq: int('seq').notNull(), // position inside the batch, preserves order on reschedule
    toEmail: varchar('to_email', { length: 320 }).notNull(),
    scheduledAt: ts('scheduled_at').notNull(),
    sentAt: ts('sent_at'),
    status: mysqlEnum('status', EMAIL_STATUSES).notNull().default('scheduled'),
    attempts: int('attempts').notNull().default(0),
    error: text('error'),
    messageId: varchar('message_id', { length: 255 }),
    previewUrl: varchar('preview_url', { length: 500 }), // Ethereal inbox preview link
    createdAt: ts('created_at').notNull().default(now),
    updatedAt: ts('updated_at').notNull().default(now),
  },
  (t) => [
    index('emails_user_status_idx').on(t.userId, t.status, t.scheduledAt),
    index('emails_status_idx').on(t.status, t.scheduledAt),
    index('emails_batch_idx').on(t.batchId),
  ],
);

export const emailsRelations = relations(emails, ({ one }) => ({
  batch: one(batches, { fields: [emails.batchId], references: [batches.id] }),
  sender: one(senders, { fields: [emails.senderId], references: [senders.id] }),
}));

export type User = typeof users.$inferSelect;
export type Sender = typeof senders.$inferSelect;
export type Batch = typeof batches.$inferSelect;
export type Email = typeof emails.$inferSelect;
