/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { PresetTemplate, TemplateVariable } from './types.js';
import { TEMPLATE_CATEGORIES } from './BuiltinTemplates.js';

export interface SimpleTemplateOptions {
  readonly name: string;
  readonly description: string;
  readonly category?: string;
  readonly icon?: string;
  readonly template: string;
}

export interface ConversationTemplate {
  readonly userMessage: string;
  readonly context?: string;
}

/**
 * SimpleTemplateBuilder provides user-friendly ways to create templates
 * without requiring deep knowledge of the template system internals.
 */
export class SimpleTemplateBuilder {

  /**
   * Creates a template from a simple text with automatic variable detection.
   * Supports multiple variable syntaxes: [var], <var>, {var}, @var
   */
  static fromSimpleText(options: SimpleTemplateOptions): PresetTemplate {
    const variables = this.extractVariablesFromText(options.template);
    const standardizedTemplate = this.standardizeVariableSyntax(options.template);

    return {
      id: this.generateId(options.name),
      name: options.name,
      description: options.description,
      category: options.category || 'custom',
      icon: options.icon || '📝',
      template: standardizedTemplate,
      variables,
      tags: ['user-created'],
      author: 'User',
      version: '1.0.0',
      lastModified: new Date(),
      isBuiltin: false
    };
  }

  /**
   * Creates a template from a conversation example.
   * The user provides an example of what they would say, and the system
   * helps identify what should be variables.
   */
  static fromConversation(
    name: string,
    conversation: ConversationTemplate,
    description?: string
  ): PresetTemplate {
    const template = this.buildConversationTemplate(conversation);
    const variables = this.suggestVariablesFromConversation(conversation);

    return {
      id: this.generateId(name),
      name,
      description: description || `Template generated from conversation`,
      category: 'custom',
      icon: '💬',
      template,
      variables,
      tags: ['user-created', 'conversation'],
      author: 'User',
      version: '1.0.0',
      lastModified: new Date(),
      isBuiltin: false
    };
  }

  /**
   * Interactive template builder that guides users through creation.
   */
  static createInteractiveBuilder(): TemplateWizard {
    return new TemplateWizard();
  }

  /**
   * Extracts variables from text using multiple syntax patterns.
   */
  private static extractVariablesFromText(text: string): TemplateVariable[] {
    const variables = new Set<string>();

    // Pattern 1: [variable_name] or [variable_name:type]
    const bracketPattern = /\[([^:\]]+)(?::([^:\]]+))?\]/g;
    let match;
    while ((match = bracketPattern.exec(text)) !== null) {
      variables.add(match[1]);
    }

    // Pattern 2: <variable_name> or <variable_name:type>
    const anglePattern = /<([^:>]+)(?::([^:>]+))?>/g;
    while ((match = anglePattern.exec(text)) !== null) {
      variables.add(match[1]);
    }

    // Pattern 3: {variable_name} - but avoid existing {{}} syntax
    const bracePattern = /(?<!\{)\{([^{}:]+)(?::([^{}]+))?\}(?!\})/g;
    while ((match = bracePattern.exec(text)) !== null) {
      variables.add(match[1]);
    }

    // Pattern 4: @variable_name
    const atPattern = /@([a-zA-Z_][a-zA-Z0-9_]*)/g;
    while ((match = atPattern.exec(text)) !== null) {
      variables.add(match[1]);
    }

    return Array.from(variables).map(varName => this.createVariableDefinition(varName));
  }

  /**
   * Converts various variable syntaxes to standard {{variable}} format.
   */
  private static standardizeVariableSyntax(text: string): string {
    let result = text;

    // Convert [var] to {{var}}
    result = result.replace(/\[([^:\]]+)(?::([^:\]]+))?\]/g, '{{$1}}');
    
    // Convert <var> to {{var}}
    result = result.replace(/<([^:>]+)(?::([^:>]+))?>/g, '{{$1}}');
    
    // Convert {var} to {{var}} (avoid existing {{}} syntax)
    result = result.replace(/(?<!\{)\{([^{}:]+)(?::([^{}]+))?\}(?!\})/g, '{{$1}}');
    
    // Convert @var to {{var}}
    result = result.replace(/@([a-zA-Z_][a-zA-Z0-9_]*)/g, '{{$1}}');

    return result;
  }

  /**
   * Creates a variable definition with smart type inference.
   */
  private static createVariableDefinition(varName: string): TemplateVariable {
    // Smart type inference based on variable name
    const name = varName.toLowerCase();
    
    let type: TemplateVariable['type'] = 'text';
    let description = `Value for ${varName}`;
    let placeholder = `Enter ${varName}`;

    if (name.includes('path') || name.includes('file')) {
      type = name.includes('dir') ? 'directory_path' : 'file_path';
      placeholder = `Path to ${varName}`;
    } else if (name.includes('count') || name.includes('number') || name.includes('size')) {
      type = 'number';
      placeholder = `Number for ${varName}`;
    } else if (name.includes('enable') || name.includes('disable') || name.includes('is_')) {
      type = 'boolean';
      placeholder = `true/false for ${varName}`;
    }

    return {
      name: varName,
      type,
      description,
      required: true,
      placeholder
    };
  }

  private static buildConversationTemplate(conversation: ConversationTemplate): string {
    let template = conversation.userMessage;

    if (conversation.context) {
      template = `Context: ${conversation.context}\n\n${template}`;
    }

    return template;
  }

  private static suggestVariablesFromConversation(conversation: ConversationTemplate): TemplateVariable[] {
    // Identify potential variables from common patterns in user messages
    const variables: TemplateVariable[] = [];
    const text = conversation.userMessage;

    // Look for quoted strings that might be variables
    const quotedPattern = /["']([^"']+)["']/g;
    let match;
    let varIndex = 1;

    while ((match = quotedPattern.exec(text)) !== null) {
      const content = match[1];
      // Skip very short or very long strings
      if (content.length > 3 && content.length < 100) {
        variables.push({
          name: `value_${varIndex}`,
          type: 'text',
          description: `Replace "${content}" with custom value`,
          required: true,
          placeholder: content,
          defaultValue: content
        });
        varIndex++;
      }
    }

    // Look for file/path patterns
    const pathPattern = /[\w.-]+\/[\w.-\/]+/g;
    while ((match = pathPattern.exec(text)) !== null) {
      variables.push({
        name: `file_path_${varIndex}`,
        type: 'file_path',
        description: `Replace "${match[0]}" with custom path`,
        required: true,
        placeholder: match[0],
        defaultValue: match[0]
      });
      varIndex++;
    }

    return variables;
  }

  private static generateId(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      + '_' + Date.now().toString(36);
  }
}

/**
 * Interactive wizard for creating templates step by step.
 */
export class TemplateWizard {
  private templateData: {
    id?: string;
    name?: string;
    description?: string;
    category?: string;
    icon?: string;
    template?: string;
    variables?: TemplateVariable[];
    tags?: string[];
    author: string;
    version: string;
    lastModified?: Date;
    isBuiltin: boolean;
  } = {
    variables: [],
    tags: ['user-created'],
    author: 'User',
    version: '1.0.0',
    isBuiltin: false
  };

  setBasicInfo(name: string, description: string): this {
    this.templateData.name = name;
    this.templateData.description = description;
    this.templateData.id = this.generateId(name);
    this.templateData.lastModified = new Date();
    return this;
  }

  setCategory(categoryId: string): this {
    const category = TEMPLATE_CATEGORIES[categoryId];
    if (category) {
      this.templateData.category = categoryId;
      this.templateData.icon = category.icon;
    } else {
      this.templateData.category = 'custom';
      this.templateData.icon = '📝';
    }
    return this;
  }

  setTemplate(templateText: string): this {
    this.templateData.template = templateText;
    // Auto-extract variables
    this.templateData.variables = SimpleTemplateBuilder['extractVariablesFromText'](templateText);
    return this;
  }

  addVariable(variable: TemplateVariable): this {
    if (!this.templateData.variables) {
      this.templateData.variables = [];
    }
    this.templateData.variables = [...this.templateData.variables, variable];
    return this;
  }

  addTags(tags: string[]): this {
    this.templateData.tags = [...(this.templateData.tags || []), ...tags];
    return this;
  }

  build(): PresetTemplate {
    // Validate required fields
    if (!this.templateData.name || !this.templateData.description || !this.templateData.template) {
      throw new Error('Missing required fields: name, description, and template are required');
    }

    return this.templateData as PresetTemplate;
  }

  private generateId(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      + '_' + Date.now().toString(36);
  }
}