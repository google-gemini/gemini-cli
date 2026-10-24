/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { homedir } from '../utils/paths.js';
import { debugLogger } from '../utils/debugLogger.js';
import * as snippets from './snippets.js';
import * as legacySnippets from './snippets.legacy.js';
import type { AgentLoopContext } from '../config/agent-loop-context.js';

export type ResolvedPath = {
  isSwitch: boolean;
  value: string | null;
  isDisabled: boolean;
};

/**
 * Resolves a path or switch value from an environment variable.
 */
export function resolvePathFromEnv(envVar?: string): ResolvedPath {
  const trimmedEnvVar = envVar?.trim();
  if (!trimmedEnvVar) {
    return { isSwitch: false, value: null, isDisabled: false };
  }

  const lowerEnvVar = trimmedEnvVar.toLowerCase();
  if (['0', 'false', '1', 'true'].includes(lowerEnvVar)) {
    const isDisabled = ['0', 'false'].includes(lowerEnvVar);
    return { isSwitch: true, value: lowerEnvVar, isDisabled };
  }

  let customPath = trimmedEnvVar;
  if (customPath.startsWith('~/') || customPath === '~') {
    try {
      const home = homedir();
      if (customPath === '~') {
        customPath = home;
      } else {
        customPath = path.join(home, customPath.slice(2));
      }
    } catch (error) {
      debugLogger.warn(
        `Could not resolve home directory for path: ${trimmedEnvVar}`,
        error,
      );
      return { isSwitch: false, value: null, isDisabled: false };
    }
  }

  return {
    isSwitch: false,
    value: path.resolve(customPath),
    isDisabled: false,
  };
}

/**
 * Resolves ~ and relative paths the same way GEMINI_SYSTEM_MD does, treating
 * the value as a file path (not a true/false switch).
 */
export function resolveAppendSystemPromptPath(filePath: string): string {
  const resolution = resolvePathFromEnv(filePath);
  if (resolution.value && !resolution.isSwitch && !resolution.isDisabled) {
    return resolution.value;
  }
  return path.resolve(filePath.trim());
}

/**
 * Reads an append-system-prompt file. Throws a clear error if the file cannot
 * be read.
 */
export function readAppendSystemPromptFile(filePath: string): string {
  const resolvedPath = resolveAppendSystemPromptPath(filePath);
  try {
    return fs.readFileSync(resolvedPath, 'utf8');
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `unable to read append system prompt file '${resolvedPath}': ${reason}`,
    );
  }
}

/**
 * Combines append-system-prompt sources in documented order:
 * GEMINI_APPEND_SYSTEM_MD file, --append-system-prompt-file, then
 * --append-system-prompt. Each non-empty part is separated by a blank line.
 */
export function collectAppendSystemPrompt(options: {
  envPath?: string;
  filePath?: string;
  text?: string;
}): string | undefined {
  const parts: string[] = [];
  for (const filePath of [options.envPath, options.filePath]) {
    const trimmed = filePath?.trim();
    if (!trimmed) {
      continue;
    }
    const content = readAppendSystemPromptFile(trimmed).trim();
    if (content) {
      parts.push(content);
    }
  }
  const text = options.text?.trim();
  if (text) {
    parts.push(text);
  }
  return parts.length > 0 ? parts.join('\n\n') : undefined;
}

/**
 * Wraps launch-scoped extra instructions in a delimited section.
 */
export function renderAppendedSystemPrompt(text: string): string {
  return `# Additional System Instructions

The following instructions were appended at launch and supplement the system prompt above. They do not replace Core Mandates regarding safety, security, and agent integrity.

<appended_system_instructions>
${text.trim()}
</appended_system_instructions>`;
}

/**
 * Applies template substitutions to a prompt string.
 */
export function applySubstitutions(
  prompt: string,
  context: AgentLoopContext,
  skillsPrompt: string,
  isGemini3: boolean = false,
): string {
  let result = prompt;

  result = result.replace(/\${AgentSkills}/g, skillsPrompt);

  const activeSnippets = isGemini3 ? snippets : legacySnippets;
  const subAgentsContent = activeSnippets.renderSubAgents(
    context.config
      .getAgentRegistry()
      .getAllDefinitions()
      .map((d) => ({
        name: d.name,
        description: d.description,
      })),
  );

  result = result.replace(/\${SubAgents}/g, subAgentsContent);

  const toolRegistry = context.toolRegistry;
  const allToolNames = toolRegistry.getAllToolNames();
  const availableToolsList =
    allToolNames.length > 0
      ? allToolNames.map((name) => `- ${name}`).join('\n')
      : 'No tools are currently available.';
  result = result.replace(/\${AvailableTools}/g, availableToolsList);

  for (const toolName of allToolNames) {
    const varName = `${toolName}_ToolName`;
    result = result.replace(
      new RegExp(`\\\${\\b${varName}\\b}`, 'g'),
      toolName,
    );
  }

  return result;
}

/**
 * Checks if a specific prompt section is enabled via environment variables.
 */
export function isSectionEnabled(key: string): boolean {
  const envVar = process.env[`GEMINI_PROMPT_${key.toUpperCase()}`];
  const lowerEnvVar = envVar?.trim().toLowerCase();
  return lowerEnvVar !== '0' && lowerEnvVar !== 'false';
}
