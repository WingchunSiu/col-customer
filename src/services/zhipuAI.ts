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
   * Generate AI response for customer support email with template matching
   */
  async generateResponse(
    email: ProcessedEmail,
    category?: string,
    useTemplates: boolean = true
  ): Promise<{
    response: string;
    language: string;
    matchedTemplates?: Array<{ id: string; scenario: string; score: number }>;
  }> {
    let templateContext = '';
    let matchedTemplates: Array<{ id: string; scenario: string; score: number }> = [];
    let detectedLanguage = 'en';

    // Detect language first using AI
    detectedLanguage = await this.detectLanguage(email);

    // Try to use templates if available and requested
    if (useTemplates && this.templateRetriever && category) {
      const matches = this.templateRetriever.findBestMatches(email, category, 3);

      if (matches.length > 0) {
        // Use the best matching template directly
        const bestMatch = matches[0];
        const templateContent = this.templateRetriever.getTemplateContent(
          bestMatch.template,
          detectedLanguage
        );

        matchedTemplates.push({
          id: bestMatch.template.id,
          scenario: bestMatch.template.scenario,
          score: bestMatch.score,
        });

        // Personalize the template with user-specific information
        const personalizedResponse = await this.personalizeTemplate(
          templateContent,
          email,
          detectedLanguage
        );

        return {
          response: personalizedResponse,
          language: detectedLanguage,
          matchedTemplates,
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
   * Personalize template with user-specific information
   */
  private async personalizeTemplate(
    templateContent: string,
    email: ProcessedEmail,
    language: string
  ): Promise<string> {
    const prompt = `You are a customer support assistant. You have a pre-approved response template below. Your task is to personalize it by:

1. Keeping the template structure and main content EXACTLY as is
2. Only fill in or adjust user-specific details like:
 
3. If the template asks for information the user already provided, acknowledge it
4. Keep the same tone, structure, and language (${language})

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
   * Analyze email sentiment and categorize
   */
  async analyzeEmail(email: ProcessedEmail): Promise<{
    category: string;
    sentiment: string;
    priority: 'low' | 'medium' | 'high' | 'urgent';
    suggestedActions: string[];
    isImportant: boolean;
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

    const prompt = `Analyze this customer support email and provide:

1. Category: Choose EXACTLY ONE from this list (must match exactly):
   ${availableCategories.map(c => `- ${c}`).join('\n   ')}

2. Sentiment: positive, neutral, negative, or frustrated

3. Priority: low, medium, high, or urgent

4. Is Important: true if this requires a response, false if it's spam/irrelevant/unimportant feedback

5. Suggested actions (as a JSON array)

Email Details:
From: ${email.from.address}
Subject: ${email.subject}
Content: ${email.text}

IMPORTANT: The category MUST be one of the exact values from the list above.

Respond in JSON format only:
{
  "category": "...",
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
      return {
        category: '信息收集与跟进',
        sentiment: 'neutral',
        priority: 'medium',
        isImportant: true,
        suggestedActions: ['Review manually'],
      };
    }
  }

  /**
   * Make chat completion request to Zhipu AI
   */
  private async chat(messages: ZhipuMessage[], temperature = 0.7): Promise<string> {
    const request: ZhipuRequest = {
      model: 'glm-4.6',
      messages,
      temperature,
      stream: false,
    };

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(request),
    });

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
    prompt += `\nPlease respond in ${language} language.`;

    return prompt;
  }
}
