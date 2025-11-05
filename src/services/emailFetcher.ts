import Imap from 'imap';
import { simpleParser } from 'mailparser';
import { EmailConfig, EmailMessage } from '../types/email.js';

export interface EmailDateFilter {
  on?: Date;
  since?: Date;
  before?: Date;
}

export class EmailFetcher {
  private imap: Imap;
  private connected: boolean = false;

  constructor(private config: EmailConfig) {
    this.imap = new Imap({
      user: config.user,
      password: config.password,
      host: config.host,
      port: config.port,
      tls: config.tls,
      tlsOptions: { rejectUnauthorized: false },
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.imap.once('ready', () => {
      console.log('✅ IMAP connection ready');
      this.connected = true;
    });

    this.imap.once('error', (err: Error) => {
      console.error('❌ IMAP connection error:', err.message);
      this.connected = false;
    });

    this.imap.once('end', () => {
      console.log('📪 IMAP connection ended');
      this.connected = false;
    });
  }

  /**
   * Connect to IMAP server
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.imap.once('ready', () => resolve());
      this.imap.once('error', reject);
      this.imap.connect();
    });
  }

  /**
   * Disconnect from IMAP server
   */
  disconnect(): void {
    if (this.connected) {
      this.imap.end();
    }
  }

  /**
   * Fetch unread emails from INBOX.
   * @param limit Maximum number of emails to fetch.
   * @param filter Optional date-based filter (supports `since`, `before`, or `on`).
   *               Passing a Date directly keeps backwards compatibility and is treated as `since`.
   * @returns Array of parsed email messages.
   */
  async fetchUnreadEmails(
    limit: number = 50,
    filter?: Date | EmailDateFilter
  ): Promise<EmailMessage[]> {
    if (!this.connected) {
      throw new Error('IMAP not connected. Call connect() first.');
    }

    const dateFilter = this.normalizeDateFilter(filter);

    return new Promise((resolve, reject) => {
      this.imap.openBox('INBOX', false, (err, box) => {
        if (err) {
          reject(err);
          return;
        }

        // Build search criteria: UNSEEN + optional date filter
        const searchCriteria: any[] = ['UNSEEN'];
        if (dateFilter) {
          if (dateFilter.on) {
            searchCriteria.push(['ON', dateFilter.on]);
          } else {
            if (dateFilter.since) {
              searchCriteria.push(['SINCE', dateFilter.since]);
            }
            if (dateFilter.before) {
              searchCriteria.push(['BEFORE', dateFilter.before]);
            }
          }
        }

        // Search for unread emails
        this.imap.search(searchCriteria, (searchErr, uids) => {
          if (searchErr) {
            reject(searchErr);
            return;
          }

          if (!uids || uids.length === 0) {
            console.log('📭 No unread emails found');
            resolve([]);
            return;
          }

          const dateFilterMessage = this.buildDateFilterMessage(dateFilter);
          console.log(`📬 Found ${uids.length} unread email(s)${dateFilterMessage}`);

          // Limit the number of emails to fetch
          const uidsToFetch = uids.slice(0, limit);
          console.log(`📦 Fetching ${uidsToFetch.length} email(s)...`);

          const parsePromises: Promise<EmailMessage>[] = [];
          const fetch = this.imap.fetch(uidsToFetch, {
            bodies: '',
            struct: true,
          });

          fetch.on('message', (msg, seqno) => {
            let uid: number = 0;

            msg.on('attributes', (attrs) => {
              uid = attrs.uid;
            });

            msg.on('body', (stream) => {
              const parsePromise = new Promise<EmailMessage>((resolveEmail, rejectEmail) => {
                simpleParser(stream, (parseErr, parsed) => {
                  if (parseErr) {
                    console.error(`❌ Error parsing email UID ${uid}:`, parseErr.message);
                    rejectEmail(parseErr);
                    return;
                  }

                  const email: EmailMessage = {
                    uid,
                    messageId: parsed.messageId || `uid-${uid}`,
                    from: {
                      address: parsed.from?.value[0]?.address || 'unknown',
                      name: parsed.from?.value[0]?.name,
                    },
                    to: parsed.to?.value.map((t) => t.address || '') || [],
                    subject: parsed.subject || '(No Subject)',
                    text: parsed.text || '',
                    html: typeof parsed.html === 'string' ? parsed.html : undefined,
                    date: parsed.date || new Date(),
                    headers: parsed.headers as unknown as Record<string, string | string[]>,
                    attachments: parsed.attachments?.map((att) => ({
                      filename: att.filename || 'unknown',
                      contentType: att.contentType,
                      size: att.size,
                    })),
                  };

                  console.log(`  ✓ Parsed email UID ${uid}: ${email.subject}`);
                  resolveEmail(email);
                });
              });

              parsePromises.push(parsePromise);
            });
          });

          fetch.once('error', (fetchErr) => {
            reject(fetchErr);
          });

          fetch.once('end', async () => {
            try {
              const emails = await Promise.all(parsePromises);
              console.log(`✅ Successfully fetched and parsed ${emails.length} email(s)`);
              resolve(emails);
            } catch (error) {
              reject(error);
            }
          });
        });
      });
    });
  }

  /**
   * Fetch all emails (including read ones) from INBOX
   * @param limit Maximum number of emails to fetch
   * @param filter Optional date-based filter
   * @returns Array of parsed email messages
   */
  async fetchAllEmails(
    limit: number = 50,
    filter?: Date | EmailDateFilter
  ): Promise<EmailMessage[]> {
    if (!this.connected) {
      throw new Error('IMAP not connected. Call connect() first.');
    }

    const dateFilter = this.normalizeDateFilter(filter);

    return new Promise((resolve, reject) => {
      this.imap.openBox('INBOX', false, (err, box) => {
        if (err) {
          reject(err);
          return;
        }

        // Build search criteria: ALL (no UNSEEN filter) + optional date filter
        const searchCriteria: any[] = ['ALL'];
        if (dateFilter) {
          if (dateFilter.on) {
            searchCriteria.push(['ON', dateFilter.on]);
          } else {
            if (dateFilter.since) {
              searchCriteria.push(['SINCE', dateFilter.since]);
            }
            if (dateFilter.before) {
              searchCriteria.push(['BEFORE', dateFilter.before]);
            }
          }
        }

        this.imap.search(searchCriteria, (searchErr, results) => {
          if (searchErr) {
            reject(searchErr);
            return;
          }

          if (!results || results.length === 0) {
            console.log('📭 No emails found.');
            resolve([]);
            return;
          }

          // Limit results and get most recent
          const limitedResults = results.slice(-limit);
          console.log(`📬 Found ${results.length} email(s), fetching last ${limitedResults.length}...`);

          const fetch = this.imap.fetch(limitedResults, { bodies: '' });
          const parsePromises: Promise<EmailMessage>[] = [];

          fetch.on('message', (msg, seqno) => {
            let uid: number;
            const parsePromise = new Promise<EmailMessage>((resolveEmail, rejectEmail) => {
              msg.on('attributes', (attrs) => {
                uid = attrs.uid;
              });

              msg.on('body', (stream) => {
                simpleParser(stream, (parseErr, parsed) => {
                  if (parseErr) {
                    console.error(`❌ Error parsing email UID ${uid}:`, parseErr.message);
                    rejectEmail(parseErr);
                    return;
                  }

                  const email: EmailMessage = {
                    uid,
                    messageId: parsed.messageId || `uid-${uid}`,
                    from: {
                      address: parsed.from?.value[0]?.address || 'unknown',
                      name: parsed.from?.value[0]?.name,
                    },
                    to: parsed.to?.value.map((t) => t.address || '') || [],
                    subject: parsed.subject || '(No Subject)',
                    text: parsed.text || '',
                    html: typeof parsed.html === 'string' ? parsed.html : undefined,
                    date: parsed.date || new Date(),
                    headers: parsed.headers as unknown as Record<string, string | string[]>,
                    attachments: parsed.attachments?.map((att) => ({
                      filename: att.filename || 'unknown',
                      contentType: att.contentType,
                      size: att.size,
                    })),
                  };

                  console.log(`  ✓ Parsed email UID ${uid}: ${email.subject}`);
                  resolveEmail(email);
                });
              });
            });

            parsePromises.push(parsePromise);
          });

          fetch.once('error', (fetchErr) => {
            reject(fetchErr);
          });

          fetch.once('end', async () => {
            try {
              const emails = await Promise.all(parsePromises);
              console.log(`✅ Successfully fetched and parsed ${emails.length} email(s)`);
              resolve(emails);
            } catch (error) {
              reject(error);
            }
          });
        });
      });
    });
  }

  /**
   * Fetch today's unread emails (from midnight today)
   * @param limit Maximum number of emails to fetch
   * @returns Array of parsed email messages
   */
  async fetchTodaysUnreadEmails(limit: number = 50): Promise<EmailMessage[]> {
    const today = this.atStartOfDay(new Date());

    console.log(`📅 Fetching emails from today (${today.toLocaleDateString()})...`);
    return this.fetchUnreadEmails(limit, { on: today });
  }

  /**
   * Fetch unread emails for a specific calendar date.
   * @param date Date representing the target day (time component is ignored).
   * @param limit Maximum number of emails to fetch.
   */
  async fetchUnreadEmailsByDate(date: Date, limit: number = 50): Promise<EmailMessage[]> {
    const target = this.atStartOfDay(date);
    console.log(`📅 Fetching emails for ${target.toLocaleDateString()}...`);
    return this.fetchUnreadEmails(limit, { on: target });
  }

  /**
   * Fetch unread emails from the last N hours
   * @param hours Number of hours to look back
   * @param limit Maximum number of emails to fetch
   * @returns Array of parsed email messages
   */
  async fetchRecentUnreadEmails(hours: number, limit: number = 50): Promise<EmailMessage[]> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    console.log(`⏰ Fetching emails from last ${hours} hour(s)...`);
    return this.fetchUnreadEmails(limit, since);
  }

  /**
   * Mark emails as read
   * @param uids Array of email UIDs to mark as read
   */
  async markAsRead(uids: number[]): Promise<void> {
    if (!this.connected) {
      throw new Error('IMAP not connected');
    }

    return new Promise((resolve, reject) => {
      this.imap.openBox('INBOX', false, (err) => {
        if (err) {
          reject(err);
          return;
        }

        this.imap.addFlags(uids, ['\\Seen'], (flagErr) => {
          if (flagErr) {
            reject(flagErr);
          } else {
            console.log(`✅ Marked ${uids.length} email(s) as read`);
            resolve();
          }
        });
      });
    });
  }

  private normalizeDateFilter(filter?: Date | EmailDateFilter): EmailDateFilter | undefined {
    if (!filter) {
      return undefined;
    }

    if (filter instanceof Date) {
      return { since: this.atStartOfDay(filter) };
    }

    const normalized: EmailDateFilter = {};

    if (filter.on) {
      normalized.on = this.atStartOfDay(filter.on);
    }

    if (filter.since) {
      normalized.since = this.atStartOfDay(filter.since);
    }

    if (filter.before) {
      normalized.before = this.atStartOfDay(filter.before);
    }

    return normalized.on || normalized.since || normalized.before ? normalized : undefined;
  }

  private atStartOfDay(date: Date): Date {
    const normalized = new Date(date);
    normalized.setHours(0, 0, 0, 0);
    return normalized;
  }

  private buildDateFilterMessage(filter?: EmailDateFilter): string {
    if (!filter) {
      return '';
    }

    if (filter.on) {
      return ` (on ${filter.on.toLocaleDateString()})`;
    }

    const parts: string[] = [];
    if (filter.since) {
      parts.push(`since ${filter.since.toLocaleDateString()}`);
    }
    if (filter.before) {
      parts.push(`before ${filter.before.toLocaleDateString()}`);
    }

    if (parts.length === 0) {
      return '';
    }

    return ` (${parts.join(', ')})`;
  }
}
