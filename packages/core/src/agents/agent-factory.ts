/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type Config } from '../config/config.js';
import { AgentHarness, type AgentHarnessOptions } from './harness.js';
import { type AgentDefinition } from './types.js';

/**
 * Factory for creating agent executors/harnesses.
 * Respects experimental flags to determine which implementation to use.
 */
export class AgentFactory {
  static createHarness(
    config: Config,
    definition?: AgentDefinition,
    options: Partial<AgentHarnessOptions> = {},
  ): AgentHarness {
    return new AgentHarness({
      config,
      definition,
      ...options,
    });
  }
}
