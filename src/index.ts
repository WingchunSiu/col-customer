import { EmailFetcher } from './services/emailFetcher.js';
import { EmailProcessor } from './services/emailProcessor.js';
import { ZhipuAIService } from './services/zhipuAI.js';
import { emailConfig, processingConfig, validateConfig } from './config/index.js';
import { config } from 'dotenv';

config();

/**
 * Main entry point for automated email processing
 * - Fetches unread emails
 * - Generates AI-powered draft responses
 * - Marks emails as read after processing
 */
async function main() {
  const startTime = Date.now();
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🤖 Automated Email Processing - Started');
  console.log(`⏰ ${new Date().toISOString()}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  let fetcher: EmailFetcher | null = null;
  let processedCount = 0;
  let draftsSaved = 0;
  let skippedCount = 0;
  const uidsToMarkAsRead: number[] = [];

  try {
    // Validate configuration
    validateConfig();
    console.log('✅ Configuration validated\n');

    // Initialize services
    fetcher = new EmailFetcher(emailConfig);
    const processor = new EmailProcessor();

    const shouldSaveDrafts = processingConfig.saveDrafts;
    const shouldMarkAsRead = process.env.MARK_AS_READ === 'true';

    console.log(`💾 Save drafts: ${shouldSaveDrafts ? 'ENABLED' : 'DISABLED'}`);
    console.log(`📖 Mark as read: ${shouldMarkAsRead ? 'ENABLED' : 'DISABLED'}\n`);

    const zhipuApiKey = process.env.ZHIPU_API_KEY;
    if (!zhipuApiKey) {
      throw new Error('ZHIPU_API_KEY not found in environment variables');
    }
    const zhipuAI = new ZhipuAIService(zhipuApiKey, './templates.json');

    // Connect to IMAP
    console.log('🔌 Connecting to IMAP server...');
    await fetcher.connect();
    console.log('✅ Connected\n');

    // Fetch unread emails
    console.log('📥 Fetching unread emails...\n');
    const emails = await fetcher.fetchUnreadEmails(50);

    if (emails.length === 0) {
      console.log('📭 No unread emails found.\n');
      return;
    }

    console.log(`📬 Found ${emails.length} unread email(s). Processing...\n`);

    // Process each email
    const processedEmails = processor.processMany(emails);

    const logLevel = processingConfig.logLevel;

    // Blacklist of sender addresses to automatically skip
    const senderBlacklist = [
      'feedback@dailymotion.com',
      'noreply@dailymotion.com',
    ];

    // Process emails in batches with concurrency limit
    const CONCURRENCY_LIMIT = 3; // Zhipu AI concurrent request limit (reduced from 5 due to rate limits)

    const processEmail = async (email: typeof processedEmails[0], index: number) => {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`📧 Email ${index + 1}/${processedEmails.length} (UID: ${email.uid})`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      // Check if sender is in blacklist
      if (senderBlacklist.includes(email.from.address.toLowerCase())) {
        console.log(`⛔ Auto-skipped: Blacklisted sender (${email.from.address})`);
        console.log('   This sender is on the auto-skip list.\n');
        return { type: 'skipped' as const, uid: email.uid };
      }

      // Show details only in info/debug mode
      if (logLevel !== 'minimal') {
        const maskEmail = (addr: string) => {
          if (!processingConfig.redactPII) return addr;
          const [local, domain] = addr.split('@');
          return domain ? `${local.substring(0, 2)}***@${domain}` : '***';
        };

        console.log(`From:    ${maskEmail(email.from.address)}`);
        console.log(`Subject: ${logLevel === 'debug' ? email.subject : email.subject.substring(0, 30) + '...'}`);

        if (logLevel === 'debug') {
          console.log(`Date:    ${email.date.toISOString()}`);
          if (email.appVersion) console.log(`App Ver: ${email.appVersion}`);
          if (email.deviceInfo) console.log(`Device:  ${email.deviceInfo}`);
          if (email.orderId) console.log(`Order:   ${email.orderId}`);
          console.log(`\n📝 Content Preview:`);
          console.log(email.text.substring(0, 200).replace(/\n/g, ' ') + '...\n');
        }
      }

      try {
        // Analyze email
        console.log('🔍 Analyzing with AI...');
        const analysis = await zhipuAI.analyzeEmail(email);

        console.log(`Category:  ${analysis.category}`);
        console.log(`Intent:    ${analysis.intent}`);
        console.log(`Priority:  ${analysis.priority}`);
        console.log(`Important: ${analysis.isImportant ? '✅ Needs Reply' : '❌ Skip'}`);

        // Show detailed analysis only in debug mode
        if (logLevel === 'debug') {
          if (analysis.keywords.length > 0) {
            console.log(`Keywords:  ${analysis.keywords.slice(0, 3).join(', ')}`);
          }
          console.log(`Sentiment: ${analysis.sentiment}`);
          if (analysis.suggestedTemplate) {
            console.log(`Suggested: ${analysis.suggestedTemplate}`);
          }
          if (analysis.reasoning) {
            console.log(`Reasoning: ${analysis.reasoning.substring(0, 100)}...`);
          }
        }

        if (analysis.suggestedActions.length > 0) {
          console.log(`Actions:   ${analysis.suggestedActions.slice(0, 2).join(', ')}`);
        }

        if (!analysis.isImportant) {
          console.log('\n⏭️  Skipping this email (not important)\n');
          return { type: 'skipped' as const, uid: email.uid };
        }

        // Generate response
        console.log('\n💬 Generating response...');
        const result = await zhipuAI.generateResponse(
          email,
          {
            category: analysis.category,
            intent: analysis.intent,
            keywords: analysis.keywords,
            suggestedTemplate: analysis.suggestedTemplate,
            language: analysis.language,
          },
          true
        );

        console.log(`Language:  ${result.language}`);

        if (result.matchedTemplates && result.matchedTemplates.length > 0) {
          console.log(`Template:  ${result.matchedTemplates[0].scenario} (score: ${result.matchedTemplates[0].score})`);
        } else {
          console.log(`Template:  ⚠️  No template matched - free-form response`);
        }

        // Show response preview only in debug mode
        if (logLevel === 'debug') {
          console.log('\n🤖 Generated Response:');
          console.log('─────────────────────────────────────────────────');
          console.log(result.response.substring(0, 300) + '...');
          console.log('─────────────────────────────────────────────────\n');
        }

        // Save draft
        let messageId: string | undefined;
        if (shouldSaveDrafts && fetcher) {
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
            messageId = await fetcher.appendDraft({
              to: email.from.address,
              subject: replySubject,
              body: result.response,
              inReplyTo: email.messageId,
              references,
            });
            console.log(`✅ Draft saved (Message-ID: ${messageId})\n`);
          } catch (draftError) {
            console.error('⚠️ Failed to save draft:', draftError);
          }
        }

        return {
          type: 'processed' as const,
          uid: email.uid,
          messageId,
        };

      } catch (error) {
        console.error(`❌ Error processing email UID ${email.uid}:`, error);
        console.log('   Continuing to next email...\n');
        return { type: 'error' as const, uid: email.uid };
      }
    };

    // Process emails with concurrency control
    const results = [];
    for (let i = 0; i < processedEmails.length; i += CONCURRENCY_LIMIT) {
      const batch = processedEmails.slice(i, i + CONCURRENCY_LIMIT);
      console.log(`\n🔄 Processing batch ${Math.floor(i / CONCURRENCY_LIMIT) + 1}/${Math.ceil(processedEmails.length / CONCURRENCY_LIMIT)} (${batch.length} emails in parallel)...\n`);

      const batchResults = await Promise.all(
        batch.map((email, batchIndex) => processEmail(email, i + batchIndex))
      );

      results.push(...batchResults);

      // Add a small delay between batches to avoid rate limits
      if (i + CONCURRENCY_LIMIT < processedEmails.length) {
        console.log('⏸️  Waiting 2s before next batch...\n');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    // Collect statistics
    for (const result of results) {
      if (result.type === 'skipped') {
        skippedCount++;
        uidsToMarkAsRead.push(result.uid);
      } else if (result.type === 'processed') {
        processedCount++;
        if (result.messageId) {
          draftsSaved++;
        }
        uidsToMarkAsRead.push(result.uid);
      }
      // Errors don't get marked as read
    }

    // Mark all processed emails as read
    if (shouldMarkAsRead && uidsToMarkAsRead.length > 0) {
      console.log(`\n📖 Marking ${uidsToMarkAsRead.length} email(s) as read...`);
      try {
        await fetcher.markAsRead(uidsToMarkAsRead);
        console.log('✅ Emails marked as read\n');
      } catch (error) {
        console.error('⚠️ Failed to mark emails as read:', error);
      }
    }

    // Final summary
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Processing Summary');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Total Unread:        ${emails.length}`);
    console.log(`Processed (replied): ${processedCount} ✅`);
    console.log(`Skipped:             ${skippedCount} ⏭️`);
    console.log(`Drafts Saved:        ${draftsSaved} 💾`);
    console.log(`Marked as Read:      ${uidsToMarkAsRead.length} 📖`);
    console.log(`Duration:            ${duration}s ⏱️`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('✅ Processing completed successfully');

  } catch (error) {
    console.error('\n❌ Fatal error during processing:', error);
    process.exit(1);
  } finally {
    if (fetcher) {
      fetcher.disconnect();
      console.log('📪 Disconnected from IMAP server');
    }
  }
}

// Run the main function
main().catch((error) => {
  console.error('❌ Unhandled error:', error);
  process.exit(1);
});
