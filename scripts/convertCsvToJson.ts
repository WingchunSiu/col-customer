import { readFileSync, writeFileSync } from 'fs';
import { parse } from 'csv-parse/sync';

interface TemplateRow {
  category: string;
  scenario: string;
  languages: {
    [key: string]: string;
  };
}

interface Template {
  id: string;
  category: string;
  scenario: string;
  keywords: string[];
  languages: {
    zh?: string;
    en?: string;
    pt?: string;
    es?: string;
    fr?: string;
    id?: string;
    th?: string;
    ko?: string;
    ja?: string;
    it?: string;
    de?: string;
    ms?: string;
    sw?: string;
    nl?: string;
    ar?: string;
    da?: string;
  };
}

// Language code mapping from column headers
const languageMap: { [key: string]: string } = {
  '场景 (中文)': 'scenario',
  '英语 (English)': 'en',
  '葡萄牙语 (Português)': 'pt',
  '西班牙语 (Español)': 'es',
  '法语 (Français)': 'fr',
  '印度尼西亚语 (Bahasa Indonesia)': 'id',
  '泰语 (ไทย)': 'th',
  '韩语 (한국어)': 'ko',
  '日语 (日本語)': 'ja',
  '意大利语 (Italiano)': 'it',
  '德语 (Deutsch)': 'de',
  '马来语 (Bahasa Melayu)': 'ms',
  '斯瓦希里语 (Kiswahili)': 'sw',
  '荷兰语 (Nederlands)': 'nl',
  '阿拉伯语 (العربية)': 'ar',
  '丹麦语 (Dansk)': 'da',
};

function extractKeywords(category: string, scenario: string, content: string): string[] {
  const keywords = new Set<string>();

  // Add category and scenario
  if (category) keywords.add(category.toLowerCase());
  if (scenario) keywords.add(scenario.toLowerCase());

  // Extract common support keywords from English content
  const commonKeywords = [
    'subscription', 'purchase', 'payment', 'restore', 'refund',
    'video', 'playback', 'streaming', 'buffer', 'loading',
    'account', 'login', 'password', 'profile', 'settings',
    'bug', 'error', 'crash', 'issue', 'problem',
    'feature', 'request', 'feedback', 'suggestion',
    'cancel', 'delete', 'remove', 'update', 'upgrade',
  ];

  const lowerContent = content.toLowerCase();
  commonKeywords.forEach(keyword => {
    if (lowerContent.includes(keyword)) {
      keywords.add(keyword);
    }
  });

  return Array.from(keywords);
}

function generateId(category: string, scenario: string, index: number): string {
  const categorySlug = category
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '_')
    .substring(0, 20);
  return `${categorySlug}_${String(index).padStart(3, '0')}`;
}

async function convertCsvToJson(inputPath: string, outputPath: string) {
  console.log('📖 Reading CSV file...');

  // Read CSV file with BOM handling
  const csvContent = readFileSync(inputPath, 'utf-8').replace(/^\uFEFF/, '');

  console.log('🔄 Parsing CSV...');

  // Parse CSV
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
  });

  console.log(`📊 Found ${records.length} rows`);

  const templates: Template[] = [];
  let currentCategory = '';

  records.forEach((row: any, index: number) => {
    // Update current category if present
    if (row['分类']) {
      currentCategory = row['分类'].trim();
    }

    const scenario = row['场景 (中文)']?.trim();
    const englishContent = row['英语 (English)']?.trim();

    // Skip if no scenario or English content
    if (!scenario || !englishContent) {
      return;
    }

    const template: Template = {
      id: generateId(currentCategory, scenario, templates.length + 1),
      category: currentCategory,
      scenario: scenario,
      keywords: extractKeywords(currentCategory, scenario, englishContent),
      languages: {},
    };

    // Map all language columns
    Object.keys(row).forEach(header => {
      const langCode = languageMap[header];
      if (langCode && langCode !== 'scenario' && row[header]?.trim()) {
        if (langCode === 'scenario') {
          // Already handled
        } else {
          (template.languages as any)[langCode] = row[header].trim();
        }
      }
    });

    templates.push(template);
  });

  console.log(`✅ Converted ${templates.length} templates`);

  // Write JSON
  const output = {
    version: '1.0',
    generatedAt: new Date().toISOString(),
    totalTemplates: templates.length,
    templates: templates,
  };

  writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf-8');

  console.log(`💾 Saved to ${outputPath}`);

  // Print statistics
  const categories = new Set(templates.map(t => t.category));
  console.log(`\n📈 Statistics:`);
  console.log(`   Categories: ${categories.size}`);
  console.log(`   Templates: ${templates.length}`);
  console.log(`\n📑 Categories:`);
  categories.forEach(cat => {
    const count = templates.filter(t => t.category === cat).length;
    console.log(`   - ${cat}: ${count} templates`);
  });
}

// Run conversion
const inputPath = process.argv[2] || './用户反馈模板（AI使用版） - Sheet1.csv';
const outputPath = process.argv[3] || './templates.json';

convertCsvToJson(inputPath, outputPath).catch(console.error);
