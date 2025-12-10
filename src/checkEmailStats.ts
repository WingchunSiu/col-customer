import { EmailFetcher } from './services/emailFetcher.js';
import { emailConfig, validateConfig } from './config/index.js';
import { config } from 'dotenv';

config();

async function checkEmailStats() {
  console.log('📊 Checking email statistics...\n');

  let fetcher: EmailFetcher | null = null;

  try {
    // Validate configuration
    validateConfig();

    // Initialize services
    fetcher = new EmailFetcher(emailConfig);

    // Connect to IMAP
    console.log('🔌 Connecting to IMAP server...');
    await fetcher.connect();
    console.log('✅ Connected\n');

    // Check emails for the past 7 days
    const days = 7;
    const stats: { date: string; total: number; unread: number }[] = [];

    for (let i = 0; i < days; i++) {
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() - i);
      targetDate.setHours(0, 0, 0, 0);

      const nextDay = new Date(targetDate);
      nextDay.setDate(nextDay.getDate() + 1);

      // console.log(`📅 Checking ${targetDate.toLocaleDateString()}...`);

      try {
        // Fetch all emails for this specific day using date range
        const allEmails = await fetcher.fetchAllEmails(1000, {
          since: targetDate,
          before: nextDay,
        });

        // Count unread emails for this specific day
        const unreadEmails = await fetcher.fetchUnreadEmails(1000, {
          since: targetDate,
          before: nextDay,
        });

        const dateStr = targetDate.toLocaleDateString('en-US', {
          month: '2-digit',
          day: '2-digit',
          year: 'numeric',
        });

        stats.push({
          date: dateStr,
          total: allEmails.length,
          unread: unreadEmails.length,
        });

        // console.log(`   Total: ${allEmails.length}, Unread: ${unreadEmails.length}`);
      } catch (error) {
        console.error(`   Error fetching emails for ${targetDate.toLocaleDateString()}:`, error);
        stats.push({
          date: targetDate.toLocaleDateString('en-US', {
            month: '2-digit',
            day: '2-digit',
            year: 'numeric',
          }),
          total: 0,
          unread: 0,
        });
      }
    }

    // Display summary
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Email Statistics Summary (Past 7 Days)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Date          | Total | Unread');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    stats.forEach((stat) => {
      console.log(
        `${stat.date.padEnd(13)} | ${String(stat.total).padStart(5)} | ${String(stat.unread).padStart(6)}`
      );
    });

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const totalEmails = stats.reduce((sum, stat) => sum + stat.total, 0);
    const totalUnread = stats.reduce((sum, stat) => sum + stat.unread, 0);
    const avgPerDay = (totalEmails / days).toFixed(1);

    console.log(`\nTotal (7 days):  ${totalEmails} emails`);
    console.log(`Total Unread:    ${totalUnread} emails`);
    console.log(`Avg per day:     ${avgPerDay} emails`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  } finally {
    if (fetcher) {
      fetcher.disconnect();
      console.log('✅ Disconnected from IMAP server.');
    }
  }
}

// Run the stats check
checkEmailStats();
