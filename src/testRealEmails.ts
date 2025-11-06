import { EmailFetcher } from './services/emailFetcher.js';
import { EmailProcessor } from './services/emailProcessor.js';
import { ZhipuAIService } from './services/zhipuAI.js';
import { emailConfig, processingConfig, validateConfig } from './config/index.js';
import { config } from 'dotenv';

config();

async function testRealEmails() {
  console.log('🚀 Testing with REAL emails from inbox...\n');

  let fetcher: EmailFetcher | null = null;
  let runCompleted = false;

  // Validate configuration
  validateConfig();
  console.log('✅ Configuration validated\n');

  // Initialize services
  fetcher = new EmailFetcher(emailConfig);
  const processor = new EmailProcessor();

  const shouldSaveDrafts = processingConfig.saveDrafts;
  if (shouldSaveDrafts) {
    console.log('💾 Draft saving is ENABLED. Generated replies will be stored as email drafts.\n');
  }

  const zhipuApiKey = process.env.ZHIPU_API_KEY;
  if (!zhipuApiKey) {
    throw new Error('ZHIPU_API_KEY not found');
  }
  const zhipuAI = new ZhipuAIService(zhipuApiKey, './templates.json');

  try {
    // Connect to IMAP
    console.log('🔌 Connecting to IMAP server...');
    await fetcher.connect();
    console.log('✅ Connected\n');

    // Fetch 10 recent emails from the past day
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    console.log(`📥 Fetching emails from the past day (since ${yesterday.toLocaleDateString()})...\n`);
    const emails = await fetcher.fetchAllEmails(10, yesterday);

    if (emails.length === 0) {
      console.log('📭 No emails found.');
      return;
    }

    console.log(`Found ${emails.length} email(s). Processing...\n`);

    // Process each email
    const processedEmails = processor.processMany(emails);

    let totalTokens = 0;
    let needsReply = 0;
    let skipped = 0;

    for (let i = 0; i < processedEmails.length; i++) {
      const email = processedEmails[i];

      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`📧 Email ${i + 1}/${processedEmails.length}`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`From:    ${email.from.name || ''} <${email.from.address}>`);
      console.log(`Subject: ${email.subject}`);
      console.log(`Date:    ${email.date.toISOString()}`);

      if (email.appVersion) console.log(`App Ver: ${email.appVersion}`);
      if (email.deviceInfo) console.log(`Device:  ${email.deviceInfo}`);
      if (email.orderId) console.log(`Order:   ${email.orderId}`);

      console.log(`\n📝 Content Preview (first 200 chars):`);
      console.log(email.text.substring(0, 200).replace(/\n/g, ' ') + '...\n');

      // Analyze email
      console.log('🔍 Analyzing with AI...');
      const analysis = await zhipuAI.analyzeEmail(email);

      console.log(`Category:  ${analysis.category}`);
      console.log(`Sentiment: ${analysis.sentiment}`);
      console.log(`Priority:  ${analysis.priority}`);
      console.log(`Important: ${analysis.isImportant ? '✅ Needs Reply' : '❌ Skip'}`);

      if (analysis.suggestedActions.length > 0) {
        console.log(`Actions:   ${analysis.suggestedActions.slice(0, 2).join(', ')}`);
      }

      if (!analysis.isImportant) {
        console.log('\n⏭️  Skipping this email (not important)\n');
        skipped++;
        continue;
      }

      needsReply++;

      // Generate response
      console.log('\n💬 Generating response...');
      const result = await zhipuAI.generateResponse(
        email,
        analysis.category,
        true
      );

      console.log(`Language:  ${result.language}`);

      if (result.matchedTemplates && result.matchedTemplates.length > 0) {
        console.log(`Template:  ${result.matchedTemplates[0].scenario} (score: ${result.matchedTemplates[0].score})`);
      } else {
        console.log(`Template:  ⚠️  No template matched - free-form response`);
      }

      console.log('\n🤖 Generated Response:');
      console.log('─────────────────────────────────────────────────');
      console.log(result.response);
      console.log('─────────────────────────────────────────────────\n');

      if (shouldSaveDrafts) {
        const replySubject = email.subject.toLowerCase().startsWith('re:')
          ? email.subject
          : `Re: ${email.subject}`;
        const referencesHeaderEntry = Object.entries(email.headers || {}).find(
          ([key]) => key.toLowerCase() === 'references'
        );
        const referencesHeader = referencesHeaderEntry ? referencesHeaderEntry[1] : undefined;
        const references = Array.isArray(referencesHeader)
          ? [...referencesHeader]
          : referencesHeader
            ? [referencesHeader]
            : [];

        if (email.messageId && !references.includes(email.messageId)) {
          references.push(email.messageId);
        }

        try {
          console.log('📨 Saving draft to mailbox...');
          const messageId = await fetcher.appendDraft({
            to: email.from.address,
            subject: replySubject,
            body: result.response,
            inReplyTo: email.messageId,
            references,
          });
          console.log(`✅ Draft stored (Message-ID: ${messageId})\n`);
        } catch (draftError) {
          console.error('⚠️ Failed to save draft:', draftError);
        }
      }
    }

    // Summary
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Summary');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Total Emails:     ${processedEmails.length}`);
    console.log(`Needs Reply:      ${needsReply} ✅`);
    console.log(`Skipped:          ${skipped} ⏭️`);
    console.log(`Avg Tokens/Email: Check logs above`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    runCompleted = true;
  } finally {
    if (fetcher) {
      fetcher.disconnect();
      if (runCompleted) {
        console.log('✅ Test completed! Disconnected from IMAP server.');
      }
    }
  }
}

// Run the test
testRealEmails();
