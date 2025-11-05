import { ZhipuAIService } from './services/zhipuAI.js';
import { ProcessedEmail } from './types/email.js';
import { config } from 'dotenv';

config();

async function testVagueEmails() {
  console.log('🧪 Testing vague/ambiguous emails...\n');

  const apiKey = process.env.ZHIPU_API_KEY;
  if (!apiKey) {
    console.error('❌ ZHIPU_API_KEY not found');
    process.exit(1);
  }

  const zhipuAI = new ZhipuAIService(apiKey, './templates.json');

  // Test Case 1: Super vague
  const vagueEmail1: ProcessedEmail = {
    uid: 2001,
    from: { name: 'User', address: 'user@example.com' },
    to: [{ name: 'Support', address: 'support@flareflow.tv' }],
    subject: 'Help',
    date: new Date(),
    text: 'Something is not working. Please help.',
  };

  // Test Case 2: Emotional but vague
  const vagueEmail2: ProcessedEmail = {
    uid: 2002,
    from: { name: 'User', address: 'user@example.com' },
    to: [{ name: 'Support', address: 'support@flareflow.tv' }],
    subject: 'This is frustrating',
    date: new Date(),
    text: "I'm really frustrated. Things don't work as expected.",
  };

  // Test Case 3: Generic problem
  const vagueEmail3: ProcessedEmail = {
    uid: 2003,
    from: { name: 'User', address: 'user@example.com' },
    to: [{ name: 'Support', address: 'support@flareflow.tv' }],
    subject: 'Problem',
    date: new Date(),
    text: 'I have a problem with my account.',
  };

  const testCases = [
    { name: 'Super Vague', email: vagueEmail1 },
    { name: 'Emotional Vague', email: vagueEmail2 },
    { name: 'Generic Problem', email: vagueEmail3 },
  ];

  for (const testCase of testCases) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📧 ${testCase.name}`);
    console.log(`Subject: ${testCase.email.subject}`);
    console.log(`Content: ${testCase.email.text}\n`);

    try {
      // Analyze
      const analysis = await zhipuAI.analyzeEmail(testCase.email);
      console.log(`Category:   ${analysis.category}`);
      console.log(`Sentiment:  ${analysis.sentiment}`);
      console.log(`Priority:   ${analysis.priority}\n`);

      // Generate response
      const result = await zhipuAI.generateResponse(
        testCase.email,
        analysis.category,
        true
      );

      console.log(`Detected Language: ${result.language}`);

      if (result.matchedTemplates && result.matchedTemplates.length > 0) {
        console.log(`\n📋 Matched Template:`);
        console.log(`   ${result.matchedTemplates[0].scenario} (score: ${result.matchedTemplates[0].score})`);
      } else {
        console.log(`\n⚠️  No template matched - AI generated free-form response`);
      }

      console.log('\n🤖 Response Preview:');
      console.log(result.response.substring(0, 300) + '...\n');

    } catch (error) {
      console.error(`❌ Error: ${error}\n`);
    }
  }

  console.log('✅ Vague email test completed');
}

testVagueEmails();
