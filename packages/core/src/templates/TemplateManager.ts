/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  PresetTemplate,
  TemplateCategory,
  TemplateRenderOptions,
  TemplateRenderResult,
  TemplateSearchOptions,
  TemplateUsageStats
} from './types.js';
import { BUILTIN_TEMPLATES, TEMPLATE_CATEGORIES } from './BuiltinTemplates.js';
import { TemplateRenderer } from './TemplateRenderer.js';
import { SimpleTemplateBuilder, type SimpleTemplateOptions } from './SimpleTemplateBuilder.js';
import { ConversationTemplateGenerator, type TemplateGenerationOptions, type ConversationMessage } from './ConversationTemplateGenerator.js';
import type { Config } from '../config/config.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

export class TemplateManager {
  private templates = new Map<string, PresetTemplate>();
  private customTemplatesPath: string;
  private usageStats = new Map<string, TemplateUsageStats>();

  constructor(config: Config) {
    this.customTemplatesPath = path.join(
      config.getProjectRoot(),
      '.gemini',
      'templates'
    );
    
    // Load builtin templates
    for (const template of Object.values(BUILTIN_TEMPLATES)) {
      this.templates.set(template.id, template);
    }

    this.loadCustomTemplates();
    this.loadUsageStats();
  }

  getAllTemplates(): PresetTemplate[] {
    return Array.from(this.templates.values());
  }

  getTemplate(id: string): PresetTemplate | undefined {
    return this.templates.get(id);
  }

  getTemplatesByCategory(category: string): PresetTemplate[] {
    return Array.from(this.templates.values())
      .filter(template => template.category === category);
  }

  searchTemplates(options: TemplateSearchOptions): PresetTemplate[] {
    let results = Array.from(this.templates.values());

    if (options.query) {
      const query = options.query.toLowerCase();
      results = results.filter(template =>
        template.name.toLowerCase().includes(query) ||
        template.description.toLowerCase().includes(query) ||
        template.tags.some(tag => tag.toLowerCase().includes(query))
      );
    }

    if (options.category) {
      results = results.filter(template => template.category === options.category);
    }

    if (options.tags && options.tags.length > 0) {
      results = results.filter(template =>
        options.tags!.some(tag => template.tags.includes(tag))
      );
    }

    if (options.author) {
      results = results.filter(template => template.author === options.author);
    }

    if (options.builtinOnly) {
      results = results.filter(template => template.isBuiltin);
    }

    if (options.customOnly) {
      results = results.filter(template => !template.isBuiltin);
    }

    return results;
  }

  getAllCategories(): TemplateCategory[] {
    return Object.values(TEMPLATE_CATEGORIES);
  }

  getCategory(id: string): TemplateCategory | undefined {
    return TEMPLATE_CATEGORIES[id];
  }

  renderTemplate(
    templateId: string,
    variables: Record<string, string | number | boolean>,
    options: Partial<TemplateRenderOptions> = {}
  ): TemplateRenderResult {
    const template = this.templates.get(templateId);
    if (!template) {
      return {
        renderedText: '',
        usedVariables: [],
        missingVariables: [],
        errors: [`Template '${templateId}' not found`]
      };
    }

    const renderOptions: TemplateRenderOptions = {
      variables,
      preserveWhitespace: options.preserveWhitespace ?? false,
      escapeHtml: options.escapeHtml ?? false
    };

    const result = TemplateRenderer.render(
      template.template,
      template.variables,
      renderOptions
    );

    // Update usage stats
    this.updateUsageStats(templateId);

    return result;
  }

  addCustomTemplate(template: Omit<PresetTemplate, 'isBuiltin'>): void {
    const customTemplate: PresetTemplate = {
      ...template,
      isBuiltin: false,
      lastModified: new Date()
    };

    // Validate template syntax
    const templateErrors = TemplateRenderer.validateTemplate(template.template);
    if (templateErrors.length > 0) {
      throw new Error(`Invalid template syntax: ${templateErrors.join(', ')}`);
    }

    this.templates.set(template.id, customTemplate);
    this.saveCustomTemplate(customTemplate);
  }

  updateCustomTemplate(
    id: string,
    updates: Partial<Omit<PresetTemplate, 'id' | 'isBuiltin'>>
  ): void {
    const existing = this.templates.get(id);
    if (!existing) {
      throw new Error(`Template '${id}' not found`);
    }

    if (existing.isBuiltin) {
      throw new Error(`Cannot modify builtin template '${id}'`);
    }

    const updated: PresetTemplate = {
      ...existing,
      ...updates,
      id,
      isBuiltin: false,
      lastModified: new Date()
    };

    // Validate template syntax if template content changed
    if (updates.template) {
      const templateErrors = TemplateRenderer.validateTemplate(updates.template);
      if (templateErrors.length > 0) {
        throw new Error(`Invalid template syntax: ${templateErrors.join(', ')}`);
      }
    }

    this.templates.set(id, updated);
    this.saveCustomTemplate(updated);
  }

  deleteCustomTemplate(id: string): void {
    const template = this.templates.get(id);
    if (!template) {
      throw new Error(`Template '${id}' not found`);
    }

    if (template.isBuiltin) {
      throw new Error(`Cannot delete builtin template '${id}'`);
    }

    this.templates.delete(id);
    this.deleteCustomTemplateFile(id);
    this.usageStats.delete(id);
    this.saveUsageStats();
  }

  getUsageStats(templateId: string): TemplateUsageStats | undefined {
    return this.usageStats.get(templateId);
  }

  getAllUsageStats(): TemplateUsageStats[] {
    return Array.from(this.usageStats.values());
  }

  exportTemplate(templateId: string): string {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Template '${templateId}' not found`);
    }

    return JSON.stringify(template, null, 2);
  }

  importTemplate(templateJson: string): void {
    let template: PresetTemplate;
    
    try {
      template = JSON.parse(templateJson);
    } catch (error) {
      throw new Error(`Invalid JSON: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Validate required fields
    const requiredFields = ['id', 'name', 'description', 'category', 'template', 'variables'];
    for (const field of requiredFields) {
      if (!(field in template)) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    this.addCustomTemplate({
      ...template,
      lastModified: new Date(),
      version: template.version || '1.0.0',
      tags: template.tags || [],
      variables: template.variables || []
    });
  }

  // Simplified template creation methods

  /**
   * Creates a template from simple text with automatic variable detection.
   * Supports multiple variable syntaxes: [var], <var>, {var}, @var
   */
  createSimpleTemplate(options: SimpleTemplateOptions): void {
    const template = SimpleTemplateBuilder.fromSimpleText(options);
    this.templates.set(template.id, template);
    this.saveCustomTemplate(template);
  }

  /**
   * Creates a template from a conversation message.
   */
  createTemplateFromConversation(
    message: ConversationMessage,
    name: string,
    options: TemplateGenerationOptions = {}
  ): void {
    const template = ConversationTemplateGenerator.fromConversationMessage(message, {
      ...options,
      customName: name
    });
    this.templates.set(template.id, template);
    this.saveCustomTemplate(template);
  }

  /**
   * Creates a template from multiple conversation examples.
   */
  createTemplateFromExamples(
    examples: ConversationMessage[],
    name: string,
    options: TemplateGenerationOptions = {}
  ): void {
    const template = ConversationTemplateGenerator.fromMultipleExamples(examples, name, options);
    this.templates.set(template.id, template);
    this.saveCustomTemplate(template);
  }

  /**
   * Suggests templates that could be created from conversation history.
   */
  suggestTemplatesFromConversations(
    conversations: readonly ConversationMessage[],
    minLength: number = 50
  ): Array<{
    message: ConversationMessage;
    score: number;
    reason: string;
    suggestedName: string;
  }> {
    return ConversationTemplateGenerator.suggestTemplatesFromHistory(conversations, minLength);
  }

  /**
   * Creates an interactive template builder.
   */
  createInteractiveBuilder() {
    return SimpleTemplateBuilder.createInteractiveBuilder();
  }

  private loadCustomTemplates(): void {
    if (!fs.existsSync(this.customTemplatesPath)) {
      return;
    }

    try {
      const files = fs.readdirSync(this.customTemplatesPath);
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const filePath = path.join(this.customTemplatesPath, file);
            const content = fs.readFileSync(filePath, 'utf-8');
            const template: PresetTemplate = JSON.parse(content);
            
            this.templates.set(template.id, {
              ...template,
              isBuiltin: false
            });
          } catch (error) {
            console.warn(`Failed to load custom template ${file}:`, error);
          }
        }
      }
    } catch (error) {
      console.warn('Failed to load custom templates:', error);
    }
  }

  private saveCustomTemplate(template: PresetTemplate): void {
    if (!fs.existsSync(this.customTemplatesPath)) {
      fs.mkdirSync(this.customTemplatesPath, { recursive: true });
    }

    const filePath = path.join(this.customTemplatesPath, `${template.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(template, null, 2));
  }

  private deleteCustomTemplateFile(templateId: string): void {
    const filePath = path.join(this.customTemplatesPath, `${templateId}.json`);
    
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  private loadUsageStats(): void {
    const statsPath = path.join(this.customTemplatesPath, 'usage-stats.json');
    
    if (fs.existsSync(statsPath)) {
      try {
        const content = fs.readFileSync(statsPath, 'utf-8');
        const stats: TemplateUsageStats[] = JSON.parse(content);
        
        for (const stat of stats) {
          this.usageStats.set(stat.templateId, {
            ...stat,
            lastUsed: new Date(stat.lastUsed)
          });
        }
      } catch (error) {
        console.warn('Failed to load template usage stats:', error);
      }
    }
  }

  private updateUsageStats(templateId: string): void {
    const existing = this.usageStats.get(templateId);
    
    this.usageStats.set(templateId, {
      templateId,
      usageCount: (existing?.usageCount || 0) + 1,
      lastUsed: new Date(),
      averageRating: existing?.averageRating
    });

    this.saveUsageStats();
  }

  private saveUsageStats(): void {
    if (!fs.existsSync(this.customTemplatesPath)) {
      fs.mkdirSync(this.customTemplatesPath, { recursive: true });
    }

    const statsPath = path.join(this.customTemplatesPath, 'usage-stats.json');
    const stats = Array.from(this.usageStats.values());
    
    fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2));
  }
}