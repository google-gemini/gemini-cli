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
  type ToolExitPlanModeConfirmationDetails,
  type ToolConfirmationPayload,
  type ToolExitPlanModeConfirmationPayload,
  ToolConfirmationOutcome,
} from './tools.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import path from 'node:path';
import type { Config } from '../config/config.js';
import { EXIT_PLAN_MODE_TOOL_NAME } from './tool-names.js';
import { validatePlanPath, validatePlanContent } from '../utils/planUtils.js';
import { ApprovalMode } from '../policy/types.js';
import { checkExhaustive } from '../utils/checks.js';
import { resolveToRealPath, isSubpath } from '../utils/paths.js';
import { logPlanExecution } from '../telemetry/loggers.js';
import { PlanExecutionEvent } from '../telemetry/types.js';
import { getExitPlanModeDefinition } from './definitions/coreTools.js';
import { resolveToolDeclaration } from './definitions/resolver.js';

/**
 * Returns a human-readable description for an approval mode.
 */
function getApprovalModeDescription(mode: ApprovalMode): string {
  switch (mode) {
    case ApprovalMode.AUTO_EDIT:
      return 'Auto-Edit mode (edits will be applied automatically)';
    case ApprovalMode.DEFAULT:
      return 'Default mode (edits will require confirmation)';
    case ApprovalMode.YOLO:
    case ApprovalMode.PLAN:
      // YOLO and PLAN are not valid modes to enter when exiting plan mode
      throw new Error(`Unexpected approval mode: ${mode}`);
    default:
      checkExhaustive(mode);
  }
}

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
    const plansDir = config.storage.getPlansDir();
    const definition = getExitPlanModeDefinition(plansDir);
    super(
      EXIT_PLAN_MODE_TOOL_NAME,
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
    if (!params.plan_path || params.plan_path.trim() === '') {
      return 'plan_path is required.';
    }

    // Since validateToolParamValues is synchronous, we use a basic synchronous check
    // for path traversal safety. High-level async validation is deferred to shouldConfirmExecute.
    const plansDir = resolveToRealPath(this.config.storage.getPlansDir());
    const resolvedPath = path.resolve(
      this.config.getTargetDir(),
      params.plan_path,
    );

    const realPath = resolveToRealPath(resolvedPath);

    if (!isSubpath(plansDir, realPath)) {
      return `Access denied: plan path must be within the designated plans directory.`;
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
    const plansDir = this.config.storage.getPlansDir();
    return resolveToolDeclaration(getExitPlanModeDefinition(plansDir), modelId);
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
      this.params.plan_path,
      this.config.storage.getPlansDir(),
      this.config.getTargetDir(),
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
    if (decision === 'DENY') {
      throw new Error(
        `Tool execution for "${
          this._toolDisplayName || this._toolName
        }" denied by policy.`,
      );
    }

    if (decision === 'ALLOW') {
      // If policy is allow, auto-approve with default settings and execute.
      this.confirmationOutcome = ToolConfirmationOutcome.ProceedOnce;
      this.approvalPayload = {
        approved: true,
        approvalMode: ApprovalMode.DEFAULT,
      };
      return false;
    }

    // decision is 'ASK_USER'
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
    return `Requesting plan approval for: ${this.params.plan_path}`;
  }

  /**
   * Returns the resolved plan path.
   * Note: Validation is done in validateToolParamValues, so this assumes the path is valid.
   */
  private getResolvedPlanPath(): string {
    return path.resolve(this.config.getTargetDir(), this.params.plan_path);
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

    const payload = this.approvalPayload;
    if (payload?.approved) {
      const newMode = payload.approvalMode ?? ApprovalMode.DEFAULT;
      this.config.setApprovalMode(newMode);
      this.config.setApprovedPlanPath(resolvedPlanPath);

      logPlanExecution(this.config, new PlanExecutionEvent(newMode));

      const description = getApprovalModeDescription(newMode);

      return {
        llmContent: `Plan approved. Switching to ${description}.

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
}
