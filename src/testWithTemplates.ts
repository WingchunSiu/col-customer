import { ZhipuAIService } from './services/zhipuAI.js';
import { ProcessedEmail } from './types/email.js';
import { config } from 'dotenv';

// Load environment variables
config();

async function testWithTemplates() {
  console.log('🚀 Starting Zhipu AI test with template matching...\n');

  const apiKey = process.env.ZHIPU_API_KEY;
  if (!apiKey) {
    console.error('❌ ZHIPU_API_KEY not found in environment variables');
    process.exit(1);
  }

  try {
    // Initialize Zhipu AI service with templates
    const zhipuAI = new ZhipuAIService(apiKey, './templates.json');
    console.log('✅ Zhipu AI service initialized with templates\n');

    // Test Case 1: Subscription issue (should match subscription templates)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📧 Test Case 1: Subscription Restoration Issue\n');

    const subscriptionEmail: ProcessedEmail = {
      uid: 1001,
      from: {
        name: 'John Doe',
        address: 'john.doe@example.com',
      },
      to: [{ name: 'Support', address: 'support@flareflow.tv' }],
      subject: 'My subscription is not working after restore',
      date: new Date(),
      text: `Hello,

I purchased a premium subscription yesterday but it's not showing up in my account. I tried to restore the purchase but it still says I'm on the free plan.

My Google Pay order number is GPA-1234-5678-9012.

Please help!

Thanks`,
      orderId: 'GPA-1234-5678-9012',
    };

    console.log(`Subject: ${subscriptionEmail.subject}`);
    console.log(`Content Preview: ${subscriptionEmail.text.substring(0, 100)}...\n`);

    // Analyze first
    console.log('🔍 Step 1: Analyzing email...\n');
    const analysis = await zhipuAI.analyzeEmail(subscriptionEmail);
    console.log(`Category:   ${analysis.category}`);
    console.log(`Sentiment:  ${analysis.sentiment}`);
    console.log(`Priority:   ${analysis.priority}`);
    console.log(`Important:  ${analysis.isImportant ? '✅ Needs Reply' : '❌ Skip'}\n`);

    // Generate response with templates
    console.log('💬 Step 2: Generating response with template matching...\n');
    const result = await zhipuAI.generateResponse(
      subscriptionEmail,
      analysis.category,
      true
    );

    console.log(`Detected Language: ${result.language}`);

    if (result.matchedTemplates) {
      console.log(`\n📋 Matched Templates:`);
      result.matchedTemplates.forEach((t, i) => {
        console.log(`   ${i + 1}. ${t.scenario} (score: ${t.score})`);
      });
    }

    console.log('\n🤖 Generated Response:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(result.response);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Test Case 2: Refund request (Chinese)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📧 Test Case 2: Refund Request (Chinese)\n');

    const refundEmail: ProcessedEmail = {
      uid: 1002,
      from: {
        name: '张三',
        address: 'zhangsan@example.com',
      },
      to: [{ name: 'Support', address: 'support@flareflow.tv' }],
      subject: '申请退款',
      date: new Date(),
      text: `你好，

我昨天购买了会员，但是发现功能不符合我的需求，希望能够申请退款。

订单号：ORD-2024-5678
支付方式：微信支付

谢谢！`,
      orderId: 'ORD-2024-5678',
    };

    console.log(`Subject: ${refundEmail.subject}`);
    console.log(`Content: ${refundEmail.text.substring(0, 100)}...\n`);

    const analysis2 = await zhipuAI.analyzeEmail(refundEmail);
    console.log(`Category:   ${analysis2.category}`);
    console.log(`Sentiment:  ${analysis2.sentiment}`);
    console.log(`Priority:   ${analysis2.priority}\n`);

    const result2 = await zhipuAI.generateResponse(
      refundEmail,
      analysis2.category,
      true
    );

    console.log(`Detected Language: ${result2.language}`);

    if (result2.matchedTemplates) {
      console.log(`\n📋 Matched Templates:`);
      result2.matchedTemplates.forEach((t, i) => {
        console.log(`   ${i + 1}. ${t.scenario} (score: ${t.score})`);
      });
    }

    console.log('\n🤖 Generated Response:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(result2.response);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Test Case 3: Technical issue
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📧 Test Case 3: Video Playback Issue\n');

    const techEmail: ProcessedEmail = {
      uid: 1003,
      from: {
        name: 'Maria Silva',
        address: 'maria@example.com',
      },
      to: [{ name: 'Support', address: 'support@flareflow.tv' }],
      subject: 'Videos not loading',
      date: new Date(),
      text: `Hi,

The videos keep buffering and won't play properly. I have a good internet connection but videos just show loading spinner.

Device: Samsung Galaxy S23
App version: 2.5.1

Please help fix this issue.`,
      deviceInfo: 'Samsung Galaxy S23',
      appVersion: '2.5.1',
    };

    console.log(`Subject: ${techEmail.subject}`);
    console.log(`Device: ${techEmail.deviceInfo}`);
    console.log(`App Version: ${techEmail.appVersion}\n`);

    const analysis3 = await zhipuAI.analyzeEmail(techEmail);
    console.log(`Category:   ${analysis3.category}`);
    console.log(`Sentiment:  ${analysis3.sentiment}`);
    console.log(`Priority:   ${analysis3.priority}\n`);

    const result3 = await zhipuAI.generateResponse(
      techEmail,
      analysis3.category,
      true
    );

    console.log(`Detected Language: ${result3.language}`);

    if (result3.matchedTemplates) {
      console.log(`\n📋 Matched Templates:`);
      result3.matchedTemplates.forEach((t, i) => {
        console.log(`   ${i + 1}. ${t.scenario} (score: ${t.score})`);
      });
    }

    console.log('\n🤖 Generated Response:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(result3.response);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('✅ All tests completed successfully!');

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    if (error instanceof Error) {
      console.error('Error details:', error.message);
    }
    process.exit(1);
  }
}

// Run the test
testWithTemplates();
