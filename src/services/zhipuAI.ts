import { ProcessedEmail } from '../types/email.js';
import { TemplateRetriever } from './templateRetriever.js';

interface ZhipuMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ZhipuRequest {
  model: string;
  messages: ZhipuMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

interface ZhipuResponse {
  id: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class ZhipuAIService {
  private apiKey: string;
  private baseUrl = 'https://open.bigmodel.cn/api/paas/v4';
  private templateRetriever?: TemplateRetriever;

  constructor(apiKey: string, templatePath?: string) {
    this.apiKey = apiKey;
    if (templatePath) {
      this.templateRetriever = new TemplateRetriever(templatePath);
    }
  }

  /**
   * Generate AI response for customer support email with template matching and intent-based constraints
   */
  async generateResponse(
    email: ProcessedEmail,
    analysisResult: {
      category?: string;
      intent?: string;
      keywords?: string[];
      suggestedTemplate?: string;
      language?: string;
    },
    useTemplates: boolean = true
  ): Promise<{
    response: string;
    language: string;
    matchedTemplates?: Array<{ id: string; scenario: string; score: number }>;
  }> {
    const { category, intent, keywords, suggestedTemplate, language } = analysisResult;
    let templateContext = '';
    let matchedTemplates: Array<{ id: string; scenario: string; score: number }> = [];
    const detectedLanguage = language || 'en';

    // Try to use templates if available and requested
    if (useTemplates && this.templateRetriever && category) {
      console.log(`\n🔍 Starting AI template selection for category: ${category}...`);
      // Use AI to intelligently select the best template with reasoning
      const selectedTemplate = await this.selectTemplateWithReasoning(
        email,
        category,
        intent,
        keywords,
        suggestedTemplate
      );

      if (selectedTemplate) {
        console.log(`\n✓ AI Selected Template: ${selectedTemplate.scenario}`);
        console.log(`  Reasoning: ${selectedTemplate.reasoning}`);

        const templateContent = this.templateRetriever.getTemplateContent(
          selectedTemplate.template,
          detectedLanguage
        );

        matchedTemplates.push({
          id: selectedTemplate.template.id,
          scenario: selectedTemplate.template.scenario,
          score: selectedTemplate.score,
        });

        // Personalize the template with user-specific information and intent
        const personalizedResponse = await this.personalizeTemplate(
          templateContent,
          email,
          detectedLanguage,
          intent,
          keywords
        );

        return {
          response: personalizedResponse,
          language: detectedLanguage,
          matchedTemplates,
        };
      } else {
        // No suitable template found - return a message for manual review
        console.log('⚠️  No suitable template found - flagging for manual review');
        const manualReviewMessage = `📝 需要人工审核

该邮件已被分析为"${category}"类别，意图为"${intent}"，但未找到合适的预设模板。

邮件信息：
- 发件人: ${email.from.address}
- 主题: ${email.subject}
- 关键问题: ${keywords?.join(', ') || '无'}

请人工审核并提供适当的回复。`;

        return {
          response: manualReviewMessage,
          language: detectedLanguage,
          matchedTemplates: undefined,
        };
      }
    }

    // Fallback: generate response without template
    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = this.buildUserPrompt(email, detectedLanguage);

    const response = await this.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]);

    return {
      response,
      language: detectedLanguage,
      matchedTemplates: matchedTemplates.length > 0 ? matchedTemplates : undefined,
    };
  }

  /**
   * Use AI to intelligently select the best matching template with reasoning
   */
  private async selectTemplateWithReasoning(
    email: ProcessedEmail,
    category: string,
    intent?: string,
    keywords?: string[],
    suggestedTemplate?: string
  ): Promise<{ template: any; scenario: string; score: number; reasoning: string } | null> {
    // Get all templates for this category
    const allMatches = this.templateRetriever!.findBestMatches(email, category, 10);

    if (allMatches.length === 0) {
      return null;
    }

    // Prepare template options for AI
    const templateOptions = allMatches.map((match, idx) => ({
      index: idx,
      scenario: match.template.scenario,
      keywords: match.template.keywords.join(', '),
      score: match.score,
    }));

    const prompt = `You are a customer support expert. Your task is to select the MOST APPROPRIATE template for this email, or determine if NONE of them fit.

CONTEXT FROM PREVIOUS ANALYSIS:
- Category: ${category}
- Intent: ${intent || 'Unknown'}
- Identified Keywords: ${keywords?.join(', ') || 'None'}
${suggestedTemplate ? `- Initially Suggested Template: ${suggestedTemplate}` : ''}

EMAIL DETAILS:
From: ${email.from.address}
Subject: ${email.subject}
Content: ${email.text.substring(0, 500)}...

AVAILABLE TEMPLATES for category "${category}":
${templateOptions.map(t => `[${t.index}] Scenario: "${t.scenario}"
   Keywords: ${t.keywords}
   Match Score: ${t.score}`).join('\n\n')}

INSTRUCTIONS:
1. Carefully review the email content and the user's TRUE need/intent
2. Evaluate each template:
   - Does it address the user's specific issue?
   - Is the tone and approach appropriate?
   - Would using this template solve the user's problem?
3. Make a decision:
   - If you find a template that TRULY fits: Select it and explain WHY it's appropriate
   - If NO template fits well: Respond with "NO_SUITABLE_TEMPLATE" and explain WHY none of them match

CRITICAL RULES:
❌ Do NOT force a template match if it doesn't truly fit the user's needs
❌ Do NOT select a template just because keywords partially match
✅ DO prioritize the user's actual problem and intent
✅ DO be honest if none of the templates are appropriate

Respond in JSON format:
{
  "selectedIndex": <number or null>,
  "reasoning": "Detailed explanation of your choice (2-3 sentences)",
  "confidence": "high/medium/low"
}

If no template fits, use:
{
  "selectedIndex": null,
  "reasoning": "Explanation of why none of the templates are suitable",
  "confidence": "high"
}`;

    try {
      const response = await this.chat([{ role: 'user', content: prompt }], 0.3);

      // Parse AI response
      let cleanedResponse = response.trim();
      if (cleanedResponse.startsWith('```json')) {
        cleanedResponse = cleanedResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (cleanedResponse.startsWith('```')) {
        cleanedResponse = cleanedResponse.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }

      const decision = JSON.parse(cleanedResponse);

      if (decision.selectedIndex !== null && decision.selectedIndex >= 0 && decision.selectedIndex < allMatches.length) {
        const selected = allMatches[decision.selectedIndex];
        return {
          template: selected.template,
          scenario: selected.template.scenario,
          score: selected.score,
          reasoning: decision.reasoning,
        };
      } else {
        // No suitable template found
        console.log(`AI reasoning for no template: ${decision.reasoning}`);
        return null;
      }
    } catch (error) {
      console.error('Failed to select template with reasoning:', error);
      // Fallback to first match if AI reasoning fails
      const fallback = allMatches[0];
      return {
        template: fallback.template,
        scenario: fallback.template.scenario,
        score: fallback.score,
        reasoning: 'Fallback to highest scoring template due to selection error',
      };
    }
  }

  /**
   * Personalize template with user-specific information and intent context
   */
  private async personalizeTemplate(
    templateContent: string,
    email: ProcessedEmail,
    language: string,
    intent?: string,
    keywords?: string[]
  ): Promise<string> {
    // Build intent context for better personalization
    let intentContext = '';
    if (intent) {
      intentContext += `\nUser Intent: ${intent}`;
      if (keywords && keywords.length > 0) {
        intentContext += `\nKey Issues: ${keywords.join(', ')}`;
      }
    }

    const prompt = `You are a customer support assistant. You have a pre-approved response template below. Your task is to personalize it by:

1. Keeping the template structure and main content EXACTLY as is
2. Only fill in or adjust user-specific details like:
   - User's name or email
   - Order IDs, device info, or app version mentioned
   - Specific details from their message

3. If the template asks for information the user already provided, acknowledge it
4. Keep the same tone, structure, and language (${language})
${intentContext ? `
5. CRITICAL - Intent Alignment:
   ${intentContext}

   ENSURE your personalized response stays aligned with this intent:
   - If intent is REFUND_REQUEST/CANCEL_SUBSCRIPTION: DO NOT suggest restore/reactivation
   - If intent is RESTORE_PURCHASE: DO NOT suggest refund/cancellation
   - If intent is AD_REWARDS_ISSUE: DO NOT ask for payment proof or order numbers
   - Stay consistent with the identified user intent
` : ''}

IMPORTANT: Do NOT rewrite or change the template significantly. Only make minimal adjustments to personalize it.

Template:
${templateContent}

User's Email Subject: ${email.subject}
User's Email Content (first 300 chars): ${email.text.substring(0, 300)}

Personalized Response:`;

    const response = await this.chat([{ role: 'user', content: prompt }], 0.3);
    return response.trim();
  }

  /**
   * Analyze email sentiment and categorize with intent recognition
   */
  async analyzeEmail(email: ProcessedEmail): Promise<{
    category: string;
    intent: string;
    keywords: string[];
    sentiment: string;
    priority: 'low' | 'medium' | 'high' | 'urgent';
    suggestedActions: string[];
    suggestedTemplate?: string;
    reasoning: string;
    isImportant: boolean;
    language: string;
  }> {
    // Get available categories from template retriever
    const availableCategories = this.templateRetriever?.getCategories() || [
      '充值与订阅',
      '退款相关',
      '技术问题',
      '账户与登录',
      '内容与功能',
      '信息收集与跟进',
      '功能与活动',
      '查询与状态确认',
      '问题解决与关闭'
    ];

    const prompt = `Analyze this customer support email using Chain of Thought reasoning. You must identify the user's TRUE INTENT to provide consistent categorization.

Email Details:
From: ${email.from.address}
Subject: ${email.subject}
Content: ${email.text}

STEP 0: LANGUAGE DETECTION
First, identify the primary language of this email. Use two-letter ISO 639-1 language codes (e.g., "en" for English, "zh" for Chinese, "es" for Spanish, "pt" for Portuguese, etc.).

STEP 1: INTENT RECOGNITION (Most Critical)
Identify the user's primary intent by looking for these specific patterns:

REFUND/CANCELLATION INTENTS:
- Keywords: 退款, refund, 退钱, return money, 取消订阅, cancel subscription, unsubscribe, 取消自动续费, cancel auto-renewal, 不想继续, don't want to continue
- Intent Code: "REFUND_REQUEST" or "CANCEL_SUBSCRIPTION"
- Category: 退款相关
- User wants their MONEY BACK or wants to STOP being charged

RESTORE/ACTIVATION INTENTS:
- Keywords: 没到账, not received, 未生效, not activated, 恢复购买, restore purchase, 已支付但未显示, paid but not showing
- Intent Code: "RESTORE_PURCHASE" or "ACTIVATION_ISSUE"
- Category: 充值与订阅
- User PAID but service NOT working (they want service, not refund)

AD/REWARD INTENTS:
- Keywords: 广告, ads, advertisement, bonus, 奖励, rewards, 看广告, watch ads, 签到, daily check-in
- Intent Code: "AD_REWARDS_ISSUE"
- Category: 功能与活动
- User asking about ad-watching features or bonuses

TECHNICAL INTENTS:
- Keywords: 崩溃, crash, 卡顿, lag, 无法播放, cannot play, 登录失败, login failed, bug, 闪退
- Intent Code: "TECHNICAL_ISSUE"
- Category: 技术问题
- App functionality problems

STEP 2: EXTRACT KEYWORDS
List the specific keywords/phrases that led you to identify this intent.

STEP 3: CATEGORY SELECTION
Choose EXACTLY ONE category from this list (must match exactly):
${availableCategories.map(c => `- ${c}`).join('\n')}

STEP 4: TEMPLATE SUGGESTION
Based on the intent, suggest the most specific template scenario (in Chinese) from the category.

Examples of template scenarios:
- For REFUND_REQUEST: "用户申请退款"
- For CANCEL_SUBSCRIPTION: "用户自行取消连续订阅"
- For RESTORE_PURCHASE: "恢复购买+提供信息"
- For AD_REWARDS_ISSUE: "看广告（次数或者未获得奖励）"

STEP 5: OTHER ANALYSIS
- Sentiment: positive, neutral, negative, or frustrated
- Priority: low, medium, high, or urgent
- Is Important: Mark FALSE if system notifications/spam/marketing. Mark TRUE if real user support request.
- Suggested actions: List 2-3 specific actions

STEP 6: REASONING
Write a brief explanation (1-2 sentences) of WHY you chose this intent and category.

CRITICAL RULES:
❌ DO NOT confuse "退款相关" (wants money back) with "充值与订阅" (paid but not received)
❌ DO NOT ask for order numbers for ad/bonus questions
❌ DO NOT use "充值与订阅" if user explicitly wants refund/cancellation

Respond in JSON format only:
{
  "language": "...",
  "category": "...",
  "intent": "...",
  "keywords": ["keyword1", "keyword2", ...],
  "suggestedTemplate": "...",
  "reasoning": "...",
  "sentiment": "...",
  "priority": "...",
  "isImportant": true/false,
  "suggestedActions": ["..."]
}`;

    const response = await this.chat([
      { role: 'user', content: prompt },
    ]);

    try {
      // Clean up markdown code blocks if present
      let cleanedResponse = response.trim();
      if (cleanedResponse.startsWith('```json')) {
        cleanedResponse = cleanedResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (cleanedResponse.startsWith('```')) {
        cleanedResponse = cleanedResponse.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }
      return JSON.parse(cleanedResponse);
    } catch (error) {
      console.error('Failed to parse AI analysis:', error);
      console.error('Raw response:', response);
      return {
        language: 'en',
        category: '信息收集与跟进',
        intent: 'UNKNOWN',
        keywords: [],
        sentiment: 'neutral',
        priority: 'medium',
        isImportant: true,
        suggestedActions: ['Review manually'],
        reasoning: 'Failed to parse AI response',
      };
    }
  }

  /**
   * Make chat completion request to Zhipu AI with retry logic
   */
  private async chat(messages: ZhipuMessage[], temperature = 0.7, retries = 2): Promise<string> {
    const request: ZhipuRequest = {
      model: 'glm-4.6',
      messages,
      temperature,
      stream: false,
    };

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 90000); // 90 second timeout

        const response = await fetch(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(request),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const error = await response.text();
          throw new Error(`Zhipu AI API error: ${response.status} - ${error}`);
        }

        const data = (await response.json()) as ZhipuResponse;

        if (!data.choices || data.choices.length === 0) {
          throw new Error('No response from Zhipu AI');
        }

        // Log token usage if available
        if (data.usage) {
          console.log(`[Zhipu AI] Tokens - Input: ${data.usage.prompt_tokens}, Output: ${data.usage.completion_tokens}, Total: ${data.usage.total_tokens}`);
        }

        return data.choices[0].message.content;

      } catch (error: any) {
        const isTimeout = error.name === 'AbortError' || error.name === 'TimeoutError';

        if (attempt < retries && isTimeout) {
          console.log(`[Zhipu AI] Timeout on attempt ${attempt + 1}, retrying...`);
          await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s before retry
          continue;
        }

        // Last attempt or non-timeout error
        throw error;
      }
    }

    throw new Error('Failed after all retries');
  }

  /**
   * Translate text to Chinese for internal review
   */
  async translateToChinese(text: string): Promise<string> {
    const messages: ZhipuMessage[] = [
      {
        role: 'user',
        content: `Translate the following customer support email to Chinese. Keep the translation natural and professional. Only output the translation, no explanations.

Text to translate:
${text}`,
      },
    ];

    try {
      return await this.chat(messages, 0.3);
    } catch (error) {
      console.error('Translation failed:', error);
      return '[Translation failed]';
    }
  }

  /**
   * Build system prompt for customer support
   */
  private buildSystemPrompt(context?: string): string {
    let prompt = `You are a helpful customer support assistant for Flareflow, a streaming platform service.
Your role is to provide professional, empathetic, and accurate responses to customer inquiries.

Guidelines:
- Be polite, professional, and empathetic
- Provide clear and concise answers
- If you don't know something, acknowledge it and suggest escalation
- Always prioritize customer satisfaction
- Use proper formatting for readability`;

    if (context) {
      prompt += `\n\nAdditional Context:\n${context}`;
    }

    return prompt;
  }

  /**
   * Detect language of email using AI
   */
  private async detectLanguage(email: ProcessedEmail): Promise<string> {
    const prompt = `Detect the primary language of this email. Reply with ONLY the two-letter ISO 639-1 language code (e.g., "en", "zh", "es", "pt", "fr", etc.).

Subject: ${email.subject}
Content: ${email.text.substring(0, 500)}

Language code:`;

    const response = await this.chat([{ role: 'user', content: prompt }], 0.1);

    // Extract just the language code
    const langCode = response.trim().toLowerCase().match(/^[a-z]{2}/)?.[0] || 'en';
    return langCode;
  }

  /**
   * Build user prompt from email
   */
  private buildUserPrompt(email: ProcessedEmail, language: string = 'en'): string {
    const isChinese = language === 'zh' || language === 'zh-CN';

    let prompt = `Please draft a response to this customer support email:\n\n`;
    prompt += `From: ${email.from.address}\n`;
    prompt += `Subject: ${email.subject}\n`;

    if (email.appVersion) {
      prompt += `App Version: ${email.appVersion}\n`;
    }
    if (email.deviceInfo) {
      prompt += `Device: ${email.deviceInfo}\n`;
    }
    if (email.orderId) {
      prompt += `Order ID: ${email.orderId}\n`;
    }

    prompt += `\nMessage:\n${email.text}\n`;
    prompt += `\nDetected Language: ${language}\n`;

    if (isChinese) {
      prompt += `\nPlease respond in Chinese.`;
    } else {
      prompt += `\nPlease respond in ${language} language.`;
    }

    return prompt;
  }
}
