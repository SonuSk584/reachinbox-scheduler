export type EmailStatus = 'scheduled' | 'sending' | 'sent' | 'failed';
export type InboxKind = 'scheduled' | 'sent';

export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

export interface Sender {
  id: string;
  email: string;
  name: string;
}

export interface EmailListItem {
  id: string;
  toEmail: string;
  subject: string;
  snippet: string;
  status: EmailStatus;
  scheduledAt: string;
  sentAt: string | null;
  updatedAt: string;
  previewUrl: string | null;
  error: string | null;
}

export interface EmailDetail {
  id: string;
  toEmail: string;
  subject: string;
  body: string;
  status: EmailStatus;
  scheduledAt: string;
  sentAt: string | null;
  previewUrl: string | null;
  error: string | null;
  senderEmail: string;
  senderName: string;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
}

export interface Counts {
  scheduled: number;
  sent: number;
  failed: number;
}

export interface ScheduleEmailPayload {
  senderId: string;
  subject: string;
  body: string;
  leads: string[];
  startTime?: string; // ISO 8601
  delaySeconds: number;
  hourlyLimit?: number;
}

export interface ScheduleEmailResult {
  batchId: string;
  scheduled: number;
  invalid: number;
  duplicates: number;
  firstSendAt: string;
  lastSendAt: string;
}

export interface SlackStatus {
  /** false when the server has no Slack app credentials, so connecting cannot work. */
  configured: boolean;
  connected: boolean;
  teamName: string | null;
  channel: string | null;
}
