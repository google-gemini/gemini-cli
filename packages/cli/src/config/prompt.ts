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
  const seenIds = new Set<string>();
  for (const prompt of allPrompts) {
    if (!seenIds.has(prompt.id)) {
      console.log(`Loading prompt: ${prompt.id}`);
      uniquePrompts.push(prompt);
      seenIds.add(prompt.id);
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

    if (!config.id) {
      console.log(`Prompt ${promptPath} is missing required field "id"`);
      return null;
    }

    if (!config.name) {
      console.log(`Prompt ${promptPath} is missing required field "name"`);
      return null;
    }

    if (!config.template) {
      console.log(`Prompt ${promptPath} is missing required field "template"`);
      return null;
    }

    if (config.variables && !Array.isArray(config.variables)) {
      console.log(`Prompt ${promptPath} variables must be an array`);
      return null;
    }

    return {
      id: config.id,
      name: config.name,
      template: config.template,
      variables: config.variables || [],
    };
  } catch (e) {
    console.error(`Warning: error parsing prompt in ${promptPath}: ${e}`);
    return null;
  }
}
