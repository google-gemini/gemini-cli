/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  ToolConfirmationOutcome,
  type ToolConfirmationPayload,
  type ToolExitPlanModeConfirmationDetails,
  type ToolExitPlanModeConfirmationPayload,
  type ToolResult,
} from './tools.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import path from 'node:path';
import type { Config } from '../config/config.js';
import { EXIT_PLAN_MODE_TOOL_NAME } from './tool-names.js';
import { validatePlanPath, validatePlanContent } from '../utils/planUtils.js';
import { ApprovalMode } from '../policy/types.js';
import { resolveToRealPath, isSubpath } from '../utils/paths.js';
import { logPlanExecution } from '../telemetry/loggers.js';
import { PlanExecutionEvent } from '../telemetry/types.js';
import { getExitPlanModeDefinition } from './definitions/coreTools.js';
import { resolveToolDeclaration } from './definitions/resolver.js';
import { getPlanModeExitMessage } from '../utils/approvalModeUtils.js';

export interface ExitPlanModeParams {
  plan_filename: string;
}

export class ExitPlanModeTool extends BaseDeclarativeTool<
  ExitPlanModeParams,
  ToolResult
> {
  static readonly Name = EXIT_PLAN_MODE_TOOL_NAME;

  constructor(
    private config: Config,
    messageBus: MessageBus,
  ) {
    const definition = getExitPlanModeDefinition();
    super(
      ExitPlanModeTool.Name,
      'Exit Plan Mode',
      definition.base.description!,
      Kind.Plan,
      definition.base.parametersJsonSchema,
      messageBus,
    );
  }

  protected override validateToolParamValues(
    params: ExitPlanModeParams,
  ): string | null {
    if (!params.plan_filename || params.plan_filename.trim() === '') {
      return 'plan_filename is required.';
    }

    const safeFilename = path.basename(params.plan_filename);
    const plansDir = resolveToRealPath(this.config.storage.getPlansDir());
    const resolvedPath = path.join(
      this.config.storage.getPlansDir(),
      safeFilename,
    );

    const realPath = resolveToRealPath(resolvedPath);

    if (!isSubpath(plansDir, realPath)) {
      return `Access denied: plan path (${resolvedPath}) must be within the designated plans directory (${plansDir}).`;
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

  override getSchema(modelId?: string) {
    return resolveToolDeclaration(getExitPlanModeDefinition(), modelId);
  }
}

export class ExitPlanModeInvocation extends BaseToolInvocation<
  ExitPlanModeParams,
  ToolResult
> {
  private confirmationOutcome: ToolConfirmationOutcome | null = null;
  private approvalPayload: ToolExitPlanModeConfirmationPayload | null = null;
  private planValidationError: string | null = null;

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
    abortSignal: AbortSignal,
  ): Promise<ToolExitPlanModeConfirmationDetails | false> {
    const resolvedPlanPath = this.getResolvedPlanPath();

    const pathError = await validatePlanPath(
      this.params.plan_filename,
      this.config.storage.getPlansDir(),
    );
    if (pathError) {
      this.planValidationError = pathError;
      return false;
    }

    const contentError = await validatePlanContent(resolvedPlanPath);
    if (contentError) {
      this.planValidationError = contentError;
      return false;
    }

    const decision = await this.getMessageBusDecision(abortSignal);
    if (decision === 'deny') {
      throw new Error(
        `Tool execution for "${
          this._toolDisplayName || this._toolName
        }" denied by policy.`,
      );
    }

    if (decision === 'allow') {
      // If policy is allow, auto-approve with default settings and execute.
      this.confirmationOutcome = ToolConfirmationOutcome.ProceedOnce;
      this.approvalPayload = {
        approved: true,
        approvalMode: this.getAllowApprovalMode(),
      };
      return false;
    }

    // decision is 'ask_user'
    return {
      type: 'exit_plan_mode',
      title: 'Plan Approval',
      planPath: resolvedPlanPath,
      onConfirm: async (
        outcome: ToolConfirmationOutcome,
        payload?: ToolConfirmationPayload,
      ) => {
        this.confirmationOutcome = outcome;
        if (payload && 'approved' in payload) {
          this.approvalPayload = payload;
        }
      },
    };
  }

  getDescription(): string {
    return `Requesting plan approval for: ${path.join(this.config.storage.getPlansDir(), this.params.plan_filename)}`;
  }

  /**
   * Returns the resolved plan path.
   * Note: Validation is done in validateToolParamValues, so this assumes the path is valid.
   */
  private getResolvedPlanPath(): string {
    const safeFilename = path.basename(this.params.plan_filename);
    return path.join(this.config.storage.getPlansDir(), safeFilename);
  }

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    const resolvedPlanPath = this.getResolvedPlanPath();

    if (this.planValidationError) {
      return {
        llmContent: this.planValidationError,
        returnDisplay: 'Error: Invalid plan',
      };
    }

    if (this.confirmationOutcome === ToolConfirmationOutcome.Cancel) {
      return {
        llmContent:
          'User cancelled the plan approval dialog. The plan was not approved and you are still in Plan Mode.',
        returnDisplay: 'Cancelled',
      };
    }

    // When a user policy grants `allow` for exit_plan_mode, the scheduler
    // skips the confirmation phase entirely and shouldConfirmExecute is never
    // called, leaving approvalPayload null.
    const payload = this.approvalPayload ?? {
      approved: true,
      approvalMode: this.getAllowApprovalMode(),
    };
    if (payload.approved) {
      const newMode = payload.approvalMode ?? ApprovalMode.DEFAULT;

      if (newMode === ApprovalMode.PLAN) {
        throw new Error(`Unexpected approval mode: ${newMode}`);
      }

      this.config.setApprovalMode(newMode);
      this.config.setApprovedPlanPath(resolvedPlanPath);

      logPlanExecution(this.config, new PlanExecutionEvent(newMode));

      const exitMessage = getPlanModeExitMessage(newMode);

      return {
        llmContent: `${exitMessage}

The approved implementation plan is stored at: ${resolvedPlanPath}
Read and follow the plan strictly during implementation.`,
        returnDisplay: `Plan approved: ${resolvedPlanPath}`,
      };
    } else {
      const feedback = payload?.feedback?.trim();
      if (feedback) {
        return {
          llmContent: `Plan rejected. User feedback: ${feedback}

The plan is stored at: ${resolvedPlanPath}
Revise the plan based on the feedback.`,
          returnDisplay: `Feedback: ${feedback}`,
        };
      } else {
        return {
          llmContent: `Plan rejected. No feedback provided.

The plan is stored at: ${resolvedPlanPath}
Ask the user for specific feedback on how to improve the plan.`,
          returnDisplay: 'Rejected (no feedback)',
        };
      }
    }
  }

  /**
   * Determines the approval mode to switch to when plan mode is exited via a policy ALLOW.
   * In non-interactive environments, this defaults to YOLO to allow automated execution.
   */
  private getAllowApprovalMode(): ApprovalMode {
    if (!this.config.isInteractive()) {
      // For non-interactive environment requires minimal user action, exit as YOLO mode for plan implementation.
      return ApprovalMode.YOLO;
    }
    // By default, YOLO mode in interactive environment cannot enter/exit plan mode.
    // Always exit plan mode and move to default approval mode if exit_plan_mode tool is configured with allow decision.
    return ApprovalMode.DEFAULT;
  }
}
