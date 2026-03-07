/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '../config/config.js';
import type { HierarchicalMemory } from '../config/memory.js';
import * as snippets from './snippets.js';
import * as legacySnippets from './snippets.legacy.js';
import { resolveModel, supportsModernFeatures } from '../config/models.js';
import { CLARITY_MANDATE } from './clarityMandate.js';

/**
 * Orchestrates prompt generation by gathering context and building options.
 */
export class PromptProvider {
  /**
   * Generates the core system prompt.
   */
  getCoreSystemPrompt(
    _config: Config,
    _userMemory?: string | HierarchicalMemory,
    _interactiveOverride?: boolean,
  ): string {
    return CLARITY_MANDATE;
  }

  getCompressionPrompt(config: Config): string {
    const desiredModel = resolveModel(
      config.getActiveModel(),
      config.getGemini31LaunchedSync?.() ?? false,
    );
    const isModernModel = supportsModernFeatures(desiredModel);
    const activeSnippets = isModernModel ? snippets : legacySnippets;
    return activeSnippets.getCompressionPrompt();
  }
}
