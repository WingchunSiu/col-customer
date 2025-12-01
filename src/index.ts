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

    for (let i = 0; i < processedEmails.length; i++) {
      const email = processedEmails[i];

      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`📧 Email ${i + 1}/${processedEmails.length} (UID: ${email.uid})`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

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
          skippedCount++;
          // Still mark as read since we've processed it
          uidsToMarkAsRead.push(email.uid);
          continue;
        }

        processedCount++;

        // Generate response
        console.log('\n💬 Generating response...');
        const result = await zhipuAI.generateResponse(
          email,
          {
            category: analysis.category,
            intent: analysis.intent,
            keywords: analysis.keywords,
            suggestedTemplate: analysis.suggestedTemplate,
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
            console.log(`✅ Draft saved (Message-ID: ${messageId})\n`);
            draftsSaved++;
          } catch (draftError) {
            console.error('⚠️ Failed to save draft:', draftError);
          }
        }

        // Mark for reading after successful processing
        uidsToMarkAsRead.push(email.uid);

      } catch (error) {
        console.error(`❌ Error processing email UID ${email.uid}:`, error);
        console.log('   Continuing to next email...\n');
        // Don't mark as read if processing failed
      }
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
