import { EmailFetcher } from './services/emailFetcher.js';
import { emailConfig, validateConfig } from './config/index.js';
import { config } from 'dotenv';

config();

async function testDraft() {
  console.log('🧪 Testing Draft Functionality\n');
  console.log('⚠️  This will ONLY save to Drafts folder - NO emails will be sent!\n');

  // Validate configuration
  validateConfig();
  console.log('✅ Configuration validated\n');

  const fetcher = new EmailFetcher(emailConfig);

  try {
    // Connect to IMAP
    console.log('🔌 Connecting to IMAP server...');
    await fetcher.connect();
    console.log('✅ Connected\n');

    // Test 1: Simple English draft
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📝 Test 1: Simple English draft');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    const messageId1 = await fetcher.appendDraft({
      to: 'test@example.com',
      subject: 'Test Draft - Simple English',
      body: 'This is a simple test draft.\n\nIt should appear in your Drafts folder.\n\nBest regards,\nSupport Team',
    });
    console.log(`✅ Draft saved! Message-ID: ${messageId1}\n`);

    // Test 2: Draft with Chinese/UTF-8 characters and emoji
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📝 Test 2: UTF-8 with Chinese and emoji');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    const messageId2 = await fetcher.appendDraft({
      to: 'andrew@example.com',
      subject: '测试草稿 - Test with 中文 and emoji 🎉',
      body: '你好 Andrew,\n\n这是一个测试草稿邮件 📧\n\n包含中文、English and emoji 🚀\n\n祝好！\nFlareFlow Support 💼',
    });
    console.log(`✅ Draft saved! Message-ID: ${messageId2}\n`);

    // Test 3: Reply with threading headers
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📝 Test 3: Reply with threading headers');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    const originalMessageId = '<original-123@example.com>';
    const messageId3 = await fetcher.appendDraft({
      to: 'customer@example.com',
      subject: 'Re: Your support request',
      body: 'Thank you for contacting us.\n\nWe have received your request and will respond within 24 hours.\n\nBest regards,\nSupport Team',
      inReplyTo: originalMessageId,
      references: [originalMessageId],
    });
    console.log(`✅ Draft saved! Message-ID: ${messageId3}\n`);

    // Test 4: Multiple recipients and special characters in headers
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📝 Test 4: Multiple recipients & sanitization');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    const messageId4 = await fetcher.appendDraft({
      to: ['user1@example.com', 'user2@example.com'],
      subject: 'Test with "quotes" and special chars: <test>',
      body: 'Testing header sanitization:\n\n- Quotes\n- Angle brackets\n- Multiple recipients\n\nAll should be handled safely.',
      fromName: 'Support Team 👋',
    });
    console.log(`✅ Draft saved! Message-ID: ${messageId4}\n`);

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ All tests completed successfully!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\n📬 Please check your Drafts folder in your email client.');
    console.log(`📂 Mailbox: ${emailConfig.draftsMailbox || 'Drafts'}`);
    console.log('\n⚠️  IMPORTANT: These are DRAFTS only - they will NOT be sent automatically!');
    console.log('   You need to manually click "Send" if you want to send them.\n');

  } catch (error) {
    console.error('❌ Test failed:', error);
    throw error;
  } finally {
    fetcher.disconnect();
    console.log('✅ Disconnected from IMAP server.');
  }
}

// Run the test
testDraft().catch(console.error);
