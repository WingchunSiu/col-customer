export interface EmailConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  tls: boolean;
  draftsMailbox?: string;
  senderAddress?: string;
  senderName?: string;
}

export interface EmailMessage {
  uid: number;
  messageId: string;
  from: {
    address: string;
    name?: string;
  };
  to: string[];
  subject: string;
  text: string; // Plain text content
  html?: string; // Original HTML
  date: Date;
  headers: Record<string, string | string[]>;
  attachments?: Array<{
    filename: string;
    contentType: string;
    size: number;
  }>;
}

export interface ProcessedEmail extends EmailMessage {
  // Fields to be extracted by preprocessing
  deviceInfo?: string;
  appVersion?: string;
  orderId?: string;
  userId?: string;
}
