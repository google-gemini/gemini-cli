/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Content } from '@google/genai';
import type { Episode } from './types.js';
import { toIr, setMapperConfig } from './toIr.js';
import { fromIr } from './fromIr.js';

export class IrMapper {
  static setConfig(cfg: { charsPerToken?: number }) {
    setMapperConfig(cfg);
  }

  /**
   * Translates a flat Gemini Content[] array into our rich Episodic Intermediate Representation.
   * Groups adjacent function calls and responses into unified ToolExecution nodes.
   */
  static toIr(history: readonly Content[]): Episode[] {
    return toIr(history);
  }

  /**
   * Re-serializes the Episodic IR back into a flat Gemini Content[] array.
   */
  static fromIr(episodes: Episode[]): Content[] {
    return fromIr(episodes);
  }
}
