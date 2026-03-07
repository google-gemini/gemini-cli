/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  type ToolInvocation,
  type ToolResult,
} from './tools.js';
import {
  CHECKPOINT_STATE_TOOL_NAME,
  CHECKPOINT_STATE_PARAM_SUMMARY,
} from './tool-names.js';
import { CHECKPOINT_STATE_DEFINITION } from './definitions/coreTools.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import type { Config } from '../config/config.js';

interface CheckpointStateParams {
  [CHECKPOINT_STATE_PARAM_SUMMARY]: string;
}

class CheckpointStateInvocation extends BaseToolInvocation<
  CheckpointStateParams,
  ToolResult
> {
  constructor(
    params: CheckpointStateParams,
    messageBus: MessageBus,
    toolName: string,
    toolDisplayName: string,
    private readonly config: Config,
  ) {
    super(params, messageBus, toolName, toolDisplayName);
  }

  override getDescription(): string {
    return 'Parks the current state of the conversation with a high-fidelity summary.';
  }

  override async execute(): Promise<ToolResult> {
    const summary = this.params[CHECKPOINT_STATE_PARAM_SUMMARY];
    const chat = this.config.getGeminiClient().getChat();
    const previousSummary = chat.getContinuityAnchor();

    // Atomically update the chat session's continuity anchor via side-effect.
    // This anchor will be used as a "hard hand-off" during the next compression event.
    this.config.getSideEffectService().setContinuityAnchor(summary);

    const llmContent = previousSummary
        ? 'Previous checkpoint summary replaced. Use the `previous_summary` in the result data for reconciliation if needed.'
        : 'First checkpoint created. No previous summary found.';
    return {
      llmContent,
      returnDisplay: '',
      data: {
        previous_summary: previousSummary || null,
      },
    };
  }
}

/**
 * A tool that allows the agent to "park" a thread with a high-fidelity summary.
 */
export class CheckpointStateTool extends BaseDeclarativeTool<
  CheckpointStateParams,
  ToolResult
> {
  static readonly Name = CHECKPOINT_STATE_TOOL_NAME;

  constructor(
    private readonly config: Config,
    messageBus: MessageBus,
  ) {
    super(
      CHECKPOINT_STATE_TOOL_NAME,
      'CheckpointState',
      CHECKPOINT_STATE_DEFINITION.base.description ?? '',
      Kind.Think,
      CHECKPOINT_STATE_DEFINITION.base.parametersJsonSchema,
      messageBus,
    );
  }

  override createInvocation(
    params: CheckpointStateParams,
  ): ToolInvocation<CheckpointStateParams, ToolResult> {
    return new CheckpointStateInvocation(
      params,
      this.messageBus,
      this.name,
      this.displayName,
      this.config,
    );
  }
}
