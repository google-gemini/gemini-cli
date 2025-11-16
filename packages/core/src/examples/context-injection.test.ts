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

import { describe, it, expect } from 'vitest';
import type { Example } from './types.js';
import {
  injectContext,
  extractVariables,
  validateVariables,
  parseVariablesFromArgs,
} from './context-injection.js';

const createMockExample = (overrides: Partial<Example> = {}): Example => ({
  id: 'test-example',
  title: 'Test Example',
  description: 'A test example',
  category: 'development',
  tags: ['test'],
  difficulty: 'beginner',
  estimatedTime: '5 minutes',
  requiredTools: [],
  requiredPermissions: [],
  examplePrompt: 'Test prompt',
  expectedOutcome: 'Test outcome',
  tips: [],
  relatedExamples: [],
  documentationLinks: [],
  ...overrides,
});

describe('injectContext', () => {
  it('should inject context files', () => {
    const example = createMockExample({
      examplePrompt: 'Analyze the code',
      contextFiles: ['src/app.ts', 'package.json'],
    });

    const result = injectContext(example);

    expect(result.contextFiles).toEqual(['src/app.ts', 'package.json']);
    expect(result.prompt).toContain('@src/app.ts @package.json');
    expect(result.prompt).toContain('Analyze the code');
  });

  it('should substitute variables in prompt', () => {
    const example = createMockExample({
      examplePrompt: 'Analyze {{file}} for {{issue}}',
    });

    const result = injectContext(example, {
      variables: {
        file: 'src/app.ts',
        issue: 'bugs',
      },
    });

    expect(result.prompt).toContain('Analyze src/app.ts for bugs');
    expect(result.substitutions).toHaveLength(2);
    expect(result.substitutions[0]).toEqual({ variable: 'file', value: 'src/app.ts' });
    expect(result.substitutions[1]).toEqual({ variable: 'issue', value: 'bugs' });
  });

  it('should combine context files and variables', () => {
    const example = createMockExample({
      examplePrompt: 'Check {{file}} for issues',
      contextFiles: ['tsconfig.json'],
    });

    const result = injectContext(example, {
      variables: { file: 'src/app.ts' },
    });

    expect(result.prompt).toContain('@tsconfig.json');
    expect(result.prompt).toContain('Check src/app.ts for issues');
    expect(result.contextFiles).toEqual(['tsconfig.json']);
  });

  it('should include additional files', () => {
    const example = createMockExample({
      examplePrompt: 'Test',
      contextFiles: ['file1.ts'],
    });

    const result = injectContext(example, {
      additionalFiles: ['file2.ts', 'file3.ts'],
    });

    expect(result.contextFiles).toEqual(['file1.ts', 'file2.ts', 'file3.ts']);
  });

  it('should skip default files when requested', () => {
    const example = createMockExample({
      examplePrompt: 'Test',
      contextFiles: ['default.ts'],
    });

    const result = injectContext(example, {
      includeDefaultFiles: false,
      additionalFiles: ['custom.ts'],
    });

    expect(result.contextFiles).toEqual(['custom.ts']);
    expect(result.contextFiles).not.toContain('default.ts');
  });

  it('should leave unsubstituted variables in prompt', () => {
    const example = createMockExample({
      examplePrompt: 'Analyze {{file}} for {{issue}}',
    });

    const result = injectContext(example, {
      variables: { file: 'app.ts' },
    });

    expect(result.prompt).toContain('app.ts');
    expect(result.prompt).toContain('{{issue}}');
  });

  it('should handle prompts without variables', () => {
    const example = createMockExample({
      examplePrompt: 'Analyze the codebase',
    });

    const result = injectContext(example);

    expect(result.prompt).toBe('Analyze the codebase');
    expect(result.substitutions).toHaveLength(0);
  });

  it('should generate correct context preview', () => {
    const example = createMockExample({
      examplePrompt: 'Test',
      contextFiles: ['file1.ts', 'file2.ts'],
    });

    const result = injectContext(example);

    expect(result.contextPreview).toBe('@file1.ts @file2.ts');
  });

  describe('variable defaults (Phase 4)', () => {
    it('should use default variable values when not provided', () => {
      const example = createMockExample({
        examplePrompt: 'Check {{file}} for {{issue}}',
        variableDefaults: {
          file: 'src/app.ts',
          issue: 'bugs',
        },
      });

      const result = injectContext(example);

      expect(result.prompt).toContain('Check src/app.ts for bugs');
      expect(result.substitutions).toHaveLength(2);
    });

    it('should override defaults with provided variables', () => {
      const example = createMockExample({
        examplePrompt: 'Check {{file}} for {{issue}}',
        variableDefaults: {
          file: 'default.ts',
          issue: 'bugs',
        },
      });

      const result = injectContext(example, {
        variables: {
          file: 'custom.ts',
        },
      });

      expect(result.prompt).toContain('Check custom.ts for bugs');
      expect(result.substitutions.find((s) => s.variable === 'file')?.value).toBe(
        'custom.ts',
      );
      expect(result.substitutions.find((s) => s.variable === 'issue')?.value).toBe(
        'bugs',
      );
    });

    it('should merge defaults with provided variables', () => {
      const example = createMockExample({
        examplePrompt: 'Check {{file}} in {{directory}} for {{issue}}',
        variableDefaults: {
          directory: 'src',
          issue: 'bugs',
        },
      });

      const result = injectContext(example, {
        variables: {
          file: 'app.ts',
          issue: 'errors',
        },
      });

      expect(result.prompt).toContain('Check app.ts in src for errors');
      expect(result.substitutions).toHaveLength(3);
      expect(result.substitutions.find((s) => s.variable === 'file')?.value).toBe(
        'app.ts',
      );
      expect(
        result.substitutions.find((s) => s.variable === 'directory')?.value,
      ).toBe('src');
      expect(result.substitutions.find((s) => s.variable === 'issue')?.value).toBe(
        'errors',
      );
    });

    it('should work without any variable defaults', () => {
      const example = createMockExample({
        examplePrompt: 'Check {{file}}',
      });

      const result = injectContext(example, {
        variables: { file: 'app.ts' },
      });

      expect(result.prompt).toContain('Check app.ts');
    });

    it('should allow empty defaults object', () => {
      const example = createMockExample({
        examplePrompt: 'Check {{file}}',
        variableDefaults: {},
      });

      const result = injectContext(example, {
        variables: { file: 'app.ts' },
      });

      expect(result.prompt).toContain('Check app.ts');
    });

    it('should use all defaults when no variables provided', () => {
      const example = createMockExample({
        examplePrompt: 'Analyze {{file}} for {{issue}} in {{mode}} mode',
        variableDefaults: {
          file: 'index.ts',
          issue: 'performance',
          mode: 'strict',
        },
      });

      const result = injectContext(example);

      expect(result.prompt).toContain(
        'Analyze index.ts for performance in strict mode',
      );
      expect(result.substitutions).toHaveLength(3);
    });

    it('should handle complex default values', () => {
      const example = createMockExample({
        examplePrompt: 'Fetch from {{url}} with {{token}}',
        variableDefaults: {
          url: 'https://api.example.com/v1',
          token: 'default-api-key-123',
        },
      });

      const result = injectContext(example);

      expect(result.prompt).toContain(
        'Fetch from https://api.example.com/v1 with default-api-key-123',
      );
    });
  });
});

describe('extractVariables', () => {
  it('should extract variables from prompt', () => {
    const prompt = 'Analyze {{file}} for {{issue}} and {{problem}}';
    const variables = extractVariables(prompt);

    expect(variables).toEqual(['file', 'issue', 'problem']);
  });

  it('should handle duplicate variables', () => {
    const prompt = 'Check {{file}} and then {{file}} again';
    const variables = extractVariables(prompt);

    expect(variables).toEqual(['file']);
  });

  it('should handle prompts without variables', () => {
    const prompt = 'Simple prompt with no variables';
    const variables = extractVariables(prompt);

    expect(variables).toEqual([]);
  });

  it('should only match valid variable names', () => {
    const prompt = 'Test {{var1}} and {{var-2}} and {{123}}';
    const variables = extractVariables(prompt);

    // Only var1 is valid (alphanumeric + underscore)
    expect(variables).toEqual(['var1']);
  });
});

describe('validateVariables', () => {
  it('should validate all variables provided', () => {
    const example = createMockExample({
      examplePrompt: 'Check {{file}} for {{issue}}',
    });

    const result = validateVariables(example, {
      file: 'app.ts',
      issue: 'bugs',
    });

    expect(result.valid).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.extra).toEqual([]);
  });

  it('should detect missing variables', () => {
    const example = createMockExample({
      examplePrompt: 'Check {{file}} for {{issue}}',
    });

    const result = validateVariables(example, {
      file: 'app.ts',
    });

    expect(result.valid).toBe(false);
    expect(result.missing).toEqual(['issue']);
  });

  it('should detect extra variables', () => {
    const example = createMockExample({
      examplePrompt: 'Check {{file}}',
    });

    const result = validateVariables(example, {
      file: 'app.ts',
      issue: 'bugs',
      extra: 'value',
    });

    expect(result.valid).toBe(true); // Still valid, just has extra
    expect(result.extra).toEqual(['issue', 'extra']);
  });

  it('should handle example without variables', () => {
    const example = createMockExample({
      examplePrompt: 'Simple prompt',
    });

    const result = validateVariables(example, {});

    expect(result.valid).toBe(true);
    expect(result.missing).toEqual([]);
  });

  describe('with variable defaults (P1 fix)', () => {
    it('should accept missing variables when they have defaults', () => {
      const example = createMockExample({
        examplePrompt: 'Check {{file}} for {{issue}}',
        variableDefaults: {
          file: 'index.ts',
          issue: 'bugs',
        },
      });

      // No variables provided, but all have defaults
      const result = validateVariables(example, {});

      expect(result.valid).toBe(true);
      expect(result.missing).toEqual([]);
    });

    it('should accept partial variables when missing ones have defaults', () => {
      const example = createMockExample({
        examplePrompt: 'Analyze {{file}} in {{mode}} for {{issue}}',
        variableDefaults: {
          mode: 'production',
          issue: 'bugs',
        },
      });

      // Only provide 'file', others have defaults
      const result = validateVariables(example, { file: 'app.ts' });

      expect(result.valid).toBe(true);
      expect(result.missing).toEqual([]);
    });

    it('should still detect missing variables without defaults', () => {
      const example = createMockExample({
        examplePrompt: 'Analyze {{file}} for {{issue}}',
        variableDefaults: {
          issue: 'bugs',
        },
      });

      // 'file' has no default and is not provided
      const result = validateVariables(example, {});

      expect(result.valid).toBe(false);
      expect(result.missing).toEqual(['file']);
    });

    it('should allow provided variables to override defaults', () => {
      const example = createMockExample({
        examplePrompt: 'Check {{file}} for {{issue}}',
        variableDefaults: {
          file: 'default.ts',
          issue: 'bugs',
        },
      });

      // Override the default 'file' value
      const result = validateVariables(example, { file: 'custom.ts' });

      expect(result.valid).toBe(true);
      expect(result.missing).toEqual([]);
    });

    it('should handle examples without variableDefaults', () => {
      const example = createMockExample({
        examplePrompt: 'Check {{file}} for {{issue}}',
        // No variableDefaults
      });

      const result = validateVariables(example, { file: 'app.ts' });

      expect(result.valid).toBe(false);
      expect(result.missing).toEqual(['issue']);
    });

    it('should handle empty variableDefaults', () => {
      const example = createMockExample({
        examplePrompt: 'Check {{file}}',
        variableDefaults: {},
      });

      const result = validateVariables(example, {});

      expect(result.valid).toBe(false);
      expect(result.missing).toEqual(['file']);
    });

    it('should validate complex scenario with mixed defaults', () => {
      const example = createMockExample({
        examplePrompt: 'Analyze {{file}} in {{dir}} for {{issue}} using {{tool}}',
        variableDefaults: {
          dir: 'src',
          tool: 'eslint',
        },
      });

      // Provide file, missing issue (no default), dir and tool have defaults
      const result = validateVariables(example, { file: 'app.ts' });

      expect(result.valid).toBe(false);
      expect(result.missing).toEqual(['issue']);
    });
  });
});

describe('parseVariablesFromArgs', () => {
  it('should parse simple key=value pairs', () => {
    const args = 'file=app.ts issue=bug';
    const variables = parseVariablesFromArgs(args);

    expect(variables).toEqual({
      file: 'app.ts',
      issue: 'bug',
    });
  });

  it('should handle values with spaces', () => {
    const args = 'message="hello world" file=test.ts';
    const variables = parseVariablesFromArgs(args);

    expect(variables.message).toBe('"hello');
    expect(variables.file).toBe('test.ts');
  });

  it('should handle empty args', () => {
    const variables = parseVariablesFromArgs('');

    expect(variables).toEqual({});
  });

  it('should ignore malformed pairs', () => {
    const args = 'file=app.ts invalid issue=bug';
    const variables = parseVariablesFromArgs(args);

    expect(variables).toEqual({
      file: 'app.ts',
      issue: 'bug',
    });
  });

  it('should handle values with equals signs', () => {
    const args = 'expression=x=5';
    const variables = parseVariablesFromArgs(args);

    // Should preserve everything after first '='
    expect(variables.expression).toBe('x=5');
  });

  it('should handle URLs and query strings with equals', () => {
    const args = 'url=https://example.com/?token=abc==';
    const variables = parseVariablesFromArgs(args);

    // Should preserve full URL including all '=' characters
    expect(variables.url).toBe('https://example.com/?token=abc==');
  });

  it('should handle base64-like values', () => {
    const args = 'data=SGVsbG8gV29ybGQ=';
    const variables = parseVariablesFromArgs(args);

    // Should preserve trailing '=' characters in base64
    expect(variables.data).toBe('SGVsbG8gV29ybGQ=');
  });

  it('should trim whitespace', () => {
    const args = '  file=app.ts   issue=bug  ';
    const variables = parseVariablesFromArgs(args);

    expect(variables).toEqual({
      file: 'app.ts',
      issue: 'bug',
    });
  });
});
