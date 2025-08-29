/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TemplateRenderOptions, TemplateRenderResult, TemplateVariable } from './types.js';

export class TemplateRenderer {
  private static readonly VARIABLE_PATTERN = /\{\{([^}]+)\}\}/g;
  private static readonly CONDITIONAL_PATTERN = /\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g;

  static render(
    template: string,
    variables: readonly TemplateVariable[],
    options: TemplateRenderOptions
  ): TemplateRenderResult {
    const errors: string[] = [];
    const usedVariables: string[] = [];
    const missingVariables: string[] = [];

    // Validate required variables
    for (const variable of variables) {
      if (variable.required && !(variable.name in options.variables)) {
        missingVariables.push(variable.name);
        errors.push(`Required variable '${variable.name}' is missing`);
      }
    }

    // Validate variable values
    for (const [varName, value] of Object.entries(options.variables)) {
      const variable = variables.find(v => v.name === varName);
      if (!variable) {
        continue; // Allow extra variables
      }

      const validationError = this.validateVariable(variable, value);
      if (validationError) {
        errors.push(`Variable '${varName}': ${validationError}`);
      }
    }

    if (errors.length > 0) {
      return {
        renderedText: template,
        usedVariables: [],
        missingVariables,
        errors
      };
    }

    let renderedText = template;

    // Process conditional blocks first
    renderedText = this.processConditionals(renderedText, options.variables, usedVariables);

    // Process variable substitutions
    renderedText = this.processVariables(renderedText, options.variables, usedVariables);

    // Handle whitespace preservation
    if (!options.preserveWhitespace) {
      renderedText = this.normalizeWhitespace(renderedText);
    }

    return {
      renderedText,
      usedVariables: Array.from(new Set(usedVariables)),
      missingVariables,
      errors
    };
  }

  private static processConditionals(
    template: string,
    variables: Record<string, string | number | boolean>,
    usedVariables: string[]
  ): string {
    return template.replace(this.CONDITIONAL_PATTERN, (match, varName, content) => {
      usedVariables.push(varName);
      const value = variables[varName];
      
      // Consider truthy values (non-empty strings, non-zero numbers, true boolean)
      const shouldInclude = Boolean(value) && value !== '';
      
      return shouldInclude ? content : '';
    });
  }

  private static processVariables(
    template: string,
    variables: Record<string, string | number | boolean>,
    usedVariables: string[]
  ): string {
    return template.replace(this.VARIABLE_PATTERN, (match, varName) => {
      const trimmedVarName = varName.trim();
      usedVariables.push(trimmedVarName);
      
      const value = variables[trimmedVarName];
      if (value === undefined || value === null) {
        return match; // Keep the placeholder if no value provided
      }
      
      return String(value);
    });
  }

  private static validateVariable(
    variable: TemplateVariable,
    value: string | number | boolean
  ): string | null {
    const { type, validation } = variable;

    // Type validation
    switch (type) {
      case 'number':
        if (typeof value !== 'number') {
          return `Expected number, got ${typeof value}`;
        }
        if (validation?.min !== undefined && value < validation.min) {
          return `Value ${value} is below minimum ${validation.min}`;
        }
        if (validation?.max !== undefined && value > validation.max) {
          return `Value ${value} is above maximum ${validation.max}`;
        }
        break;

      case 'boolean':
        if (typeof value !== 'boolean') {
          return `Expected boolean, got ${typeof value}`;
        }
        break;

      case 'text':
      case 'file_path':
      case 'directory_path':
        if (typeof value !== 'string') {
          return `Expected string, got ${typeof value}`;
        }
        
        if (validation?.minLength !== undefined && value.length < validation.minLength) {
          return `Text too short (minimum ${validation.minLength} characters)`;
        }
        if (validation?.maxLength !== undefined && value.length > validation.maxLength) {
          return `Text too long (maximum ${validation.maxLength} characters)`;
        }
        if (validation?.pattern) {
          const regex = new RegExp(validation.pattern);
          if (!regex.test(value)) {
            return `Value does not match required pattern`;
          }
        }
        break;
    }

    return null;
  }

  private static normalizeWhitespace(text: string): string {
    return text
      .split('\n')
      .map(line => line.trim())
      .filter((line, index, lines) => {
        // Remove empty lines but keep single empty lines between content blocks
        if (line === '') {
          const prevLine = lines[index - 1];
          const nextLine = lines[index + 1];
          return prevLine !== '' && nextLine !== '';
        }
        return true;
      })
      .join('\n')
      .replace(/\n{3,}/g, '\n\n') // Replace multiple newlines with double newlines
      .trim();
  }

  static extractVariables(template: string): string[] {
    const variables = new Set<string>();

    // Extract conditional variables
    const conditionals = template.matchAll(this.CONDITIONAL_PATTERN);
    for (const match of conditionals) {
      variables.add(match[1]);
    }

    // Extract regular variables
    const regularVars = template.matchAll(this.VARIABLE_PATTERN);
    for (const match of regularVars) {
      variables.add(match[1].trim());
    }

    return Array.from(variables);
  }

  static validateTemplate(template: string): string[] {
    const errors: string[] = [];

    // Check for unclosed conditionals
    const openIfs = (template.match(/\{\{#if\s+\w+\}\}/g) || []).length;
    const closeIfs = (template.match(/\{\{\/if\}\}/g) || []).length;
    if (openIfs !== closeIfs) {
      errors.push('Mismatched {{#if}} and {{/if}} blocks');
    }

    // Check for invalid variable syntax
    const invalidVars = template.match(/\{\{[^}]*\{\{|\}\}[^}]*\}\}/g);
    if (invalidVars) {
      errors.push(`Invalid variable syntax found: ${invalidVars.join(', ')}`);
    }

    return errors;
  }
}