/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import process from 'node:process';
import { homedir } from '../utils/paths.js';
import { debugLogger } from '../utils/debugLogger.js';
import type { Config } from '../config/config.js';
import * as snippets from './snippets.js';
import * as legacySnippets from './snippets.legacy.js';

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
 * Applies template substitutions to a prompt string.
 */
export function applySubstitutions(
  prompt: string,
  config: Config,
  skillsPrompt: string,
  isGemini3: boolean = false,
): string {
  let result = prompt;

  result = result.replace(/\${AgentSkills}/g, skillsPrompt);

  const activeSnippets = isGemini3 ? snippets : legacySnippets;
  const subAgentsContent = activeSnippets.renderSubAgents(
    config
      .getAgentRegistry()
      .getAllDefinitions()
      .map((d) => ({
        name: d.displayName || d.name,
        description: d.description,
      })),
  );

  result = result.replace(/\${SubAgents}/g, subAgentsContent);

  const toolRegistry = config.getToolRegistry();
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
