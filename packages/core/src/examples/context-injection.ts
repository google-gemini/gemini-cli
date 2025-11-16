/**
 * Copyright 2025 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Context Injection for Example Prompts
 *
 * Provides utilities for injecting context (files, variables) into example prompts
 * with support for variable substitution and preview.
 *
 * @module examples/context-injection
 */

import type { Example } from './types.js';

/**
 * Options for context injection
 */
export interface ContextInjectionOptions {
  /** Variables to substitute in the prompt */
  variables?: Record<string, string>;

  /** Additional context files to include */
  additionalFiles?: string[];

  /** Whether to include default context files from example */
  includeDefaultFiles?: boolean;
}

/**
 * Result of context injection
 */
export interface InjectedContext {
  /** The final prompt with all substitutions */
  prompt: string;

  /** Files that will be included */
  contextFiles: string[];

  /** Variables that were substituted */
  substitutions: Array<{
    variable: string;
    value: string;
  }>;

  /** Preview of the context file references */
  contextPreview: string;
}

/**
 * Inject context into an example prompt
 *
 * This function:
 * 1. Substitutes variables in the prompt using {{variable}} syntax
 * 2. Prepends context file references using @ syntax
 * 3. Returns the complete prompt and metadata about injections
 *
 * @param example - The example to process
 * @param options - Context injection options
 * @returns Injected context result
 *
 * @example
 * ```typescript
 * const example = {
 *   id: 'analyze-file',
 *   examplePrompt: 'Analyze the code in {{file}} for bugs',
 *   contextFiles: ['package.json'],
 *   // ...
 * };
 *
 * const result = injectContext(example, {
 *   variables: { file: 'src/app.ts' },
 *   additionalFiles: ['tsconfig.json']
 * });
 *
 * // result.prompt:
 * // "@package.json @tsconfig.json
 * //
 * // Analyze the code in src/app.ts for bugs"
 * ```
 */
export function injectContext(
  example: Example,
  options: ContextInjectionOptions = {},
): InjectedContext {
  const {
    variables = {},
    additionalFiles = [],
    includeDefaultFiles = true,
  } = options;

  // Collect all context files
  const contextFiles: string[] = [];

  if (includeDefaultFiles && example.contextFiles) {
    contextFiles.push(...example.contextFiles);
  }

  if (additionalFiles.length > 0) {
    contextFiles.push(...additionalFiles);
  }

  // Substitute variables in the prompt
  let prompt = example.examplePrompt;
  const substitutions: Array<{ variable: string; value: string }> = [];

  // Find all {{variable}} patterns
  const variablePattern = /\{\{(\w+)\}\}/g;
  const matches = prompt.matchAll(variablePattern);

  for (const match of matches) {
    const variable = match[1];
    const value = variables[variable];

    if (value !== undefined) {
      prompt = prompt.replace(match[0], value);
      substitutions.push({ variable, value });
    }
  }

  // Build context preview
  let contextPreview = '';
  if (contextFiles.length > 0) {
    const fileRefs = contextFiles.map((f) => `@${f}`).join(' ');
    contextPreview = fileRefs;
    prompt = `${fileRefs}\n\n${prompt}`;
  }

  return {
    prompt,
    contextFiles,
    substitutions,
    contextPreview,
  };
}

/**
 * Extract variables from a prompt
 *
 * Finds all {{variable}} patterns in the prompt and returns their names.
 *
 * @param prompt - The prompt to analyze
 * @returns Array of variable names found
 *
 * @example
 * ```typescript
 * const variables = extractVariables('Analyze {{file}} for {{issue}}');
 * // variables = ['file', 'issue']
 * ```
 */
export function extractVariables(prompt: string): string[] {
  const variablePattern = /\{\{(\w+)\}\}/g;
  const matches = prompt.matchAll(variablePattern);
  const variables = new Set<string>();

  for (const match of matches) {
    variables.add(match[1]);
  }

  return Array.from(variables);
}

/**
 * Validate that all required variables are provided
 *
 * @param example - The example to validate
 * @param variables - Variables provided
 * @returns Object with validation result
 *
 * @example
 * ```typescript
 * const example = {
 *   examplePrompt: 'Analyze {{file}} for {{issue}}',
 *   // ...
 * };
 *
 * const result = validateVariables(example, { file: 'app.ts' });
 * // result.valid = false
 * // result.missing = ['issue']
 * ```
 */
export function validateVariables(
  example: Example,
  variables: Record<string, string>,
): { valid: boolean; missing: string[]; extra: string[] } {
  const required = extractVariables(example.examplePrompt);
  const provided = Object.keys(variables);

  const missing = required.filter((v) => !provided.includes(v));
  const extra = provided.filter((v) => !required.includes(v));

  return {
    valid: missing.length === 0,
    missing,
    extra,
  };
}

/**
 * Parse variables from command-line arguments
 *
 * Parses arguments like "key1=value1 key2=value2" into a variables object.
 * Splits on the first '=' to extract key, and takes everything after as value.
 * This preserves values that contain '=' characters.
 *
 * @param args - The argument string to parse
 * @returns Variables object
 *
 * @example
 * ```typescript
 * const vars = parseVariablesFromArgs('file=app.ts issue=bug');
 * // vars = { file: 'app.ts', issue: 'bug' }
 *
 * const vars2 = parseVariablesFromArgs('url=https://example.com/?token=abc==');
 * // vars2 = { url: 'https://example.com/?token=abc==' } (preserves all '=')
 *
 * const vars3 = parseVariablesFromArgs('expression=x=5');
 * // vars3 = { expression: 'x=5' } (preserves full expression)
 * ```
 */
export function parseVariablesFromArgs(
  args: string,
): Record<string, string> {
  const variables: Record<string, string> = {};
  const parts = args.trim().split(/\s+/);

  for (const part of parts) {
    const equalIndex = part.indexOf('=');
    if (equalIndex > 0) {
      const key = part.substring(0, equalIndex);
      const value = part.substring(equalIndex + 1);
      // Validate key is a valid variable name (word characters only)
      if (key.match(/^\w+$/)) {
        variables[key] = value;
      }
    }
  }

  return variables;
}
