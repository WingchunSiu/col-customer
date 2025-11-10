import { EmailMessage, ProcessedEmail } from '../types/email.js';

export class EmailProcessor {
  /**
   * Process raw email and extract relevant fields
   */
  process(email: EmailMessage): ProcessedEmail {
    const processed: ProcessedEmail = {
      ...email,
      text: this.cleanText(email.text),
    };

    // Extract device info, app version, order ID, etc. from email body
    this.extractMetadata(processed);

    return processed;
  }

  /**
   * Clean HTML and normalize text
   */
  private cleanText(text: string): string {
    let cleaned = text;

    // Remove common email system metadata
    cleaned = cleaned.replace(/^##.*Reply above this line.*##/gim, '');
    cleaned = cleaned.replace(/^.*Répondre au dessus de cette ligne.*$/gim, '');

    // Remove HTML tags (basic cleanup)
    cleaned = cleaned.replace(/<[^>]*>/g, ' ');

    // Decode HTML entities
    cleaned = cleaned
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");

    // Normalize line breaks
    cleaned = cleaned.replace(/\r\n/g, '\n');

    // Remove excessive whitespace
    cleaned = cleaned.replace(/[ \t]+/g, ' '); // Multiple spaces to single
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n'); // Multiple newlines to double

    return cleaned.trim();
  }

  /**
   * Extract metadata from email content using regex patterns
   */
  private extractMetadata(email: ProcessedEmail): void {
    const text = email.text;

    // Extract app version (e.g., "Version: 1.2.3", "v1.2.3", "App version 1.2.3")
    const versionMatch = text.match(/(?:version|ver|v)[:\s]*(\d+\.\d+\.?\d*)/i);
    if (versionMatch) {
      email.appVersion = versionMatch[1];
    }

    // Extract device info (e.g., "iPhone 14 Pro", "Samsung Galaxy S23")
    const devicePatterns = [
      /device[:\s]+([\w\s]+)/i,
      /(iPhone|iPad|Samsung|Xiaomi|Huawei|OnePlus|Pixel)[\s]*([\w\s]+)/i,
      /model[:\s]+([\w\s]+)/i,
    ];

    for (const pattern of devicePatterns) {
      const match = text.match(pattern);
      if (match) {
        email.deviceInfo = match[0].trim();
        break;
      }
    }

    // Extract order ID (various formats)
    const orderPatterns = [
      /order[:\s#]+([\w-]+)/i,
      /transaction[:\s#]+([\w-]+)/i,
      /receipt[:\s#]+([\w-]+)/i,
      /purchase[:\s#]+([\w-]+)/i,
    ];

    for (const pattern of orderPatterns) {
      const match = text.match(pattern);
      if (match) {
        email.orderId = match[1];
        break;
      }
    }

    // Extract user ID (if present)
    const userIdMatch = text.match(/(?:user|uid|user\s*id)[:\s#]+([\w-]+)/i);
    if (userIdMatch) {
      email.userId = userIdMatch[1];
    }
  }

  /**
   * Sanitize email address for privacy
   */
  sanitizeEmail(email: string): string {
    const [local, domain] = email.split('@');
    if (!local || !domain) return email;

    if (local.length <= 3) {
      return `${local[0]}***@${domain}`;
    }

    const visibleChars = Math.ceil(local.length * 0.3);
    const visible = local.substring(0, visibleChars);
    return `${visible}***@${domain}`;
  }

  /**
   * Sanitize phone number for privacy
   */
  sanitizePhone(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 4) return '***';

    const last4 = digits.slice(-4);
    const stars = '*'.repeat(Math.max(digits.length - 4, 3));
    return `${stars}${last4}`;
  }

  /**
   * Batch process multiple emails
   */
  processMany(emails: EmailMessage[]): ProcessedEmail[] {
    return emails.map((email) => this.process(email));
  }
}
