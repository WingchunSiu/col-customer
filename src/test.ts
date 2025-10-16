import { EmailFetcher } from './services/emailFetcher.js';
import { EmailProcessor } from './services/emailProcessor.js';
import { emailConfig, processingConfig, validateConfig } from './config/index.js';

async function testEmailFetch() {
  console.log('🚀 Starting email fetch test...\n');

  try {
    // Validate configuration
    validateConfig();
    console.log('✅ Configuration validated\n');

    // Initialize services
    const fetcher = new EmailFetcher(emailConfig);
    const processor = new EmailProcessor();

    // Connect to IMAP
    console.log('🔌 Connecting to IMAP server...');
    await fetcher.connect();

    // Fetch unread emails (limit to 5 for testing)
    const testLimit = 5;
    const dateFilter = processingConfig.dateFilter;

    if (dateFilter) {
      console.log(
        `\n📥 Fetching up to ${testLimit} unread emails on ${dateFilter.toLocaleDateString()} (source: ${processingConfig.dateFilterSource})...\n`
      );
    } else {
      console.log('\n📥 Fetching unread emails without date filter (FETCH_DATE=all)...\n');
    }

    const emails = await fetcher.fetchUnreadEmails(
      testLimit,
      dateFilter ? { on: dateFilter } : undefined
    );

    if (emails.length === 0) {
      console.log('📭 No unread emails found. Test complete.');
      fetcher.disconnect();
      return;
    }

    // Process emails
    console.log(`\n🔍 Processing ${emails.length} email(s)...\n`);
    const processedEmails = processor.processMany(emails);

    // Display results
    processedEmails.forEach((email, index) => {
      console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`📧 Email ${index + 1}/${processedEmails.length}`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`UID:        ${email.uid}`);
      console.log(`From:       ${email.from.name || ''} <${email.from.address}>`);
      console.log(`Sanitized:  ${processor.sanitizeEmail(email.from.address)}`);
      console.log(`Subject:    ${email.subject}`);
      console.log(`Date:       ${email.date.toISOString()}`);

      if (email.appVersion) {
        console.log(`App Ver:    ${email.appVersion}`);
      }
      if (email.deviceInfo) {
        console.log(`Device:     ${email.deviceInfo}`);
      }
      if (email.orderId) {
        console.log(`Order ID:   ${email.orderId}`);
      }
      if (email.userId) {
        console.log(`User ID:    ${email.userId}`);
      }

      console.log(`\n📝 Content Preview (first 200 chars):`);
      console.log(email.text.substring(0, 200).replace(/\n/g, ' '));

      if (email.text.length > 200) {
        console.log('...');
      }
    });

    console.log(`\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`✅ Successfully processed ${processedEmails.length} email(s)`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    // Disconnect
    fetcher.disconnect();
    console.log('👋 Disconnected from IMAP server');

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test
testEmailFetch();
