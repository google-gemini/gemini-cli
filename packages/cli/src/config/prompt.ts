/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { PromptFromFile } from '@google/gemini-cli-core';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { parse as parseYaml } from 'yaml';

export const PROMPTS_DIRECTORY_NAME = path.join('.gemini', 'prompts');

export function loadPrompts(workspaceDir: string): PromptFromFile[] {
  const allPrompts = [
    ...loadPromptsFromDir(workspaceDir),
    ...loadPromptsFromDir(os.homedir()),
  ];

  const uniquePrompts: PromptFromFile[] = [];
  const seenIds = new Set<string>();
  for (const prompt of allPrompts) {
    if (!seenIds.has(prompt.id)) {
      uniquePrompts.push(prompt);
      seenIds.add(prompt.id);
    }
  }

  return uniquePrompts;
}

function loadPromptsFromDir(dir: string): PromptFromFile[] {
  const promptsDir = path.join(dir, PROMPTS_DIRECTORY_NAME);
  if (!fs.existsSync(promptsDir)) {
    return [];
  }

  const prompts: PromptFromFile[] = [];
  for (const relativePromptPath of fs.readdirSync(promptsDir)) {
    const absolutPromptPath = path.join(promptsDir, relativePromptPath);
    const prompt = loadPrompt(absolutPromptPath);
    if (prompt != null) {
      prompts.push(prompt);
    }
  }
  return prompts;
}

function loadPrompt(promptPath: string): PromptFromFile | null {
  try {
    const content = fs.readFileSync(promptPath, 'utf-8');
    const config = parseYaml(content);

    if (!config.id) {
      console.error(`Prompt ${promptPath} is missing required field "id"`);
      return null;
    }

    if (!config.name) {
      console.error(`Prompt ${promptPath} is missing required field "name"`);
      return null;
    }

    if (!config.template) {
      console.error(
        `Prompt ${promptPath} is missing required field "template"`,
      );
      return null;
    }

    if (config.variables && !Array.isArray(config.variables)) {
      console.error(`Prompt ${promptPath} variables must be an array`);
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
