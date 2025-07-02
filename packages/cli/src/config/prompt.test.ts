/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { PredefinedPromptVariable } from '@google/gemini-cli-core';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { stringify as stringifyYaml } from 'yaml';
import {
  PROMPTS_DIRECTORY_NAME,
  loadPrompts,
  renderPromptTemplate,
} from './prompt.js';

vi.mock('os', async (importOriginal) => {
  const os = await importOriginal<typeof import('os')>();
  return {
    ...os,
    homedir: vi.fn(),
  };
});

describe('loadPrompts', () => {
  let tempWorkspaceDir: string;
  let tempHomeDir: string;

  beforeEach(() => {
    tempWorkspaceDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gemini-cli-test-workspace-'),
    );
    tempHomeDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gemini-cli-test-home-'),
    );
    vi.mocked(os.homedir).mockReturnValue(tempHomeDir);
  });

  afterEach(() => {
    fs.rmSync(tempWorkspaceDir, { recursive: true, force: true });
    fs.rmSync(tempHomeDir, { recursive: true, force: true });
  });

  it('should load prompts', () => {
    const workspaceExtensionsDir = path.join(
      tempWorkspaceDir,
      PROMPTS_DIRECTORY_NAME,
    );
    fs.mkdirSync(workspaceExtensionsDir, { recursive: true });
    createPrompt(
      workspaceExtensionsDir,
      'controller',
      'class {{name}}Controller extends Controller {}',
      'Generates a new nestjs controller',
      [{ name: 'name', type: 'string', required: true }],
    );
    createPrompt(
      workspaceExtensionsDir,
      'module',
      'class TestModule extends OnInit {}',
      'Generates a new nestjs module',
    );

    const prompts = loadPrompts(tempWorkspaceDir);

    expect(prompts).toHaveLength(2);
    const p1 = prompts.find((p) => p.name === 'controller');
    const p2 = prompts.find((p) => p.name === 'module');

    expect(p1?.variables?.length).toEqual(1);
    expect(p1?.template).toEqual(
      'class {{name}}Controller extends Controller {}',
    );
    expect(p2?.variables).toBeUndefined();
    expect(p2?.template).toEqual('class TestModule extends OnInit {}');
  });
});

describe('renderPromptTemplate', () => {
  it('should replace single variable in template', () => {
    const template = 'Hello {{name}}!';
    const variables = { name: 'World' };

    const result = renderPromptTemplate(template, variables);

    expect(result).toBe('Hello World!');
  });

  it('should replace multiple variables in template', () => {
    const template = 'class {{name}}Controller extends {{baseClass}} {}';
    const variables = { name: 'User', baseClass: 'Controller' };

    const result = renderPromptTemplate(template, variables);

    expect(result).toBe('class UserController extends Controller {}');
  });

  it('should handle variables with whitespace in braces', () => {
    const template = 'Hello {{ name }}! Welcome to {{ service }}.';
    const variables = { name: 'John', service: 'Gemini' };

    const result = renderPromptTemplate(template, variables);

    expect(result).toBe('Hello John! Welcome to Gemini.');
  });

  it('should replace undefined variables with empty string', () => {
    const template = 'Hello {{name}}! Your {{missing}} is ready.';
    const variables = { name: 'Alice' };

    const result = renderPromptTemplate(template, variables);

    expect(result).toBe('Hello Alice! Your  is ready.');
  });

  it('should handle template with no variables', () => {
    const template = 'This is a static template with no variables.';
    const variables = { unused: 'value' };

    const result = renderPromptTemplate(template, variables);

    expect(result).toBe('This is a static template with no variables.');
  });

  it('should handle empty template', () => {
    const template = '';
    const variables = { name: 'Test' };

    const result = renderPromptTemplate(template, variables);

    expect(result).toBe('');
  });

  it('should handle same variable used multiple times', () => {
    const template =
      '{{name}} is learning {{subject}}. {{name}} enjoys {{subject}}!';
    const variables = { name: 'Alice', subject: 'TypeScript' };

    const result = renderPromptTemplate(template, variables);

    expect(result).toBe(
      'Alice is learning TypeScript. Alice enjoys TypeScript!',
    );
  });

  it('should handle variables with special characters in values', () => {
    const template = 'Path: {{path}}, Query: {{query}}';
    const variables = {
      path: '/api/users?id=123&name=John',
      query: 'SELECT * FROM users WHERE name = "John"',
    };

    const result = renderPromptTemplate(template, variables);

    expect(result).toBe(
      'Path: /api/users?id=123&name=John, Query: SELECT * FROM users WHERE name = "John"',
    );
  });

  it('should handle malformed variable syntax gracefully', () => {
    const template = 'Hello {name} and {{invalid and {{valid}}!';
    const variables = { name: 'Alice', valid: 'Bob' };

    const result = renderPromptTemplate(template, variables);

    expect(result).toBe('Hello {name} and {{invalid and Bob!');
  });

  it('should handle numeric variables', () => {
    const template = 'User {{id}} has {{count}} items';
    const variables = { id: '123', count: '5' };

    const result = renderPromptTemplate(template, variables);

    expect(result).toBe('User 123 has 5 items');
  });

  it('should handle underscore and camelCase variable names', () => {
    const template = 'Hello {{user_name}} from {{companyName}}!';
    const variables = { user_name: 'john_doe', companyName: 'TechCorp' };

    const result = renderPromptTemplate(template, variables);

    expect(result).toBe('Hello john_doe from TechCorp!');
  });
});

function createPrompt(
  promptsDir: string,
  name: string,
  template: string,
  description?: string,
  variables?: PredefinedPromptVariable[],
): void {
  const promptPath = path.join(promptsDir, `${name}.yaml`);
  fs.writeFileSync(
    promptPath,
    stringifyYaml({
      name,
      template,
      description,
      variables,
    }),
    'utf-8',
  );
}
