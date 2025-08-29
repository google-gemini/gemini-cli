/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { PresetTemplate, TemplateVariable } from './types.js';

export interface ConversationMessage {
  readonly type: string;
  readonly text?: string;
  readonly content?: string;
  readonly timestamp?: Date;
}

export interface TemplateGenerationOptions {
  readonly includeContext?: boolean;
  readonly autoDetectVariables?: boolean;
  readonly suggestedCategory?: string;
  readonly customName?: string;
  readonly customDescription?: string;
}

export interface VariableSuggestion {
  readonly name: string;
  readonly originalValue: string;
  readonly suggestedType: TemplateVariable['type'];
  readonly confidence: number;
  readonly examples?: readonly string[];
}

/**
 * ConversationTemplateGenerator analyzes user's conversation history
 * to automatically generate reusable templates from successful prompts.
 */
export class ConversationTemplateGenerator {
  
  /**
   * Generates a template from a user's message in conversation history.
   */
  static fromConversationMessage(
    message: ConversationMessage,
    options: TemplateGenerationOptions = {}
  ): PresetTemplate {
    const userMessage = this.extractUserMessage(message);
    if (!userMessage) {
      throw new Error('No user message found in conversation message');
    }

    const suggestions = options.autoDetectVariables ? 
      this.analyzeForVariables(userMessage) : [];

    const template = this.buildTemplateFromMessage(userMessage, suggestions);
    
    return {
      id: this.generateTemplateId(userMessage),
      name: options.customName || this.generateTemplateName(userMessage),
      description: options.customDescription || this.generateDescription(userMessage),
      category: options.suggestedCategory || this.inferCategory(userMessage),
      icon: this.inferIcon(userMessage),
      template,
      variables: this.createVariableDefinitions(suggestions),
      tags: ['from-conversation', 'auto-generated'],
      author: 'User',
      version: '1.0.0',
      lastModified: new Date(),
      isBuiltin: false
    };
  }

  /**
   * Analyzes multiple conversation examples to create a more robust template.
   */
  static fromMultipleExamples(
    examples: ConversationMessage[],
    templateName: string,
    options: TemplateGenerationOptions = {}
  ): PresetTemplate {
    const messages = examples.map(item => this.extractUserMessage(item)).filter(Boolean) as string[];
    
    if (messages.length === 0) {
      throw new Error('No valid messages found in examples');
    }

    const commonPattern = this.findCommonPattern(messages);
    const variableSuggestions = this.findVariablePatterns(messages);

    return {
      id: this.generateTemplateId(templateName),
      name: templateName,
      description: options.customDescription || `Template created from ${messages.length} conversation examples`,
      category: options.suggestedCategory || 'custom',
      icon: '🔄',
      template: commonPattern,
      variables: this.createVariableDefinitions(variableSuggestions),
      tags: ['from-examples', 'multi-source'],
      author: 'User',
      version: '1.0.0',
      lastModified: new Date(),
      isBuiltin: false
    };
  }

  /**
   * Suggests which conversations might make good templates.
   */
  static suggestTemplatesFromHistory(
    history: readonly ConversationMessage[],
    minLength: number = 50
  ): Array<{
    message: ConversationMessage;
    score: number;
    reason: string;
    suggestedName: string;
  }> {
    const suggestions: Array<{
      message: ConversationMessage;
      score: number;
      reason: string;
      suggestedName: string;
    }> = [];

    for (const item of history) {
      const userMessage = this.extractUserMessage(item);
      if (!userMessage || userMessage.length < minLength) {
        continue;
      }

      const score = this.calculateTemplateWorthiness(userMessage);
      if (score > 0.5) {
        suggestions.push({
          message: item,
          score,
          reason: this.explainScore(userMessage, score),
          suggestedName: this.generateTemplateName(userMessage)
        });
      }
    }

    return suggestions.sort((a, b) => b.score - a.score);
  }

  private static extractUserMessage(message: ConversationMessage): string | null {
    // Extract the actual user message from the conversation message
    if (message.text && typeof message.text === 'string') {
      return message.text;
    }
    if (message.content && typeof message.content === 'string') {
      return message.content;
    }
    return null;
  }

  private static analyzeForVariables(message: string): VariableSuggestion[] {
    const suggestions: VariableSuggestion[] = [];

    // 1. File paths
    const pathMatches = message.match(/[\w.-]+\/[\w.-\/]+/g) || [];
    pathMatches.forEach((path, index) => {
      suggestions.push({
        name: `file_path_${index + 1}`,
        originalValue: path,
        suggestedType: path.includes('.') ? 'file_path' : 'directory_path',
        confidence: 0.8,
        examples: [path]
      });
    });

    // 2. Quoted strings (likely to be variable content)
    const quotedMatches = message.match(/["']([^"']{4,50})["']/g) || [];
    quotedMatches.forEach((quoted, index) => {
      const content = quoted.slice(1, -1); // Remove quotes
      suggestions.push({
        name: `content_${index + 1}`,
        originalValue: content,
        suggestedType: 'text',
        confidence: 0.7,
        examples: [content]
      });
    });

    // 3. Numbers
    const numberMatches = message.match(/\b\d+(?:\.\d+)?\b/g) || [];
    numberMatches.forEach((num, index) => {
      if (parseFloat(num) > 1) { // Skip small numbers that might not be variables
        suggestions.push({
          name: `number_${index + 1}`,
          originalValue: num,
          suggestedType: 'number',
          confidence: 0.6,
          examples: [num]
        });
      }
    });

    // 4. Common variable patterns
    const patterns = [
      { regex: /\b[A-Z][a-zA-Z]+\.tsx?\b/g, name: 'component_name', type: 'file_path' as const },
      { regex: /\b[a-z]+_[a-z]+\b/g, name: 'snake_case_var', type: 'text' as const },
      { regex: /\b[A-Z][a-zA-Z]*[A-Z][a-zA-Z]*\b/g, name: 'camel_case_var', type: 'text' as const },
    ];

    patterns.forEach((pattern, patternIndex) => {
      const matches = message.match(pattern.regex) || [];
      matches.forEach((match, index) => {
        suggestions.push({
          name: `${pattern.name}_${index + 1}`,
          originalValue: match,
          suggestedType: pattern.type,
          confidence: 0.5,
          examples: [match]
        });
      });
    });

    return suggestions;
  }

  private static buildTemplateFromMessage(
    message: string,
    suggestions: VariableSuggestion[]
  ): string {
    let template = message;

    // Replace identified variables with template placeholders
    suggestions.forEach(suggestion => {
      const regex = new RegExp(this.escapeRegExp(suggestion.originalValue), 'g');
      template = template.replace(regex, `{{${suggestion.name}}}`);
    });

    return template;
  }

  private static findCommonPattern(messages: string[]): string {
    // Find the longest common subsequence pattern among messages
    if (messages.length === 1) {
      return messages[0];
    }

    // Simple approach: find common words and structure
    let pattern = messages[0];

    for (let i = 1; i < messages.length; i++) {
      pattern = this.findCommonSubsequence(pattern, messages[i]);
    }

    return pattern || messages[0];
  }

  private static findVariablePatterns(messages: string[]): VariableSuggestion[] {
    const suggestions: VariableSuggestion[] = [];
    
    // Find positions where messages differ - these are likely variables
    const minLength = Math.min(...messages.map(m => m.length));
    let varIndex = 1;

    for (let i = 0; i < minLength; i++) {
      const chars = messages.map(m => m[i]);
      const uniqueChars = new Set(chars);
      
      if (uniqueChars.size > 1) {
        // Found a difference - this might be start of a variable
        const variableValues = this.extractVariableValues(messages, i);
        if (variableValues.length > 0) {
          suggestions.push({
            name: `variable_${varIndex++}`,
            originalValue: variableValues[0],
            suggestedType: 'text',
            confidence: 0.6,
            examples: variableValues
          });
        }
      }
    }

    return suggestions;
  }

  private static extractVariableValues(messages: string[], startPos: number): string[] {
    // Extract the different values at this position across messages
    // This is a simplified implementation
    return messages.map(m => m.slice(startPos, startPos + 20).split(/\s+/)[0]).filter(Boolean);
  }

  private static findCommonSubsequence(str1: string, str2: string): string {
    // Simple LCS implementation for finding common patterns
    const words1 = str1.split(/\s+/);
    const words2 = str2.split(/\s+/);
    
    const common: string[] = [];
    let i = 0, j = 0;
    
    while (i < words1.length && j < words2.length) {
      if (words1[i] === words2[j]) {
        common.push(words1[i]);
        i++;
        j++;
      } else {
        common.push(`{{variable_${common.length + 1}}}`);
        i++;
        j++;
      }
    }
    
    return common.join(' ');
  }

  private static createVariableDefinitions(suggestions: VariableSuggestion[]): TemplateVariable[] {
    return suggestions.map(suggestion => ({
      name: suggestion.name,
      type: suggestion.suggestedType,
      description: `Replace with custom ${suggestion.suggestedType}`,
      required: true,
      placeholder: suggestion.originalValue,
      defaultValue: suggestion.suggestedType === 'boolean' ? undefined : suggestion.originalValue
    }));
  }

  private static calculateTemplateWorthiness(message: string): number {
    let score = 0;

    // Longer messages are more likely to be good templates
    if (message.length > 100) score += 0.2;
    if (message.length > 300) score += 0.2;

    // Messages with structure indicators
    if (message.includes('\n')) score += 0.1;
    if (message.match(/\d+\./g)) score += 0.1; // Numbered lists
    if (message.match(/[-*]/g)) score += 0.1; // Bullet points

    // Messages with potential variables
    if (message.match(/["'][^"']+["']/g)) score += 0.2; // Quoted content
    if (message.match(/[\w.-]+\/[\w.-\/]+/g)) score += 0.2; // Paths
    if (message.match(/\b\d+\b/g)) score += 0.1; // Numbers

    // Task-oriented language
    const taskWords = ['please', 'analyze', 'review', 'create', 'generate', 'help me', 'can you'];
    const taskCount = taskWords.filter(word => message.toLowerCase().includes(word)).length;
    score += Math.min(taskCount * 0.1, 0.3);

    return Math.min(score, 1.0);
  }

  private static explainScore(message: string, score: number): string {
    const reasons: string[] = [];

    if (message.length > 300) reasons.push('detailed content');
    if (message.match(/["'][^"']+["']/g)) reasons.push('quoted content (likely variables)');
    if (message.match(/[\w.-]+\/[\w.-\/]+/g)) reasons.push('file paths');
    if (message.includes('\n')) reasons.push('structured format');

    return reasons.length > 0 ? `Good template candidate: ${reasons.join(', ')}` : 'Complex prompt structure';
  }

  private static generateTemplateName(message: string): string {
    // Extract key words to create a meaningful name
    const words = message
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3)
      .slice(0, 3);

    return words.join(' ') || 'Custom Template';
  }

  private static generateDescription(message: string): string {
    const preview = message.length > 100 ? message.slice(0, 100) + '...' : message;
    return `Template created from: "${preview}"`;
  }

  private static inferCategory(message: string): string {
    const lowerMessage = message.toLowerCase();

    if (lowerMessage.includes('review') || lowerMessage.includes('analyze')) return 'code_analysis';
    if (lowerMessage.includes('file') || lowerMessage.includes('batch')) return 'file_processing';
    if (lowerMessage.includes('document') || lowerMessage.includes('readme')) return 'documentation';
    if (lowerMessage.includes('test') || lowerMessage.includes('testing')) return 'testing';
    if (lowerMessage.includes('translate') || lowerMessage.includes('language')) return 'translation';
    if (lowerMessage.includes('data') || lowerMessage.includes('analyze')) return 'data_analysis';

    return 'custom';
  }

  private static inferIcon(message: string): string {
    const category = this.inferCategory(message);
    const categoryIcons = {
      'code_analysis': '🔍',
      'file_processing': '📁',
      'documentation': '📝',
      'testing': '🧪',
      'translation': '🌐',
      'data_analysis': '📊',
      'custom': '✨'
    };

    return categoryIcons[category as keyof typeof categoryIcons] || '✨';
  }

  private static generateTemplateId(input: string): string {
    return input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .slice(0, 30)
      .replace(/^_+|_+$/g, '')
      + '_' + Date.now().toString(36);
  }

  private static escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}