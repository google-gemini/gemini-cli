/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Content } from '@google/genai';
import type { Episode } from './types.js';
import { toIr } from './toIr.js';
import { fromIr } from './fromIr.js';
import type { ContextTokenCalculator } from '../utils/contextTokenCalculator.js';

export class IrMapper {
  /**
   * Translates a flat Gemini Content[] array into our rich Episodic Intermediate Representation.
   * Groups adjacent function calls and responses into unified ToolExecution nodes.
   */
  static toIr(
    history: readonly Content[],
    tokenCalculator: ContextTokenCalculator,
  ): Episode[] {
    return toIr(history, tokenCalculator);
  }

  /**
   * Re-serializes the Episodic IR back into a flat Gemini Content[] array.
   */
  static fromIr(episodes: Episode[]): Content[] {
    return fromIr(episodes);
  }
}
