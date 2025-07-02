/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { PredefinedPrompt } from '@google/gemini-cli-core';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { parse as parseYaml } from 'yaml';

export const PROMPTS_DIRECTORY_NAME = path.join('.gemini', 'prompts');

export function loadPrompts(workspaceDir: string): PredefinedPrompt[] {
  const allPrompts = [
    ...loadPromptsFromDir(workspaceDir),
    ...loadPromptsFromDir(os.homedir()),
  ];

  const uniquePrompts: PredefinedPrompt[] = [];
  const seenNames = new Set<string>();
  for (const prompt of allPrompts) {
    if (!seenNames.has(prompt.name)) {
      console.log(`Loading prompt: ${prompt.name}`);
      uniquePrompts.push(prompt);
      seenNames.add(prompt.name);
    }
  }

  return uniquePrompts;
}

function loadPromptsFromDir(dir: string): PredefinedPrompt[] {
  const promptsDir = path.join(dir, PROMPTS_DIRECTORY_NAME);
  if (!fs.existsSync(promptsDir)) {
    return [];
  }

  const prompts: PredefinedPrompt[] = [];
  for (const relativePromptPath of fs.readdirSync(promptsDir)) {
    const absolutPromptPath = path.join(promptsDir, relativePromptPath);
    const prompt = loadPrompt(absolutPromptPath);
    if (prompt != null) {
      prompts.push(prompt);
    }
  }
  return prompts;
}

function loadPrompt(promptPath: string): PredefinedPrompt | null {
  try {
    const content = fs.readFileSync(promptPath, 'utf-8');
    const config = parseYaml(content);
    return {
      name: config.name,
      template: config.template,
      description: config.description,
      variables: config.variables,
    };
  } catch (e) {
    console.error(`Warning: error parsing prompt in ${promptPath}: ${e}`);
    return null;
  }
}

export function renderPromptTemplate(
  template: string,
  variables: Record<string, string>,
): string {
  return template.replace(
    /\{\{\s*(\w+)\s*\}\}/g,
    (_match, p1) => variables[p1] || '',
  );
}
