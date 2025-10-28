import { readFileSync } from 'fs';
import { ProcessedEmail } from '../types/email.js';

interface Template {
  id: string;
  category: string;
  scenario: string;
  keywords: string[];
  languages: {
    [key: string]: string;
  };
}

interface TemplateDatabase {
  version: string;
  generatedAt: string;
  totalTemplates: number;
  templates: Template[];
}

interface TemplateMatch {
  template: Template;
  score: number;
  matchedKeywords: string[];
}

export class TemplateRetriever {
  private templates: Template[] = [];
  private categoryIndex: Map<string, Template[]> = new Map();
  private keywordIndex: Map<string, Template[]> = new Map();

  constructor(templatePath: string) {
    this.loadTemplates(templatePath);
    this.buildIndexes();
  }

  /**
   * Load templates from JSON file
   */
  private loadTemplates(templatePath: string): void {
    const content = readFileSync(templatePath, 'utf-8');
    const data: TemplateDatabase = JSON.parse(content);
    this.templates = data.templates;
  }

  /**
   * Build indexes for fast retrieval
   */
  private buildIndexes(): void {
    this.templates.forEach(template => {
      // Category index
      if (!this.categoryIndex.has(template.category)) {
        this.categoryIndex.set(template.category, []);
      }
      this.categoryIndex.get(template.category)!.push(template);

      // Keyword index
      template.keywords.forEach(keyword => {
        const normalizedKeyword = keyword.toLowerCase();
        if (!this.keywordIndex.has(normalizedKeyword)) {
          this.keywordIndex.set(normalizedKeyword, []);
        }
        this.keywordIndex.get(normalizedKeyword)!.push(template);
      });
    });
  }

  /**
   * Find best matching templates for an email
   */
  findBestMatches(
    email: ProcessedEmail,
    category: string,
    limit: number = 3
  ): TemplateMatch[] {
    const candidates = this.getCandidates(category);
    const emailText = `${email.subject} ${email.text}`.toLowerCase();
    const emailWords = this.extractKeywords(emailText);

    // Score each candidate
    const matches: TemplateMatch[] = candidates.map(template => {
      const { score, matchedKeywords } = this.calculateScore(template, emailWords, emailText);
      return {
        template,
        score,
        matchedKeywords,
      };
    });

    // Sort by score and return top matches
    return matches
      .filter(m => m.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * Get candidate templates by category
   */
  private getCandidates(category: string): Template[] {
    // Try exact category match first
    const exactMatch = this.categoryIndex.get(category);
    if (exactMatch && exactMatch.length > 0) {
      return exactMatch;
    }

    // Fallback: search for similar categories
    const normalizedCategory = category.toLowerCase();
    for (const [key, templates] of this.categoryIndex.entries()) {
      if (key.toLowerCase().includes(normalizedCategory) ||
          normalizedCategory.includes(key.toLowerCase())) {
        return templates;
      }
    }

    // If no match, return all templates
    return this.templates;
  }

  /**
   * Calculate relevance score for a template
   */
  private calculateScore(
    template: Template,
    emailKeywords: string[],
    emailText: string
  ): { score: number; matchedKeywords: string[] } {
    let score = 0;
    const matchedKeywords: string[] = [];

    // Keyword matching
    template.keywords.forEach(keyword => {
      const normalizedKeyword = keyword.toLowerCase();

      // Check if keyword exists in email keywords
      if (emailKeywords.includes(normalizedKeyword)) {
        score += 2;
        matchedKeywords.push(keyword);
      }

      // Check if keyword exists in email text (partial match)
      if (emailText.includes(normalizedKeyword)) {
        score += 1;
        if (!matchedKeywords.includes(keyword)) {
          matchedKeywords.push(keyword);
        }
      }
    });

    // Scenario matching (check if scenario words appear in email)
    const scenarioWords = template.scenario.toLowerCase().split(/[\s,，、]+/);
    scenarioWords.forEach(word => {
      if (word.length > 2 && emailText.includes(word)) {
        score += 0.5;
      }
    });

    return { score, matchedKeywords };
  }

  /**
   * Extract keywords from text
   */
  private extractKeywords(text: string): string[] {
    // Remove special characters and split into words
    const words = text
      .toLowerCase()
      .replace(/[^\w\s\u4e00-\u9fa5]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2);

    // Remove duplicates
    return Array.from(new Set(words));
  }

  /**
   * Get template by ID
   */
  getTemplateById(id: string): Template | undefined {
    return this.templates.find(t => t.id === id);
  }

  /**
   * Get all templates for a category
   */
  getTemplatesByCategory(category: string): Template[] {
    return this.categoryIndex.get(category) || [];
  }

  /**
   * Get all available categories
   */
  getCategories(): string[] {
    return Array.from(this.categoryIndex.keys());
  }

  /**
   * Search templates by keyword
   */
  searchByKeyword(keyword: string): Template[] {
    const normalized = keyword.toLowerCase();
    return this.keywordIndex.get(normalized) || [];
  }

  /**
   * Get template content in specific language
   */
  getTemplateContent(template: Template, language: string = 'en'): string {
    return template.languages[language] || template.languages['en'] || '';
  }

  /**
   * Detect language from email content (simple heuristic)
   */
  detectLanguage(email: ProcessedEmail): string {
    const text = `${email.subject} ${email.text}`;

    // Simple language detection based on character patterns
    if (/[\u4e00-\u9fa5]/.test(text)) return 'zh';
    if (/[\u0600-\u06FF]/.test(text)) return 'ar';
    if (/[\u0E00-\u0E7F]/.test(text)) return 'th';
    if (/[\u3040-\u309F\u30A0-\u30FF]/.test(text)) return 'ja';
    if (/[\uAC00-\uD7AF]/.test(text)) return 'ko';

    // Detect European languages by common words
    const lowerText = text.toLowerCase();
    if (/\b(de|der|die|das|und|ist|nicht)\b/.test(lowerText)) return 'de';
    if (/\b(le|la|les|un|une|est|pas|de)\b/.test(lowerText)) return 'fr';
    if (/\b(el|la|los|las|un|una|es|no|de)\b/.test(lowerText)) return 'es';
    if (/\b(o|a|os|as|um|uma|não|de)\b/.test(lowerText)) return 'pt';
    if (/\b(il|lo|la|un|una|non|di)\b/.test(lowerText)) return 'it';
    if (/\b(de|het|een|is|niet|van)\b/.test(lowerText)) return 'nl';

    // Default to English
    return 'en';
  }
}
