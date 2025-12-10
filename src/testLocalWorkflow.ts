import { EmailFetcher } from './services/emailFetcher.js';
import { EmailProcessor } from './services/emailProcessor.js';
import { ZhipuAIService } from './services/zhipuAI.js';
import { emailConfig, processingConfig, validateConfig } from './config/index.js';
import { config } from 'dotenv';
import { writeFileSync } from 'fs';

config();

/**
 * Local testing workflow - fetches real emails and processes them
 * WITHOUT saving drafts to the mailbox (saves to local file instead)
 */
async function testLocalWorkflow() {
  const startTime = Date.now();
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🧪 LOCAL WORKFLOW TEST - Started');
  console.log(`⏰ ${new Date().toISOString()}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  let fetcher: EmailFetcher | null = null;
  let processedCount = 0;
  let skippedCount = 0;
  const generatedDrafts: any[] = [];

  try {
    // Validate configuration
    validateConfig();
    console.log('✅ Configuration validated\n');

    // Force debug logging for local testing
    const testLogLevel = 'debug';
    console.log(`📊 Log Level: ${testLogLevel} (showing all details for testing)`);
    console.log(`⚠️  Draft saving: DISABLED (will save to local file instead)\n`);

    // Initialize services
    fetcher = new EmailFetcher(emailConfig);
    const processor = new EmailProcessor();

    const zhipuApiKey = process.env.ZHIPU_API_KEY;
    if (!zhipuApiKey) {
      throw new Error('ZHIPU_API_KEY not found in environment variables');
    }
    const zhipuAI = new ZhipuAIService(zhipuApiKey, './templates.json');

    // Connect to IMAP
    console.log('🔌 Connecting to IMAP server...');
    await fetcher.connect();
    console.log('✅ Connected\n');

    // Fetch recent unread emails (limit to 5 for testing)
    console.log('📥 Fetching unread emails (max 5 for testing)...\n');
    const emails = await fetcher.fetchUnreadEmails(5);

    if (emails.length === 0) {
      console.log('📭 No unread emails found.\n');
      console.log('💡 Tip: You can also test with fetchAllEmails() to include read emails.');
      return;
    }

    console.log(`📬 Found ${emails.length} unread email(s). Processing...\n`);

    // Process each email
    const processedEmails = processor.processMany(emails);

    // Blacklist of sender addresses to automatically skip
    const senderBlacklist = [
      'feedback@dailymotion.com',
      'noreply@dailymotion.com',
    ];

    for (let i = 0; i < processedEmails.length; i++) {
      const email = processedEmails[i];

      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`📧 Email ${i + 1}/${processedEmails.length}`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      // Check if sender is in blacklist
      if (senderBlacklist.includes(email.from.address.toLowerCase())) {
        console.log(`⛔ Auto-skipped: Blacklisted sender (${email.from.address})`);
        console.log('   This sender is on the auto-skip list.\n');
        skippedCount++;
        continue;
      }

      console.log(`From:    ${email.from.name || ''} <${email.from.address}>`);
      console.log(`Subject: ${email.subject}`);
      console.log(`Date:    ${email.date.toISOString()}`);
      console.log(`UID:     ${email.uid}`);

      if (email.appVersion) console.log(`App Ver: ${email.appVersion}`);
      if (email.deviceInfo) console.log(`Device:  ${email.deviceInfo}`);
      if (email.orderId) console.log(`Order:   ${email.orderId}`);

      console.log(`\n📝 Content Preview (first 300 chars):`);
      console.log(email.text.substring(0, 300).replace(/\n/g, ' ') + '...\n');

      try {
        // Analyze email
        console.log('🔍 Analyzing with AI...');
        const analysis = await zhipuAI.analyzeEmail(email);

        console.log(`Category:  ${analysis.category}`);
        console.log(`Intent:    ${analysis.intent}`);
        if (analysis.keywords.length > 0) {
          console.log(`Keywords:  ${analysis.keywords.slice(0, 5).join(', ')}`);
        }
        console.log(`Sentiment: ${analysis.sentiment}`);
        console.log(`Priority:  ${analysis.priority}`);
        console.log(`Important: ${analysis.isImportant ? '✅ Needs Reply' : '❌ Skip'}`);

        if (analysis.suggestedTemplate) {
          console.log(`Suggested: ${analysis.suggestedTemplate}`);
        }

        if (analysis.reasoning) {
          console.log(`\n💭 AI Reasoning:`);
          console.log(`   ${analysis.reasoning}`);
        }

        if (analysis.suggestedActions.length > 0) {
          console.log(`\n📋 Suggested Actions:`);
          analysis.suggestedActions.forEach((action, idx) => {
            console.log(`   ${idx + 1}. ${action}`);
          });
        }

        if (!analysis.isImportant) {
          console.log('\n⏭️  Skipping this email (not important)\n');
          skippedCount++;
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
            language: analysis.language,
          },
          true
        );

        console.log(`Language:  ${result.language}`);

        if (result.matchedTemplates && result.matchedTemplates.length > 0) {
          console.log(`\n📋 Matched Templates:`);
          result.matchedTemplates.forEach((t, idx) => {
            console.log(`   ${idx + 1}. ${t.scenario} (score: ${t.score.toFixed(2)})`);
          });
        } else {
          console.log(`Template:  ⚠️  No template matched - free-form response`);
        }

        console.log('\n🤖 Generated Response:');
        console.log('─────────────────────────────────────────────────');
        console.log(result.response);
        console.log('─────────────────────────────────────────────────\n');

        // Save draft info (but don't actually upload to mailbox)
        const replySubject = email.subject.toLowerCase().startsWith('re:')
          ? email.subject
          : `Re: ${email.subject}`;

        generatedDrafts.push({
          emailIndex: i + 1,
          uid: email.uid,
          originalFrom: email.from.address,
          originalSubject: email.subject,
          replySubject,
          analysis: {
            category: analysis.category,
            intent: analysis.intent,
            priority: analysis.priority,
            sentiment: analysis.sentiment,
          },
          response: {
            language: result.language,
            matchedTemplate: result.matchedTemplates?.[0]?.scenario || 'none',
            body: result.response,
          },
        });

        console.log('💾 Draft saved to local output (not uploaded to mailbox)\n');

      } catch (error) {
        console.error(`❌ Error processing email UID ${email.uid}:`, error);
        console.log('   Continuing to next email...\n');
      }
    }

    // Save all drafts to a local JSON file
    if (generatedDrafts.length > 0) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const outputFile = `./test-output-${timestamp}.json`;
      writeFileSync(outputFile, JSON.stringify(generatedDrafts, null, 2));
      console.log(`\n💾 Saved ${generatedDrafts.length} generated draft(s) to: ${outputFile}\n`);
    }

    // Final summary
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Test Summary');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Total Emails:        ${emails.length}`);
    console.log(`Processed (replied): ${processedCount} ✅`);
    console.log(`Skipped:             ${skippedCount} ⏭️`);
    console.log(`Drafts Generated:    ${generatedDrafts.length} 💾`);
    console.log(`Duration:            ${duration}s ⏱️`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('✅ Local test completed successfully!');
    console.log('💡 Review the generated drafts in the JSON file above.\n');

  } catch (error) {
    console.error('\n❌ Fatal error during testing:', error);
    process.exit(1);
  } finally {
    if (fetcher) {
      fetcher.disconnect();
      console.log('📪 Disconnected from IMAP server');
    }
  }
}

// Run the test
testLocalWorkflow().catch((error) => {
  console.error('❌ Unhandled error:', error);
  process.exit(1);
});
