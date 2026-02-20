/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  type ToolResult,
  Kind,
  type ToolInfoConfirmationDetails,
  ToolConfirmationOutcome,
} from './tools.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import type { Config } from '../config/config.js';
import { ENTER_PLAN_MODE_TOOL_NAME } from './tool-names.js';
import { ApprovalMode } from '../policy/types.js';
import { ENTER_PLAN_MODE_DEFINITION } from './definitions/coreTools.js';
import { resolveToolDeclaration } from './definitions/resolver.js';

export interface EnterPlanModeParams {
  reason?: string;
}

export class EnterPlanModeTool extends BaseDeclarativeTool<
  EnterPlanModeParams,
  ToolResult
> {
  constructor(
    private config: Config,
    messageBus: MessageBus,
  ) {
    super(
      ENTER_PLAN_MODE_TOOL_NAME,
      'Enter Plan Mode',
      ENTER_PLAN_MODE_DEFINITION.base.description!,
      Kind.Plan,
      ENTER_PLAN_MODE_DEFINITION.base.parametersJsonSchema,
      messageBus,
    );
  }

  protected createInvocation(
    params: EnterPlanModeParams,
    messageBus: MessageBus,
    toolName: string,
    toolDisplayName: string,
  ): EnterPlanModeInvocation {
    return new EnterPlanModeInvocation(
      params,
      messageBus,
      toolName,
      toolDisplayName,
      this.config,
    );
  }

  override getSchema(modelId?: string) {
    return resolveToolDeclaration(ENTER_PLAN_MODE_DEFINITION, modelId);
  }
}

export class EnterPlanModeInvocation extends BaseToolInvocation<
  EnterPlanModeParams,
  ToolResult
> {
  private confirmationOutcome: ToolConfirmationOutcome | null = null;

  constructor(
    params: EnterPlanModeParams,
    messageBus: MessageBus,
    toolName: string,
    toolDisplayName: string,
    private config: Config,
  ) {
    super(params, messageBus, toolName, toolDisplayName);
  }

  getDescription(): string {
    return this.params.reason || 'Initiating Plan Mode';
  }

  override async shouldConfirmExecute(
    abortSignal: AbortSignal,
  ): Promise<ToolInfoConfirmationDetails | false> {
    const decision = await this.getMessageBusDecision(abortSignal);
    if (decision === 'ALLOW') {
      return false;
    }

    if (decision === 'DENY') {
      throw new Error(
        `Tool execution for "${
          this._toolDisplayName || this._toolName
        }" denied by policy.`,
      );
    }

    // ASK_USER
    return {
      type: 'info',
      title: 'Enter Plan Mode',
      prompt:
        'This will restrict the agent to read-only tools to allow for safe planning.',
      onConfirm: async (outcome: ToolConfirmationOutcome) => {
        this.confirmationOutcome = outcome;
        // Policy updates are now handled centrally by the scheduler
      },
    };
  }

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    if (this.confirmationOutcome === ToolConfirmationOutcome.Cancel) {
      return {
        llmContent: 'User cancelled entering Plan Mode.',
        returnDisplay: 'Cancelled',
      };
    }

    this.config.setApprovalMode(ApprovalMode.PLAN);

    return {
      llmContent: 'Switching to Plan mode.',
      returnDisplay: this.params.reason
        ? `Switching to Plan mode: ${this.params.reason}`
        : 'Switching to Plan mode',
    };
  }
}
