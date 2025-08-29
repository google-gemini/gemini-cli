/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export interface TemplateVariable {
  readonly name: string;
  readonly type: 'text' | 'number' | 'boolean' | 'file_path' | 'directory_path';
  readonly description: string;
  readonly required: boolean;
  readonly defaultValue?: string | number | boolean;
  readonly placeholder?: string;
  readonly validation?: {
    readonly pattern?: string;
    readonly minLength?: number;
    readonly maxLength?: number;
    readonly min?: number;
    readonly max?: number;
  };
}

export interface PresetTemplate {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category: string;
  readonly icon: string;
  readonly template: string;
  readonly variables: readonly TemplateVariable[];
  readonly tags: readonly string[];
  readonly author?: string;
  readonly version: string;
  readonly lastModified: Date;
  readonly usageCount?: number;
  readonly isBuiltin: boolean;
}

export interface TemplateCategory {
  readonly id: string;
  readonly name: string;
  readonly icon: string;
  readonly description: string;
  readonly color: string;
}

export interface TemplateRenderOptions {
  readonly variables: Record<string, string | number | boolean>;
  readonly preserveWhitespace?: boolean;
  readonly escapeHtml?: boolean;
}

export interface TemplateRenderResult {
  readonly renderedText: string;
  readonly usedVariables: readonly string[];
  readonly missingVariables: readonly string[];
  readonly errors: readonly string[];
}

export interface TemplateSearchOptions {
  readonly query?: string;
  readonly category?: string;
  readonly tags?: readonly string[];
  readonly author?: string;
  readonly builtinOnly?: boolean;
  readonly customOnly?: boolean;
}

export interface TemplateUsageStats {
  readonly templateId: string;
  readonly usageCount: number;
  readonly lastUsed: Date;
  readonly averageRating?: number;
}