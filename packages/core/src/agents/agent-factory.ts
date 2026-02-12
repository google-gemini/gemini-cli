/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type Config } from '../config/config.js';
import { AgentHarness, type AgentHarnessOptions } from './harness.js';
import { type AgentDefinition } from './types.js';
import { MainAgentBehavior, SubagentBehavior } from './behavior.js';

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
    const behavior = definition
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion, @typescript-eslint/no-explicit-any
      ? new SubagentBehavior(
          config, 
          definition as any, 
          options.inputs, 
          options.parentPromptId
        )
      : new MainAgentBehavior(config, options.parentPromptId);

    return new AgentHarness({
      config,
      behavior,
      isolatedTools: !!definition,
      ...options,
    });
  }
}
