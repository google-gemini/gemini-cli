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
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Config } from '../config/config.js';
import { EXIT_PLAN_MODE_TOOL_NAME } from './tool-names.js';
import { validatePlanPath, validatePlanContent } from '../utils/planUtils.js';
import { ApprovalMode } from '../policy/types.js';
import { checkExhaustive } from '../utils/checks.js';
import { resolveToRealPath, isSubpath } from '../utils/paths.js';
import { logPlanExecution } from '../telemetry/loggers.js';
import { PlanExecutionEvent } from '../telemetry/types.js';

/**
 * Returns a human-readable description for an approval mode.
 */
function getApprovalModeDescription(mode: ApprovalMode): string {
  switch (mode) {
    case ApprovalMode.AUTO_EDIT:
      return 'Auto-Edit mode (edits will be applied automatically)';
    case ApprovalMode.DEEP_WORK:
      return 'Deep Work mode (iterative execution with readiness checks)';
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

interface PlanExecutionRecommendation {
  approvalMode: ApprovalMode;
  reason: string;
}

const DEEP_WORK_SIGNALS = [
  'iterate',
  'iteration',
  'loop',
  'phases',
  'phase',
  'refactor',
  'migrate',
  'end-to-end',
  'e2e',
  'comprehensive',
  'cross-cutting',
  'multi-step',
  'verification',
  'test suite',
];

function recommendExecutionModeFromPlan(
  planContent: string,
  deepWorkEnabled: boolean,
): PlanExecutionRecommendation {
  const normalized = planContent.toLowerCase();
  const implementationStepMatches = normalized.match(/^\s*\d+\.\s+/gm) ?? [];
  const implementationStepCount = implementationStepMatches.length;
  const signalCount = DEEP_WORK_SIGNALS.filter((signal) =>
    normalized.includes(signal),
  ).length;

  if (
    deepWorkEnabled &&
    (implementationStepCount >= 6 ||
      (implementationStepCount >= 4 && signalCount >= 2) ||
      signalCount >= 4)
  ) {
    return {
      approvalMode: ApprovalMode.DEEP_WORK,
      reason:
        'Plan looks iterative and complex, so Deep Work is recommended for controlled multi-run execution.',
    };
  }

  return {
    approvalMode: ApprovalMode.AUTO_EDIT,
    reason: 'Plan appears straightforward enough for regular execution.',
  };
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
    const plansDir = config.storage.getProjectTempPlansDir();
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
            description: `The file path to the finalized plan (e.g., "${plansDir}/feature-x.md"). This path MUST be within the designated plans directory: ${plansDir}/`,
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

    // Since validateToolParamValues is synchronous, we use a basic synchronous check
    // for path traversal safety. High-level async validation is deferred to shouldConfirmExecute.
    const plansDir = resolveToRealPath(
      this.config.storage.getProjectTempPlansDir(),
    );
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
}

export class ExitPlanModeInvocation extends BaseToolInvocation<
  ExitPlanModeParams,
  ToolResult
> {
  private confirmationOutcome: ToolConfirmationOutcome | null = null;
  private approvalPayload: ToolExitPlanModeConfirmationPayload | null = null;
  private planValidationError: string | null = null;
  private recommendation: PlanExecutionRecommendation = {
    approvalMode: ApprovalMode.AUTO_EDIT,
    reason: 'Plan appears straightforward enough for regular execution.',
  };

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
      this.config.storage.getProjectTempPlansDir(),
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
    let planContent: string;
    try {
      planContent = await fs.readFile(resolvedPlanPath, 'utf-8');
    } catch (error) {
      this.planValidationError = `Unable to read plan file: ${String(error)}`;
      return false;
    }
    this.recommendation = recommendExecutionModeFromPlan(
      planContent,
      this.config.isDeepWorkEnabled?.() ?? false,
    );

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
        approvalMode: this.recommendation.approvalMode,
      };
      return false;
    }

    // decision is 'ASK_USER'
    return {
      type: 'exit_plan_mode',
      title: 'Plan Approval',
      planPath: resolvedPlanPath,
      recommendedApprovalMode: this.recommendation.approvalMode,
      recommendationReason: this.recommendation.reason,
      deepWorkEnabled: this.config.isDeepWorkEnabled?.() ?? false,
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
