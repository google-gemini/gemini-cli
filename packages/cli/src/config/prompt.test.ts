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
import { PROMPTS_DIRECTORY_NAME, loadPrompts } from './prompt.js';

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
      'Generates a new nestjs controller',
      'class {{name}}Controller extends Controller {}',
      [{ name: 'name', type: 'string', required: true }],
    );
    createPrompt(
      workspaceExtensionsDir,
      'module',
      'Generates a new nestjs module',
      'class TestModule extends OnInit {}',
    );

    const prompts = loadPrompts(tempWorkspaceDir);

    expect(prompts).toHaveLength(2);
    const p1 = prompts.find((p) => p.id === 'controller');
    const p2 = prompts.find((p) => p.id === 'module');

    expect(p1?.variables?.length).toEqual(1);
    expect(p1?.template).toEqual(
      'class {{name}}Controller extends Controller {}',
    );
    expect(p2?.variables).toEqual([]);
    expect(p2?.template).toEqual('class TestModule extends OnInit {}');
  });
});

function createPrompt(
  promptsDir: string,
  id: string,
  name: string,
  template: string,
  variables?: PredefinedPromptVariable[],
): void {
  const promptPath = path.join(promptsDir, `${name}.yaml`);
  fs.writeFileSync(
    promptPath,
    stringifyYaml({
      id,
      name,
      template,
      variables,
    }),
    'utf-8',
  );
}
