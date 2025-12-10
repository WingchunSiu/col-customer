import { EmailFetcher } from './services/emailFetcher.js';
import { EmailProcessor } from './services/emailProcessor.js';
import { ZhipuAIService } from './services/zhipuAI.js';
import { emailConfig, processingConfig, validateConfig } from './config/index.js';
import { ProcessedEmail } from './types/email.js';
import { config } from 'dotenv';

config();

async function testConcurrency() {
  console.log('🚀 Testing CONCURRENT email processing with REAL emails...\n');
  console.log('⚠️  Draft saving is DISABLED for testing\n');

  let fetcher: EmailFetcher | null = null;
  let runCompleted = false;

  try {
    // Validate configuration
    validateConfig();
    console.log('✅ Configuration validated\n');

    // Initialize services
    fetcher = new EmailFetcher(emailConfig);
    const processor = new EmailProcessor();

    const zhipuApiKey = process.env.ZHIPU_API_KEY;
    if (!zhipuApiKey) {
      throw new Error('ZHIPU_API_KEY not found');
    }
    const zhipuAI = new ZhipuAIService(zhipuApiKey, './templates.json');

    // Connect to IMAP
    console.log('🔌 Connecting to IMAP server...');
    await fetcher.connect();
    console.log('✅ Connected\n');

    // Fetch recent emails
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    console.log(`📥 Fetching emails from the past day (since ${yesterday.toLocaleDateString()})...\n`);
    const emails = await fetcher.fetchAllEmails(9, yesterday); // Fetch first 9 for testing

    if (emails.length === 0) {
      console.log('📭 No emails found.');
      return;
    }

    console.log(`📬 Found ${emails.length} email(s). Processing with concurrency...\n`);

    // Process each email
    const processedEmails = processor.processMany(emails);

    // Concurrency settings
    const CONCURRENCY_LIMIT = 5;
    let processedCount = 0;
    let skippedCount = 0;

    // Processing function for each email
    const processEmail = async (email: ProcessedEmail, index: number) => {
      const startTime = Date.now();
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`📧 Email ${index + 1}/${processedEmails.length} (UID: ${email.uid})`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`From:    ${email.from.name || ''} <${email.from.address}>`);
      console.log(`Subject: ${email.subject.substring(0, 50)}...`);

      try {
        // Analyze email
        console.log('🔍 Analyzing with AI...');
        const analysis = await zhipuAI.analyzeEmail(email);

        console.log(`Category:  ${analysis.category}`);
        console.log(`Intent:    ${analysis.intent}`);
        console.log(`Priority:  ${analysis.priority}`);
        console.log(`Important: ${analysis.isImportant ? '✅ Needs Reply' : '❌ Skip'}`);

        if (!analysis.isImportant) {
          console.log('⏭️  Skipping this email (not important)');
          const duration = ((Date.now() - startTime) / 1000).toFixed(2);
          console.log(`⏱️  Processing time: ${duration}s\n`);
          return { type: 'skipped' as const, uid: email.uid, duration: parseFloat(duration) };
        }

        // Generate response
        console.log('💬 Generating response...');
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
          console.log(`Template:  ⚠️  No template matched`);
        }

        console.log('\n📝 Response Preview (first 150 chars):');
        console.log(result.response.substring(0, 150).replace(/\n/g, ' ') + '...');

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`⏱️  Processing time: ${duration}s`);
        console.log('✅ Email processed successfully\n');

        return {
          type: 'processed' as const,
          uid: email.uid,
          duration: parseFloat(duration),
        };

      } catch (error) {
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        console.error(`❌ Error processing email UID ${email.uid}:`, error);
        console.log(`⏱️  Processing time: ${duration}s\n`);
        return { type: 'error' as const, uid: email.uid, duration: parseFloat(duration) };
      }
    };

    // Track overall start time
    const overallStartTime = Date.now();

    // Process emails with concurrency control
    const results = [];
    for (let i = 0; i < processedEmails.length; i += CONCURRENCY_LIMIT) {
      const batch = processedEmails.slice(i, i + CONCURRENCY_LIMIT);
      const batchNum = Math.floor(i / CONCURRENCY_LIMIT) + 1;
      const totalBatches = Math.ceil(processedEmails.length / CONCURRENCY_LIMIT);

      console.log(`\n🔄 Processing batch ${batchNum}/${totalBatches} (${batch.length} emails in parallel)...`);
      console.log(`⏱️  Batch started at: ${new Date().toLocaleTimeString()}\n`);

      const batchStartTime = Date.now();
      const batchResults = await Promise.all(
        batch.map((email, batchIndex) => processEmail(email, i + batchIndex))
      );

      const batchDuration = ((Date.now() - batchStartTime) / 1000).toFixed(2);
      console.log(`✅ Batch ${batchNum} completed in ${batchDuration}s\n`);

      results.push(...batchResults);

      // Add a small delay between batches to avoid rate limits
      if (i + CONCURRENCY_LIMIT < processedEmails.length) {
        console.log('⏸️  Waiting 2s before next batch...\n');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    // Collect statistics
    const durations: number[] = [];
    for (const result of results) {
      if (result.type === 'skipped') {
        skippedCount++;
      } else if (result.type === 'processed') {
        processedCount++;
      }
      durations.push(result.duration);
    }

    const overallDuration = ((Date.now() - overallStartTime) / 1000).toFixed(2);
    const avgDuration = (durations.reduce((a, b) => a + b, 0) / durations.length).toFixed(2);
    const maxDuration = Math.max(...durations).toFixed(2);
    const minDuration = Math.min(...durations).toFixed(2);

    // Final summary
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Concurrency Test Summary');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Total Emails:         ${processedEmails.length}`);
    console.log(`Processed (replied):  ${processedCount} ✅`);
    console.log(`Skipped:              ${skippedCount} ⏭️`);
    console.log(`Errors:               ${results.filter(r => r.type === 'error').length} ❌`);
    console.log(`\n⏱️  Performance:`);
    console.log(`Overall Time:         ${overallDuration}s`);
    console.log(`Avg Time/Email:       ${avgDuration}s`);
    console.log(`Fastest Email:        ${minDuration}s`);
    console.log(`Slowest Email:        ${maxDuration}s`);
    console.log(`Concurrency Limit:    ${CONCURRENCY_LIMIT}`);

    // Calculate estimated time saved
    const sequentialEstimate = (durations.reduce((a, b) => a + b, 0)).toFixed(2);
    const timeSaved = (parseFloat(sequentialEstimate) - parseFloat(overallDuration)).toFixed(2);
    const speedup = (parseFloat(sequentialEstimate) / parseFloat(overallDuration)).toFixed(2);

    console.log(`\n💡 Efficiency:`);
    console.log(`Sequential Est:       ${sequentialEstimate}s`);
    console.log(`Time Saved:           ${timeSaved}s (${speedup}x faster)`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    runCompleted = true;
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
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
testConcurrency();
