import { ZhipuAIService } from './services/zhipuAI.js';
import { ProcessedEmail } from './types/email.js';
import { config } from 'dotenv';

// Load environment variables
config();

async function testZhipuAI() {
  console.log('🚀 Starting Zhipu AI test...\n');

  const apiKey = process.env.ZHIPU_API_KEY;
  if (!apiKey) {
    console.error('❌ ZHIPU_API_KEY not found in environment variables');
    process.exit(1);
  }

  try {
    // Initialize Zhipu AI service with templates
    const zhipuAI = new ZhipuAIService(apiKey, './templates.json');
    console.log('✅ Zhipu AI service initialized with templates\n');

    // Create a mock email for testing
    const mockEmail: ProcessedEmail = {
      uid: 12345,
      messageId: 'msg-12345',
      from: {
        name: 'Test User',
        address: 'testuser@example.com',
      },
      to: ['support@flareflow.tv'],
      subject: 'Cannot play videos on iPhone',
      date: new Date(),
      text: `Hi support team,

I'm having trouble playing videos on my iPhone 14 Pro. When I try to play any video, the app just shows a loading spinner and nothing happens.

My app version is 2.1.3 and I'm using iOS 17.

Order ID: ORD-2024-1234

Can you please help?

Thanks,
Test User`,
      headers: {},
      appVersion: '2.1.3',
      deviceInfo: 'iPhone 14 Pro',
      orderId: 'ORD-2024-1234',
    };

    console.log('📧 Mock Email:');
    console.log(`From: ${mockEmail.from.name} <${mockEmail.from.address}>`);
    console.log(`Subject: ${mockEmail.subject}`);
    console.log(`Device: ${mockEmail.deviceInfo}`);
    console.log(`App Version: ${mockEmail.appVersion}`);
    console.log(`Order ID: ${mockEmail.orderId}`);
    console.log(`\nContent:\n${mockEmail.text}\n`);

    // Test 1: Analyze email
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔍 Test 1: Analyzing email...\n');

    const analysis = await zhipuAI.analyzeEmail(mockEmail);

    console.log('📊 Analysis Results:');
    console.log(`Language:         ${analysis.language}`);
    console.log(`Category:         ${analysis.category}`);
    console.log(`Intent:           ${analysis.intent}`);
    console.log(`Keywords:         ${analysis.keywords.join(', ')}`);
    console.log(`Suggested Templ:  ${analysis.suggestedTemplate || 'None'}`);
    console.log(`Sentiment:        ${analysis.sentiment}`);
    console.log(`Priority:         ${analysis.priority}`);
    console.log(`Important:        ${analysis.isImportant}`);
    console.log(`Reasoning:        ${analysis.reasoning}`);
    console.log(`Actions:          ${analysis.suggestedActions.join(', ')}`);

    // Test 2: Generate response
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('💬 Test 2: Generating AI response...\n');

    const result = await zhipuAI.generateResponse(mockEmail, {
      category: analysis.category,
      intent: analysis.intent,
      keywords: analysis.keywords,
      suggestedTemplate: analysis.suggestedTemplate,
      language: analysis.language,
    });

    console.log('🤖 Generated Response:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(result.response);
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
testZhipuAI();
