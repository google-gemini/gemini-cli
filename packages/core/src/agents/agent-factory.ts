/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type Config } from '../config/config.js';
import { AgentHarness, type AgentHarnessOptions } from './harness.js';
import { type AgentDefinition, type LocalAgentDefinition } from './types.js';
import { MainAgentBehavior, SubagentBehavior } from './behavior.js';
import { debugLogger } from '../utils/debugLogger.js';

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
    let behavior;
    if (definition && definition.kind === 'local') {
      const localDef: LocalAgentDefinition = definition;
      behavior = new SubagentBehavior(
        config,
        localDef,
        options.inputs,
        options.parentPromptId,
      );
    } else {
      behavior = new MainAgentBehavior(config, options.parentPromptId);
    }

    debugLogger.debug(
      `[AgentFactory] Creating harness for agent: ${behavior.name} (agentId: ${behavior.agentId})`,
    );

    return new AgentHarness({
      config,
      behavior,
      isolatedTools: !!definition,
      ...options,
    });
  }
}
