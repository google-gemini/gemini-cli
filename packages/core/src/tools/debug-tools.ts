/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MessageBus } from '../confirmation-bus/message-bus.js';
import type { Config } from '../config/config.js';
import { getDebugSessionManager } from '../debug/session-store.js';
import {
  type DebugRuntime,
  type SourceBreakpoint,
  type EvaluateArguments,
  DEFAULT_DEBUG_PORTS,
} from '../debug/dap-types.js';
import {
  buildAnalysisPrompt,
  formatScopes,
  formatSessionSummary,
  formatStackTrace,
} from '../debug/debug-analyzer.js';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  type ToolInvocation,
  type ToolResult,
} from './tools.js';
import {
  DEBUG_ATTACH_TOOL_NAME,
  DEBUG_CONTINUE_TOOL_NAME,
  DEBUG_DISCONNECT_TOOL_NAME,
  DEBUG_EVALUATE_TOOL_NAME,
  DEBUG_LAUNCH_TOOL_NAME,
  DEBUG_SET_BREAKPOINT_TOOL_NAME,
  DEBUG_STACKTRACE_TOOL_NAME,
  DEBUG_STEP_TOOL_NAME,
  DEBUG_VARIABLES_TOOL_NAME,
} from './tool-names.js';

interface DebugAttachParams {
  runtime: DebugRuntime;
  host?: string;
  port?: number;
  pid?: number;
}

interface DebugLaunchParams {
  runtime: DebugRuntime;
  program: string;
  args?: string[];
  cwd?: string;
  stop_on_entry?: boolean;
}

interface DebugSetBreakpointParams {
  file_path: string;
  lines: number[];
  condition?: string;
}

interface DebugStacktraceParams {
  thread_id?: number;
  levels?: number;
}

interface DebugVariablesParams {
  frame_id: number;
  scope?: string;
}

interface DebugEvaluateParams {
  expression: string;
  frame_id?: number;
  context?: EvaluateArguments['context'];
}

interface DebugStepParams {
  action: 'over' | 'into' | 'out';
  thread_id?: number;
}

interface DebugContinueParams {
  thread_id?: number;
}

interface DebugDisconnectParams {
  terminate?: boolean;
}

const debugRuntimeSchema = {
  type: 'string',
  enum: ['node', 'python', 'go'],
};

class DebugAttachInvocation extends BaseToolInvocation<
  DebugAttachParams,
  ToolResult
> {
  getDescription(): string {
    return `Attach ${this.params.runtime} debugger to ${this.params.host ?? 'localhost'}:${this.params.port ?? DEFAULT_DEBUG_PORTS[this.params.runtime]}`;
  }

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    const manager = getDebugSessionManager();
    const session = await manager.attachSession({
      runtime: this.params.runtime,
      host: this.params.host,
      port: this.params.port,
      pid: this.params.pid,
    });

    return {
      llmContent: `Attached debugger session ${session.id} (${session.runtime}).`,
      returnDisplay: `Attached session ${session.id} (${session.runtime}) in attach mode.`,
    };
  }
}

class DebugLaunchInvocation extends BaseToolInvocation<
  DebugLaunchParams,
  ToolResult
> {
  constructor(
    private readonly config: Config,
    params: DebugLaunchParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ) {
    super(params, messageBus, _toolName, _toolDisplayName);
  }

  getDescription(): string {
    return `Launch ${this.params.runtime} program ${this.params.program} under debugger`;
  }

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    const manager = getDebugSessionManager();
    const session = await manager.launchSession({
      runtime: this.params.runtime,
      program: this.params.program,
      args: this.params.args,
      cwd: this.params.cwd ?? this.config.getTargetDir(),
      stopOnEntry: this.params.stop_on_entry,
    });

    return {
      llmContent: `Launched debug session ${session.id} (${session.runtime}).`,
      returnDisplay: `Launched session ${session.id} (${session.runtime}) in launch mode.`,
    };
  }
}

class DebugSetBreakpointInvocation extends BaseToolInvocation<
  DebugSetBreakpointParams,
  ToolResult
> {
  getDescription(): string {
    return `Set breakpoints in ${this.params.file_path} at lines: ${this.params.lines.join(', ')}`;
  }

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    const manager = getDebugSessionManager();
    const breakpoints: SourceBreakpoint[] = this.params.lines.map((line) => ({
      line,
      condition: this.params.condition,
    }));
    const created = await manager.setBreakpoints(
      this.params.file_path,
      breakpoints,
    );

    return {
      llmContent: `Configured ${created.length} breakpoint(s) in ${this.params.file_path}.`,
      returnDisplay: `Configured ${created.length} breakpoint(s).`,
    };
  }
}

class DebugStacktraceInvocation extends BaseToolInvocation<
  DebugStacktraceParams,
  ToolResult
> {
  getDescription(): string {
    return 'Inspect current stack trace';
  }

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    const manager = getDebugSessionManager();
    const frames = await manager.getStackTrace(
      this.params.thread_id,
      this.params.levels ?? 20,
    );
    const formatted = formatStackTrace(frames, {
      maxFrames: this.params.levels ?? 20,
      includeModuleId: true,
    });

    return {
      llmContent: formatted,
      returnDisplay: `Retrieved ${frames.length} stack frame(s).`,
    };
  }
}

class DebugVariablesInvocation extends BaseToolInvocation<
  DebugVariablesParams,
  ToolResult
> {
  getDescription(): string {
    return `Inspect variables for frame ${this.params.frame_id}`;
  }

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    const manager = getDebugSessionManager();
    const scopes = await manager.getScopes(this.params.frame_id);

    const normalizedScope = this.params.scope?.toLowerCase();
    const selectedScopes = normalizedScope
      ? scopes.filter((scope) => scope.name.toLowerCase() === normalizedScope)
      : scopes;

    const expanded = await Promise.all(
      selectedScopes.map(async (scope) => ({
        scope,
        variables: await manager.getVariables(scope.variablesReference),
      })),
    );

    const formatted = formatScopes(expanded);
    const session = manager.requireSession();
    const stack = await manager.getStackTrace(session.stoppedThreadId, 5);
    const analysisPrompt = buildAnalysisPrompt({
      stackTrace: stack,
      variables: expanded,
      stoppedReason: session.stoppedReason,
    });

    return {
      llmContent: `${formatted}\n\n${analysisPrompt}`,
      returnDisplay: `Retrieved variables for frame ${this.params.frame_id}.`,
    };
  }
}

class DebugEvaluateInvocation extends BaseToolInvocation<
  DebugEvaluateParams,
  ToolResult
> {
  getDescription(): string {
    return `Evaluate expression: ${this.params.expression}`;
  }

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    const manager = getDebugSessionManager();
    const result = await manager.evaluate(
      this.params.expression,
      this.params.frame_id,
      this.params.context,
    );

    return {
      llmContent: `${result.result}`,
      returnDisplay: `Evaluated expression: ${this.params.expression}`,
    };
  }
}

class DebugStepInvocation extends BaseToolInvocation<
  DebugStepParams,
  ToolResult
> {
  getDescription(): string {
    return `Step ${this.params.action} in debugger`;
  }

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    const manager = getDebugSessionManager();

    if (this.params.action === 'over') {
      await manager.stepOver(this.params.thread_id);
    } else if (this.params.action === 'into') {
      await manager.stepIn(this.params.thread_id);
    } else {
      await manager.stepOut(this.params.thread_id);
    }

    return {
      llmContent: `Stepped ${this.params.action}.`,
      returnDisplay: `Stepped ${this.params.action}.`,
    };
  }
}

class DebugContinueInvocation extends BaseToolInvocation<
  DebugContinueParams,
  ToolResult
> {
  getDescription(): string {
    return 'Continue debug execution';
  }

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    const manager = getDebugSessionManager();
    const result = await manager.continue(this.params.thread_id);

    return {
      llmContent: 'Resumed debug execution.',
      returnDisplay: `Resumed debug execution (allThreadsContinued: ${String(result.allThreadsContinued ?? true)}).`,
    };
  }
}

class DebugDisconnectInvocation extends BaseToolInvocation<
  DebugDisconnectParams,
  ToolResult
> {
  getDescription(): string {
    return 'Disconnect debug session';
  }

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    const manager = getDebugSessionManager();
    const session = manager.getActiveSession();
    await manager.disconnectSession(this.params.terminate ?? false);

    const summary = formatSessionSummary({
      runtime: session?.runtime ?? 'node',
      breakpointsHit: 0,
      errorsFound: [],
      stepsPerformed: 0,
    });

    return {
      llmContent: `Disconnected debug session.\n\n${summary}`,
      returnDisplay: `Disconnected debug session (terminate: ${String(this.params.terminate ?? false)}).`,
    };
  }
}

export class DebugAttachTool extends BaseDeclarativeTool<
  DebugAttachParams,
  ToolResult
> {
  static readonly Name = DEBUG_ATTACH_TOOL_NAME;

  constructor(messageBus: MessageBus) {
    super(
      DEBUG_ATTACH_TOOL_NAME,
      'DebugAttach',
      'Attach to a running process through a DAP-compatible debugger endpoint.',
      Kind.Execute,
      {
        type: 'object',
        properties: {
          runtime: debugRuntimeSchema,
          host: { type: 'string' },
          port: { type: 'number' },
          pid: { type: 'number' },
        },
        required: ['runtime'],
      },
      messageBus,
    );
  }

  protected createInvocation(
    params: DebugAttachParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ): ToolInvocation<DebugAttachParams, ToolResult> {
    return new DebugAttachInvocation(
      params,
      messageBus,
      _toolName,
      _toolDisplayName,
    );
  }
}

export class DebugLaunchTool extends BaseDeclarativeTool<
  DebugLaunchParams,
  ToolResult
> {
  static readonly Name = DEBUG_LAUNCH_TOOL_NAME;

  constructor(
    private readonly config: Config,
    messageBus: MessageBus,
  ) {
    super(
      DEBUG_LAUNCH_TOOL_NAME,
      'DebugLaunch',
      'Launch a program under a DAP-compatible debugger session.',
      Kind.Execute,
      {
        type: 'object',
        properties: {
          runtime: debugRuntimeSchema,
          program: { type: 'string' },
          args: {
            type: 'array',
            items: { type: 'string' },
          },
          cwd: { type: 'string' },
          stop_on_entry: { type: 'boolean' },
        },
        required: ['runtime', 'program'],
      },
      messageBus,
    );
  }

  protected createInvocation(
    params: DebugLaunchParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ): ToolInvocation<DebugLaunchParams, ToolResult> {
    return new DebugLaunchInvocation(
      this.config,
      params,
      messageBus,
      _toolName,
      _toolDisplayName,
    );
  }
}

export class DebugSetBreakpointTool extends BaseDeclarativeTool<
  DebugSetBreakpointParams,
  ToolResult
> {
  static readonly Name = DEBUG_SET_BREAKPOINT_TOOL_NAME;

  constructor(messageBus: MessageBus) {
    super(
      DEBUG_SET_BREAKPOINT_TOOL_NAME,
      'DebugSetBreakpoint',
      'Set breakpoints in a source file for the active debug session.',
      Kind.Execute,
      {
        type: 'object',
        properties: {
          file_path: { type: 'string' },
          lines: {
            type: 'array',
            items: { type: 'number' },
            minItems: 1,
          },
          condition: { type: 'string' },
        },
        required: ['file_path', 'lines'],
      },
      messageBus,
    );
  }

  protected createInvocation(
    params: DebugSetBreakpointParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ): ToolInvocation<DebugSetBreakpointParams, ToolResult> {
    return new DebugSetBreakpointInvocation(
      params,
      messageBus,
      _toolName,
      _toolDisplayName,
    );
  }
}

export class DebugStacktraceTool extends BaseDeclarativeTool<
  DebugStacktraceParams,
  ToolResult
> {
  static readonly Name = DEBUG_STACKTRACE_TOOL_NAME;

  constructor(messageBus: MessageBus) {
    super(
      DEBUG_STACKTRACE_TOOL_NAME,
      'DebugStacktrace',
      'Inspect stack frames for a stopped thread in the active debug session.',
      Kind.Read,
      {
        type: 'object',
        properties: {
          thread_id: { type: 'number' },
          levels: { type: 'number' },
        },
      },
      messageBus,
    );
  }

  protected createInvocation(
    params: DebugStacktraceParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ): ToolInvocation<DebugStacktraceParams, ToolResult> {
    return new DebugStacktraceInvocation(
      params,
      messageBus,
      _toolName,
      _toolDisplayName,
    );
  }
}

export class DebugVariablesTool extends BaseDeclarativeTool<
  DebugVariablesParams,
  ToolResult
> {
  static readonly Name = DEBUG_VARIABLES_TOOL_NAME;

  constructor(messageBus: MessageBus) {
    super(
      DEBUG_VARIABLES_TOOL_NAME,
      'DebugVariables',
      'Inspect variables for a stack frame and summarize state for root-cause analysis.',
      Kind.Read,
      {
        type: 'object',
        properties: {
          frame_id: { type: 'number' },
          scope: { type: 'string' },
        },
        required: ['frame_id'],
      },
      messageBus,
    );
  }

  protected createInvocation(
    params: DebugVariablesParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ): ToolInvocation<DebugVariablesParams, ToolResult> {
    return new DebugVariablesInvocation(
      params,
      messageBus,
      _toolName,
      _toolDisplayName,
    );
  }
}

export class DebugEvaluateTool extends BaseDeclarativeTool<
  DebugEvaluateParams,
  ToolResult
> {
  static readonly Name = DEBUG_EVALUATE_TOOL_NAME;

  constructor(messageBus: MessageBus) {
    super(
      DEBUG_EVALUATE_TOOL_NAME,
      'DebugEvaluate',
      'Evaluate an expression in the current debug context.',
      Kind.Read,
      {
        type: 'object',
        properties: {
          expression: { type: 'string' },
          frame_id: { type: 'number' },
          context: { type: 'string' },
        },
        required: ['expression'],
      },
      messageBus,
    );
  }

  protected createInvocation(
    params: DebugEvaluateParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ): ToolInvocation<DebugEvaluateParams, ToolResult> {
    return new DebugEvaluateInvocation(
      params,
      messageBus,
      _toolName,
      _toolDisplayName,
    );
  }
}

export class DebugStepTool extends BaseDeclarativeTool<
  DebugStepParams,
  ToolResult
> {
  static readonly Name = DEBUG_STEP_TOOL_NAME;

  constructor(messageBus: MessageBus) {
    super(
      DEBUG_STEP_TOOL_NAME,
      'DebugStep',
      'Step over, into, or out in the current debug session.',
      Kind.Execute,
      {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['over', 'into', 'out'],
          },
          thread_id: { type: 'number' },
        },
        required: ['action'],
      },
      messageBus,
    );
  }

  protected createInvocation(
    params: DebugStepParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ): ToolInvocation<DebugStepParams, ToolResult> {
    return new DebugStepInvocation(
      params,
      messageBus,
      _toolName,
      _toolDisplayName,
    );
  }
}

export class DebugContinueTool extends BaseDeclarativeTool<
  DebugContinueParams,
  ToolResult
> {
  static readonly Name = DEBUG_CONTINUE_TOOL_NAME;

  constructor(messageBus: MessageBus) {
    super(
      DEBUG_CONTINUE_TOOL_NAME,
      'DebugContinue',
      'Resume execution of the active debug session.',
      Kind.Execute,
      {
        type: 'object',
        properties: {
          thread_id: { type: 'number' },
        },
      },
      messageBus,
    );
  }

  protected createInvocation(
    params: DebugContinueParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ): ToolInvocation<DebugContinueParams, ToolResult> {
    return new DebugContinueInvocation(
      params,
      messageBus,
      _toolName,
      _toolDisplayName,
    );
  }
}

export class DebugDisconnectTool extends BaseDeclarativeTool<
  DebugDisconnectParams,
  ToolResult
> {
  static readonly Name = DEBUG_DISCONNECT_TOOL_NAME;

  constructor(messageBus: MessageBus) {
    super(
      DEBUG_DISCONNECT_TOOL_NAME,
      'DebugDisconnect',
      'Disconnect and optionally terminate the active debug session.',
      Kind.Execute,
      {
        type: 'object',
        properties: {
          terminate: { type: 'boolean' },
        },
      },
      messageBus,
    );
  }

  protected createInvocation(
    params: DebugDisconnectParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ): ToolInvocation<DebugDisconnectParams, ToolResult> {
    return new DebugDisconnectInvocation(
      params,
      messageBus,
      _toolName,
      _toolDisplayName,
    );
  }
}
