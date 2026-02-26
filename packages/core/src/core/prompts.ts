/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '../config/config.js';
import type { HierarchicalMemory } from '../config/memory.js';
import { PromptProvider } from '../prompts/promptProvider.js';
import { resolvePathFromEnv as resolvePathFromEnvImpl } from '../prompts/utils.js';
export { CONFUCIUS_PROMPT } from '../prompts/snippets.js';

/**
 * Resolves a path or switch value from an environment variable.
 * @deprecated Use resolvePathFromEnv from @google/gemini-cli-core/prompts/utils instead.
 */
export function resolvePathFromEnv(envVar?: string) {
  return resolvePathFromEnvImpl(envVar);
}

/**
 * Returns the core system prompt for the agent.
 */
export function getCoreSystemPrompt(
  config: Config,
  userMemory?: string | HierarchicalMemory,
  interactiveOverride?: boolean,
  provider: PromptProvider = new PromptProvider(),
): string {
  return provider.getCoreSystemPrompt(config, userMemory, interactiveOverride);
}

/**
 * Provides the system prompt for the history compression process.
 */
export function getCompressionPrompt(config: Config): string {
  return new PromptProvider().getCompressionPrompt(config);
}

/**
 * Provides the system prompt for the archive index generation process.
 */
export function getArchiveIndexPrompt(config: Config): string {
  return new PromptProvider().getArchiveIndexPrompt(config);
}
