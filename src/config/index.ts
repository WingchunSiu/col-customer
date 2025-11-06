import dotenv from 'dotenv';
import { EmailConfig } from '../types/email.js';

dotenv.config();

function parseDateFilter(raw?: string): { date?: Date; source: string } {
  const defaultLabel = 'today';

  if (!raw || raw.trim() === '') {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return { date: today, source: defaultLabel };
  }

  const normalized = raw.trim().toLowerCase();
  if (normalized === 'all' || normalized === 'none') {
    return { date: undefined, source: raw };
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid FETCH_DATE value "${raw}". Use YYYY-MM-DD or "all".`);
  }

  parsed.setHours(0, 0, 0, 0);
  return { date: parsed, source: raw };
}

export const emailConfig: EmailConfig = {
  host: process.env.IMAP_HOST || 'imap.secureserver.net',
  port: parseInt(process.env.IMAP_PORT || '993'),
  user: process.env.IMAP_USER || '',
  password: process.env.IMAP_PASSWORD || '',
  tls: process.env.IMAP_TLS === 'true',
  draftsMailbox: process.env.DRAFTS_MAILBOX || 'Drafts',
  senderAddress: process.env.REPLY_FROM_ADDRESS || process.env.IMAP_USER || '',
  senderName: process.env.REPLY_FROM_NAME || 'FlareFlow Support',
};

const dateFilterConfig = parseDateFilter(process.env.FETCH_DATE);

export const processingConfig = {
  fetchIntervalMinutes: parseInt(process.env.FETCH_INTERVAL_MINUTES || '5'),
  maxEmailsPerFetch: parseInt(process.env.MAX_EMAILS_PER_FETCH || '50'),
  markAsRead: process.env.MARK_AS_READ === 'true',
  dateFilter: dateFilterConfig.date,
  dateFilterSource: dateFilterConfig.source,
  saveDrafts: process.env.SAVE_DRAFTS === 'true',
};

export function validateConfig(): void {
  if (!emailConfig.user || !emailConfig.password) {
    throw new Error('Email credentials not configured. Please check .env file.');
  }
}
