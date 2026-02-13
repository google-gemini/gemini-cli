/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  type ToolResult,
  type ToolInvocation,
} from './tools.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import type { Config } from '../config/config.js';
import {
  CONFIGURE_DEEP_WORK_RUN_TOOL_NAME,
  START_DEEP_WORK_RUN_TOOL_NAME,
  STOP_DEEP_WORK_RUN_TOOL_NAME,
  VALIDATE_DEEP_WORK_READINESS_TOOL_NAME,
} from './tool-names.js';
import {
  loadDeepWorkState,
  loadOrCreateDeepWorkState,
  saveDeepWorkState,
  upsertQuestions,
  evaluateDeepWorkReadinessHeuristic,
  inferDeepWorkStatusFromReadiness,
  type DeepWorkQuestion,
  type DeepWorkReadinessReport,
  type DeepWorkState,
} from '../services/deepWorkState.js';
import { ToolErrorType } from './tool-error.js';
import { LocalAgentExecutor } from '../agents/local-executor.js';

export interface DeepWorkQuestionInput {
  id: string;
  question: string;
  required?: boolean;
  answer?: string;
  done?: boolean;
}

export interface ConfigureDeepWorkRunParams {
  prompt?: string;
  max_runs?: number;
  max_time_minutes?: number;
  completion_promise?: string;
  required_questions?: DeepWorkQuestionInput[];
}

export interface ValidateDeepWorkReadinessParams {
  use_subagent?: boolean;
}

export interface StartDeepWorkRunParams {
  resume?: boolean;
}

export interface StopDeepWorkRunParams {
  mode?: 'stop' | 'pause' | 'completed';
  reason?: string;
}

function createSuccessResult(
  llmContent: string,
  returnDisplay: string,
  data?: Record<string, unknown>,
): ToolResult {
  return {
    llmContent,
    returnDisplay,
    data,
  };
}

function createErrorResult(message: string, type: ToolErrorType): ToolResult {
  return {
    llmContent: message,
    returnDisplay: message,
    error: {
      message,
      type,
    },
  };
}

function summarizeState(state: DeepWorkState): Record<string, unknown> {
  return {
    runId: state.runId,
    status: state.status,
    prompt: state.prompt,
    approvedPlanPath: state.approvedPlanPath,
    maxRuns: state.maxRuns,
    maxTimeMinutes: state.maxTimeMinutes,
    completionPromise: state.completionPromise,
    iteration: state.iteration,
    requiredQuestionCount: state.requiredQuestions.length,
    answeredRequiredQuestionCount: state.requiredQuestions.filter(
      (q) => q.required && q.answer.trim().length > 0,
    ).length,
    readinessVerdict: state.readinessReport?.verdict,
  };
}

function syncApprovedPlanPath(config: Config, state: DeepWorkState): void {
  const configPath = config.getApprovedPlanPath()?.trim();
  const statePath = state.approvedPlanPath?.trim();

  if (configPath) {
    if (statePath !== configPath) {
      state.approvedPlanPath = configPath;
    }
    return;
  }

  if (statePath) {
    config.setApprovedPlanPath(statePath);
  }
}

function mergeQuestionsForState(
  state: DeepWorkState,
  questions: DeepWorkQuestionInput[],
): DeepWorkState {
  const mapped: Array<Partial<DeepWorkQuestion>> = questions.map(
    (q, index) => ({
      id: q.id || `question-${index + 1}`,
      question: q.question,
      required: q.required ?? true,
      answer: q.answer ?? '',
      done: q.done ?? false,
    }),
  );
  return upsertQuestions(state, mapped);
}

function isDeepWorkReadinessReport(
  value: unknown,
): value is DeepWorkReadinessReport {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const report = value as Partial<DeepWorkReadinessReport>;
  if (
    report.verdict !== 'ready' &&
    report.verdict !== 'needs_answers' &&
    report.verdict !== 'reject'
  ) {
    return false;
  }

  return (
    Array.isArray(report.missingRequiredQuestionIds) &&
    Array.isArray(report.followUpQuestions) &&
    Array.isArray(report.blockingReasons) &&
    typeof report.singleShotRecommendation === 'boolean'
  );
}

class ConfigureDeepWorkRunInvocation extends BaseToolInvocation<
  ConfigureDeepWorkRunParams,
  ToolResult
> {
  constructor(
    params: ConfigureDeepWorkRunParams,
    private readonly config: Config,
    messageBus: MessageBus,
    toolName: string,
    displayName: string,
  ) {
    super(params, messageBus, toolName, displayName);
  }

  getDescription(): string {
    return 'Configure Deep Work run state';
  }

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    const state = await loadOrCreateDeepWorkState(this.config);
    syncApprovedPlanPath(this.config, state);

    if (this.params.prompt !== undefined) {
      state.prompt = this.params.prompt.trim();
    }
    if (this.params.max_runs !== undefined) {
      state.maxRuns = Math.floor(this.params.max_runs);
    }
    if (this.params.max_time_minutes !== undefined) {
      state.maxTimeMinutes = Math.floor(this.params.max_time_minutes);
    }
    if (this.params.completion_promise !== undefined) {
      const promiseText = this.params.completion_promise.trim();
      state.completionPromise = promiseText.length > 0 ? promiseText : null;
    }
    if (this.params.required_questions !== undefined) {
      const merged = mergeQuestionsForState(
        state,
        this.params.required_questions,
      );
      state.requiredQuestions = merged.requiredQuestions;
    }

    state.rejectionReason = null;
    state.readinessReport = null;
    state.status = 'configured';

    await saveDeepWorkState(this.config, state);

    return createSuccessResult(
      JSON.stringify({ state: summarizeState(state) }),
      `Deep Work configured. Status: ${state.status}.`,
      { state },
    );
  }
}

export class ConfigureDeepWorkRunTool extends BaseDeclarativeTool<
  ConfigureDeepWorkRunParams,
  ToolResult
> {
  static readonly Name = CONFIGURE_DEEP_WORK_RUN_TOOL_NAME;

  constructor(
    private readonly config: Config,
    messageBus: MessageBus,
  ) {
    super(
      ConfigureDeepWorkRunTool.Name,
      'ConfigureDeepWorkRun',
      'Configure Deep Work requirements, run limits, and required questions.',
      Kind.Think,
      {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description: 'Primary task prompt for the Deep Work run.',
          },
          max_runs: {
            type: 'number',
            description: 'Maximum number of Deep Work iterations.',
          },
          max_time_minutes: {
            type: 'number',
            description: 'Maximum duration for the run in minutes.',
          },
          completion_promise: {
            type: 'string',
            description:
              'Optional token that, when produced, can mark the run complete.',
          },
          required_questions: {
            type: 'array',
            description:
              'Required/optional gating questions and current answer status.',
            items: {
              type: 'object',
              required: ['id', 'question'],
              properties: {
                id: { type: 'string' },
                question: { type: 'string' },
                required: { type: 'boolean' },
                answer: { type: 'string' },
                done: { type: 'boolean' },
              },
            },
          },
        },
      },
      messageBus,
    );
  }

  protected override validateToolParamValues(
    params: ConfigureDeepWorkRunParams,
  ): string | null {
    if (
      params.prompt === undefined &&
      params.max_runs === undefined &&
      params.max_time_minutes === undefined &&
      params.completion_promise === undefined &&
      params.required_questions === undefined
    ) {
      return 'At least one Deep Work configuration field must be provided.';
    }

    if (params.max_runs !== undefined && params.max_runs <= 0) {
      return '`max_runs` must be greater than 0.';
    }

    if (params.max_time_minutes !== undefined && params.max_time_minutes <= 0) {
      return '`max_time_minutes` must be greater than 0.';
    }

    if (params.required_questions) {
      for (const question of params.required_questions) {
        if (!question.id?.trim()) {
          return 'Each required question must include a non-empty `id`.';
        }
        if (!question.question?.trim()) {
          return 'Each required question must include non-empty `question` text.';
        }
      }
    }

    return null;
  }

  protected createInvocation(
    params: ConfigureDeepWorkRunParams,
    messageBus: MessageBus,
    toolName: string,
    displayName: string,
  ): ToolInvocation<ConfigureDeepWorkRunParams, ToolResult> {
    return new ConfigureDeepWorkRunInvocation(
      params,
      this.config,
      messageBus,
      toolName,
      displayName,
    );
  }
}

async function runReadinessWithSubagent(
  config: Config,
  state: DeepWorkState,
  signal: AbortSignal,
): Promise<DeepWorkReadinessReport | undefined> {
  const definition = config
    .getAgentRegistry()
    .getDefinition('deep_work_readiness');

  if (!definition || definition.kind !== 'local') {
    return undefined;
  }

  const executor = await LocalAgentExecutor.create(definition, config);
  const output = await executor.run(
    {
      prompt: state.prompt,
      approved_plan_path: state.approvedPlanPath,
      max_runs: state.maxRuns,
      max_time_minutes: state.maxTimeMinutes,
      completion_promise: state.completionPromise,
      questions: state.requiredQuestions,
    },
    signal,
  );

  try {
    const parsed: unknown = JSON.parse(output.result);
    if (isDeepWorkReadinessReport(parsed)) {
      return {
        ...parsed,
        reviewer: 'subagent',
      };
    }
  } catch {
    return undefined;
  }

  return undefined;
}

class ValidateDeepWorkReadinessInvocation extends BaseToolInvocation<
  ValidateDeepWorkReadinessParams,
  ToolResult
> {
  constructor(
    params: ValidateDeepWorkReadinessParams,
    private readonly config: Config,
    messageBus: MessageBus,
    toolName: string,
    displayName: string,
  ) {
    super(params, messageBus, toolName, displayName);
  }

  getDescription(): string {
    return 'Validate Deep Work readiness requirements';
  }

  async execute(signal: AbortSignal): Promise<ToolResult> {
    const state = await loadDeepWorkState(this.config);
    if (!state) {
      return createErrorResult(
        'No Deep Work run found. Configure it first.',
        ToolErrorType.INVALID_TOOL_PARAMS,
      );
    }
    syncApprovedPlanPath(this.config, state);

    let report: DeepWorkReadinessReport | undefined;
    const useSubagent = this.params.use_subagent ?? true;

    if (useSubagent) {
      try {
        report = await runReadinessWithSubagent(this.config, state, signal);
      } catch {
        report = undefined;
      }
    }

    if (!report) {
      report = evaluateDeepWorkReadinessHeuristic(state);
    }

    state.readinessReport = report;
    state.status = inferDeepWorkStatusFromReadiness(state);
    state.rejectionReason =
      report.verdict === 'reject'
        ? report.blockingReasons.join(' ')
        : state.rejectionReason;

    await saveDeepWorkState(this.config, state);

    return createSuccessResult(
      JSON.stringify({ readiness: report, state: summarizeState(state) }),
      `Deep Work readiness: ${report.verdict}.`,
      { readiness: report, state },
    );
  }
}

export class ValidateDeepWorkReadinessTool extends BaseDeclarativeTool<
  ValidateDeepWorkReadinessParams,
  ToolResult
> {
  static readonly Name = VALIDATE_DEEP_WORK_READINESS_TOOL_NAME;

  constructor(
    private readonly config: Config,
    messageBus: MessageBus,
  ) {
    super(
      ValidateDeepWorkReadinessTool.Name,
      'ValidateDeepWorkReadiness',
      'Evaluate whether Deep Work requirements are satisfied. Uses a readiness subagent when available and falls back to heuristics.',
      Kind.Think,
      {
        type: 'object',
        properties: {
          use_subagent: {
            type: 'boolean',
            description:
              'Whether to run the deep_work_readiness subagent before heuristic fallback.',
          },
        },
      },
      messageBus,
    );
  }

  protected createInvocation(
    params: ValidateDeepWorkReadinessParams,
    messageBus: MessageBus,
    toolName: string,
    displayName: string,
  ): ToolInvocation<ValidateDeepWorkReadinessParams, ToolResult> {
    return new ValidateDeepWorkReadinessInvocation(
      params,
      this.config,
      messageBus,
      toolName,
      displayName,
    );
  }
}

class StartDeepWorkRunInvocation extends BaseToolInvocation<
  StartDeepWorkRunParams,
  ToolResult
> {
  constructor(
    params: StartDeepWorkRunParams,
    private readonly config: Config,
    messageBus: MessageBus,
    toolName: string,
    displayName: string,
  ) {
    super(params, messageBus, toolName, displayName);
  }

  getDescription(): string {
    return 'Start Deep Work run';
  }

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    const state = await loadDeepWorkState(this.config);
    if (!state) {
      return createErrorResult(
        'No Deep Work run found. Configure and validate it first.',
        ToolErrorType.INVALID_TOOL_PARAMS,
      );
    }
    syncApprovedPlanPath(this.config, state);

    if (state.status === 'running') {
      return createSuccessResult(
        JSON.stringify({ state: summarizeState(state) }),
        'Deep Work run is already active.',
        { state },
      );
    }

    if (!state.readinessReport || state.readinessReport.verdict !== 'ready') {
      return createErrorResult(
        'Deep Work run is not ready. Run validate_deep_work_readiness and resolve blockers first.',
        ToolErrorType.INVALID_TOOL_PARAMS,
      );
    }

    state.status = 'running';
    state.startedAt = state.startedAt ?? new Date().toISOString();
    state.iteration += 1;

    await saveDeepWorkState(this.config, state);
    const planContext = state.approvedPlanPath
      ? ` Plan context: ${state.approvedPlanPath}.`
      : '';

    return createSuccessResult(
      JSON.stringify({ state: summarizeState(state) }),
      `Deep Work started (iteration ${state.iteration}).${planContext}`,
      { state },
    );
  }
}

export class StartDeepWorkRunTool extends BaseDeclarativeTool<
  StartDeepWorkRunParams,
  ToolResult
> {
  static readonly Name = START_DEEP_WORK_RUN_TOOL_NAME;

  constructor(
    private readonly config: Config,
    messageBus: MessageBus,
  ) {
    super(
      StartDeepWorkRunTool.Name,
      'StartDeepWorkRun',
      'Start or resume a Deep Work execution run after readiness has passed.',
      Kind.Other,
      {
        type: 'object',
        properties: {
          resume: {
            type: 'boolean',
            description: 'Marks this as an explicit resume request.',
          },
        },
      },
      messageBus,
    );
  }

  protected createInvocation(
    params: StartDeepWorkRunParams,
    messageBus: MessageBus,
    toolName: string,
    displayName: string,
  ): ToolInvocation<StartDeepWorkRunParams, ToolResult> {
    return new StartDeepWorkRunInvocation(
      params,
      this.config,
      messageBus,
      toolName,
      displayName,
    );
  }
}

class StopDeepWorkRunInvocation extends BaseToolInvocation<
  StopDeepWorkRunParams,
  ToolResult
> {
  constructor(
    params: StopDeepWorkRunParams,
    private readonly config: Config,
    messageBus: MessageBus,
    toolName: string,
    displayName: string,
  ) {
    super(params, messageBus, toolName, displayName);
  }

  getDescription(): string {
    return 'Stop or pause Deep Work run';
  }

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    const state = await loadDeepWorkState(this.config);
    if (!state) {
      return createErrorResult(
        'No Deep Work run found to stop.',
        ToolErrorType.INVALID_TOOL_PARAMS,
      );
    }

    syncApprovedPlanPath(this.config, state);

    const mode = this.params.mode ?? 'stop';
    switch (mode) {
      case 'pause':
        state.status = 'paused';
        break;
      case 'completed':
        state.status = 'completed';
        break;
      case 'stop':
      default:
        state.status = 'stopped';
        break;
    }

    if (this.params.reason?.trim()) {
      state.rejectionReason = this.params.reason.trim();
    }

    await saveDeepWorkState(this.config, state);

    return createSuccessResult(
      JSON.stringify({ state: summarizeState(state) }),
      `Deep Work status set to ${state.status}.`,
      { state },
    );
  }
}

export class StopDeepWorkRunTool extends BaseDeclarativeTool<
  StopDeepWorkRunParams,
  ToolResult
> {
  static readonly Name = STOP_DEEP_WORK_RUN_TOOL_NAME;

  constructor(
    private readonly config: Config,
    messageBus: MessageBus,
  ) {
    super(
      StopDeepWorkRunTool.Name,
      'StopDeepWorkRun',
      'Stop, pause, or mark completion for the current Deep Work run.',
      Kind.Other,
      {
        type: 'object',
        properties: {
          mode: {
            type: 'string',
            enum: ['stop', 'pause', 'completed'],
          },
          reason: {
            type: 'string',
            description: 'Optional reason for pausing/stopping the run.',
          },
        },
      },
      messageBus,
    );
  }

  protected createInvocation(
    params: StopDeepWorkRunParams,
    messageBus: MessageBus,
    toolName: string,
    displayName: string,
  ): ToolInvocation<StopDeepWorkRunParams, ToolResult> {
    return new StopDeepWorkRunInvocation(
      params,
      this.config,
      messageBus,
      toolName,
      displayName,
    );
  }
}
