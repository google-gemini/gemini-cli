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
  type ToolCallConfirmationDetails,
} from './tools.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import {
  MessageBusType,
  type PlanApprovalRequest,
  type PlanApprovalResponse,
} from '../confirmation-bus/types.js';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { Config } from '../config/config.js';
import { EXIT_PLAN_MODE_TOOL_NAME } from './tool-names.js';
import { isWithinRoot } from '../utils/fileUtils.js';

export interface ExitPlanModeParams {
  plan_path: string;
}

export class ExitPlanModeTool extends BaseDeclarativeTool<
  ExitPlanModeParams,
  ToolResult
> {
  constructor(
    private config: Config,
    messageBus: MessageBus,
  ) {
    super(
      EXIT_PLAN_MODE_TOOL_NAME,
      'Exit Plan Mode',
      'Signals that the planning phase is complete and requests user approval to start implementation.',
      Kind.Plan,
      {
        type: 'object',
        required: ['plan_path'],
        properties: {
          plan_path: {
            type: 'string',
            description:
              'The file path to the finalized plan (e.g., "plans/feature-x.md").',
          },
        },
      },
      messageBus,
    );
  }

  protected override validateToolParamValues(
    params: ExitPlanModeParams,
  ): string | null {
    if (!params.plan_path || params.plan_path.trim() === '') {
      return 'plan_path is required.';
    }

    const resolvedPath = path.resolve(
      this.config.getTargetDir(),
      params.plan_path,
    );

    const plansDir = this.config.storage.getProjectTempPlansDir();
    if (!isWithinRoot(resolvedPath, plansDir)) {
      return `Access denied: plan path must be within the designated plans directory (${plansDir}).`;
    }

    return null;
  }

  protected createInvocation(
    params: ExitPlanModeParams,
    messageBus: MessageBus,
    toolName: string,
    toolDisplayName: string,
  ): ExitPlanModeInvocation {
    return new ExitPlanModeInvocation(
      params,
      messageBus,
      toolName,
      toolDisplayName,
      this.config,
    );
  }
}

export class ExitPlanModeInvocation extends BaseToolInvocation<
  ExitPlanModeParams,
  ToolResult
> {
  constructor(
    params: ExitPlanModeParams,
    messageBus: MessageBus,
    toolName: string,
    toolDisplayName: string,
    private config: Config,
  ) {
    super(params, messageBus, toolName, toolDisplayName);
  }

  override async shouldConfirmExecute(
    _abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    return false;
  }

  getDescription(): string {
    return `Requesting plan approval for: ${this.params.plan_path}`;
  }

  /**
   * Returns the resolved plan path if valid, or null if outside the plans directory.
   */
  private getValidatedPlanPath(): string | null {
    const plansDir = this.config.storage.getProjectTempPlansDir();
    const resolvedPath = path.resolve(
      this.config.getTargetDir(),
      this.params.plan_path,
    );
    return isWithinRoot(resolvedPath, plansDir) ? resolvedPath : null;
  }

  async execute(signal: AbortSignal): Promise<ToolResult> {
    const correlationId = randomUUID();

    const resolvedPlanPath = this.getValidatedPlanPath();
    if (!resolvedPlanPath) {
      return {
        llmContent:
          'Error: Plan path is outside the designated plans directory.',
        returnDisplay:
          'Error: Plan path is outside the designated plans directory.',
      };
    }

    const request: PlanApprovalRequest = {
      type: MessageBusType.PLAN_APPROVAL_REQUEST,
      planPath: resolvedPlanPath,
      correlationId,
    };

    return new Promise<ToolResult>((resolve, reject) => {
      const responseHandler = async (
        response: PlanApprovalResponse,
      ): Promise<void> => {
        if (response.correlationId === correlationId) {
          cleanup();

          const resolvedPath = this.getValidatedPlanPath();
          if (response.approved) {
            resolve({
              llmContent: `Plan approved. Switching to Default mode.

The approved implementation plan is stored at: ${resolvedPath}
Read and follow the plan strictly during implementation.`,
              returnDisplay: `Plan approved: ${resolvedPath}`,
            });
          } else {
            resolve({
              llmContent: `Plan rejected. Feedback: ${response.feedback || 'None'}

The plan is stored at: ${resolvedPath}
Revise the plan based on the feedback.`,
              returnDisplay: `Feedback: ${response.feedback || 'None'}`,
            });
          }
        }
      };

      const cleanup = () => {
        this.messageBus.unsubscribe(
          MessageBusType.PLAN_APPROVAL_RESPONSE,
          responseHandler,
        );
        signal.removeEventListener('abort', abortHandler);
      };

      const abortHandler = () => {
        cleanup();
        resolve({
          llmContent:
            'User cancelled the plan approval dialog. The plan was not approved and you are still in Plan Mode.',
          returnDisplay: 'Cancelled',
        });
      };

      if (signal.aborted) {
        abortHandler();
        return;
      }

      signal.addEventListener('abort', abortHandler);
      this.messageBus.subscribe(
        MessageBusType.PLAN_APPROVAL_RESPONSE,
        responseHandler,
      );

      this.messageBus.publish(request).catch((err) => {
        cleanup();
        reject(err);
      });
    });
  }
}
