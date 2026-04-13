/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BaseDeclarativeTool,
  type ToolResult,
  Kind,
  type ToolInvocation,
} from './tools.js';
import { type AgentLoopContext } from '../config/agent-loop-context.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import {
  WATCHER_TOOL_NAME,
  WATCHER_DISPLAY_NAME,
} from './definitions/base-declarations.js';
import { LocalSubagentInvocation } from '../agents/local-invocation.js';
import { WatcherAgent } from '../agents/watcher-agent.js';
import type { AgentInputs } from '../agents/types.js';

/**
 * A specialized tool for the internal Watcher agent loop.
 *
 * This tool wraps the Watcher sub-agent to allow it to be discovered and
 * executed by the GeminiClient's internal monitoring loop.
 */
export class WatcherTool extends BaseDeclarativeTool<
  AgentInputs,
  ToolResult
> {
  static readonly Name = WATCHER_TOOL_NAME;

  constructor(
    private readonly context: AgentLoopContext,
    messageBus: MessageBus,
  ) {
    const definition = WatcherAgent(context.config);
    super(
      WATCHER_TOOL_NAME,
      WATCHER_DISPLAY_NAME,
      definition.description,
      Kind.Agent,
      definition.inputConfig.inputSchema,
      messageBus,
      /* isOutputMarkdown */ true,
      /* canUpdateOutput */ true,
    );
  }

  protected createInvocation(
    params: AgentInputs,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ): ToolInvocation<AgentInputs, ToolResult> {
    const definition = WatcherAgent(this.context.config);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-type-assertion
    return new LocalSubagentInvocation(
      definition as any,
      this.context,
      params,
      messageBus,
      _toolName,
      _toolDisplayName,
    ) as any;
  }
}
