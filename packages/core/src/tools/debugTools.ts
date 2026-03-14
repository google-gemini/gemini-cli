/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MessageBus } from '../confirmation-bus/message-bus.js';
import {
    DEBUG_LAUNCH_DEFINITION,
    DEBUG_SET_BREAKPOINT_DEFINITION,
    DEBUG_GET_STACKTRACE_DEFINITION,
    DEBUG_GET_VARIABLES_DEFINITION,
    DEBUG_STEP_DEFINITION,
    DEBUG_EVALUATE_DEFINITION,
    DEBUG_DISCONNECT_DEFINITION,
    DEBUG_ATTACH_DEFINITION,
    DEBUG_SET_FUNCTION_BREAKPOINT_DEFINITION,
} from './definitions/debugTools.js';
import { resolveToolDeclaration } from './definitions/resolver.js';
import {
    DEBUG_LAUNCH_TOOL_NAME,
    DEBUG_SET_BREAKPOINT_TOOL_NAME,
    DEBUG_GET_STACKTRACE_TOOL_NAME,
    DEBUG_GET_VARIABLES_TOOL_NAME,
    DEBUG_STEP_TOOL_NAME,
    DEBUG_EVALUATE_TOOL_NAME,
    DEBUG_DISCONNECT_TOOL_NAME,
    DEBUG_ATTACH_TOOL_NAME,
    DEBUG_SET_FUNCTION_BREAKPOINT_TOOL_NAME,
} from './tool-names.js';
import type { ToolResult } from './tools.js';
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from './tools.js';
import { ToolErrorType } from './tool-error.js';
import { DAPClient } from '../debug/index.js';
import type {
    Breakpoint,
    StackFrame,
    Variable,
    Scope,
} from '../debug/index.js';
import { StackTraceAnalyzer } from '../debug/stackTraceAnalyzer.js';
import { FixSuggestionEngine } from '../debug/fixSuggestionEngine.js';

// ---------------------------------------------------------------------------
// Shared debug session — singleton managed across tool invocations
// ---------------------------------------------------------------------------

let activeSession: DAPClient | null = null;

function getSession(): DAPClient {
    if (!activeSession) {
        throw new Error(
            'No active debug session. Use debug_launch to start one first.',
        );
    }
    return activeSession;
}

function setSession(client: DAPClient): void {
    activeSession = client;
}

function clearSession(): void {
    activeSession = null;
}

// Shared intelligence layer instances
const stackTraceAnalyzer = new StackTraceAnalyzer();
const fixSuggestionEngine = new FixSuggestionEngine();

// Track last stop reason for intelligence layer
let lastStopReason = 'entry';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatStackFrame(frame: StackFrame, index: number): string {
    const location = frame.source?.path
        ? `${frame.source.path}:${String(frame.line)}`
        : '<unknown>';
    return `#${String(index)} ${frame.name} at ${location}`;
}

function formatVariable(v: Variable): string {
    const typeStr = v.type ? ` (${v.type})` : '';
    return `${v.name}${typeStr} = ${v.value}`;
}

function formatBreakpoint(bp: Breakpoint): string {
    const verified = bp.verified ? '✓' : '✗';
    return `[${verified}] id=${String(bp.id)} line=${String(bp.line ?? '?')}`;
}

function errorResult(message: string): ToolResult {
    return {
        llmContent: `Error: ${message}`,
        returnDisplay: 'Debug operation failed.',
        error: {
            message,
            type: ToolErrorType.EXECUTION_FAILED,
        },
    };
}

// ---------------------------------------------------------------------------
// debug_launch
// ---------------------------------------------------------------------------

interface LaunchParams {
    program: string;
    args?: string[];
    breakpoints?: Array<{
        file: string;
        line: number;
        condition?: string;
    }>;
    stopOnEntry?: boolean;
}

class DebugLaunchInvocation extends BaseToolInvocation<LaunchParams, ToolResult> {
    getDescription(): string {
        return `Launching debugger for: ${this.params.program}`;
    }

    override async execute(_signal: AbortSignal): Promise<ToolResult> {
        try {
            // Tear down any existing session
            if (activeSession) {
                try {
                    await activeSession.disconnect(true);
                } catch {
                    // Ignore cleanup errors
                }
                clearSession();
            }

            // Start debug adapter (Node.js inspect)
            const { spawn } = await import('node:child_process');
            const debugPort = 9229 + Math.floor(Math.random() * 1000);

            const args = [
                `--inspect-brk=127.0.0.1:${String(debugPort)}`,
                this.params.program,
                ...(this.params.args ?? []),
            ];

            const child = spawn(process.execPath, args, {
                stdio: ['pipe', 'pipe', 'pipe'],
                detached: false,
            });

            // Wait for the debugger to be ready
            await new Promise<void>((resolve, reject) => {
                const timeout = setTimeout(
                    () => reject(new Error('Debug adapter did not start in time')),
                    10000,
                );

                const onStderr = (data: Buffer): void => {
                    const text = data.toString();
                    if (text.includes('Debugger listening on')) {
                        clearTimeout(timeout);
                        child.stderr.off('data', onStderr);
                        resolve();
                    }
                };

                child.stderr.on('data', onStderr);
                child.on('error', (err) => {
                    clearTimeout(timeout);
                    reject(err);
                });
                child.on('exit', (code) => {
                    clearTimeout(timeout);
                    reject(
                        new Error(`Process exited with code ${String(code)} before debugger started`),
                    );
                });
            });

            // Connect DAP client
            const client = new DAPClient(15000);
            await client.connect(debugPort);
            await client.initialize();
            await client.launch(this.params.program, this.params.args ?? []);

            // Set initial breakpoints if provided
            const bpResults: string[] = [];
            if (this.params.breakpoints) {
                // Group breakpoints by file
                const byFile = new Map<string, Array<{ line: number; condition?: string }>>();
                for (const bp of this.params.breakpoints) {
                    const list = byFile.get(bp.file) ?? [];
                    list.push({ line: bp.line, condition: bp.condition });
                    byFile.set(bp.file, list);
                }

                for (const [file, bps] of byFile) {
                    const lines = bps.map((b) => b.line);
                    const conditions = bps.map((b) => b.condition);
                    const verified = await client.setBreakpoints(
                        file,
                        lines,
                        conditions,
                    );
                    for (const bp of verified) {
                        bpResults.push(formatBreakpoint(bp));
                    }
                }
            }

            // Enhancement 3: Auto-configure exception breakpoints
            // This makes the debugger catch ALL thrown exceptions automatically
            try {
                const caps = client.capabilities;
                const filters = caps.exceptionBreakpointFilters ?? [];
                if (filters.length > 0) {
                    const filterIds = filters.map((f: { filter: string }) => f.filter);
                    await client.setExceptionBreakpoints(filterIds);
                }
            } catch {
                // Non-critical — continue without exception breakpoints
            }

            await client.configurationDone();
            setSession(client);
            lastStopReason = 'entry';

            // Store child process reference for cleanup
            client.on('terminated', () => {
                try { child.kill(); } catch { /* ignore */ }
                clearSession();
            });

            const bpSummary =
                bpResults.length > 0
                    ? `\nBreakpoints:\n${bpResults.join('\n')}`
                    : '';

            return {
                llmContent: `Debug session started for ${this.params.program} (port ${String(debugPort)}).${bpSummary}\nProgram is paused. Use debug_get_stacktrace to see where execution stopped, or debug_step to continue.`,
                returnDisplay: `Debugger attached to ${this.params.program}.`,
            };
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            return errorResult(`Failed to launch debugger: ${msg}`);
        }
    }
}

export class DebugLaunchTool extends BaseDeclarativeTool<LaunchParams, ToolResult> {
    static readonly Name = DEBUG_LAUNCH_TOOL_NAME;

    constructor(messageBus: MessageBus) {
        super(
            DebugLaunchTool.Name,
            'Debug Launch',
            DEBUG_LAUNCH_DEFINITION.base.description!,
            Kind.Edit,
            DEBUG_LAUNCH_DEFINITION.base.parametersJsonSchema,
            messageBus,
        );
    }

    protected createInvocation(params: LaunchParams, messageBus: MessageBus) {
        return new DebugLaunchInvocation(params, messageBus, this.name);
    }

    override getSchema(modelId?: string) {
        return resolveToolDeclaration(DEBUG_LAUNCH_DEFINITION, modelId);
    }
}

// ---------------------------------------------------------------------------
// debug_set_breakpoint
// ---------------------------------------------------------------------------

interface SetBreakpointParams {
    file: string;
    breakpoints: Array<{
        line: number;
        condition?: string;
        logMessage?: string;
    }>;
}

class DebugSetBreakpointInvocation extends BaseToolInvocation<
    SetBreakpointParams,
    ToolResult
> {
    getDescription(): string {
        return `Setting breakpoints in ${this.params.file}`;
    }

    override async execute(_signal: AbortSignal): Promise<ToolResult> {
        try {
            const session = getSession();
            const lines = this.params.breakpoints.map((bp) => bp.line);
            const conditions = this.params.breakpoints.map(
                (bp) => bp.condition,
            );
            const logMessages = this.params.breakpoints.map(
                (bp) => bp.logMessage,
            );

            const result = await session.setBreakpoints(
                this.params.file,
                lines,
                conditions,
                logMessages,
            );

            const summary = result.map(formatBreakpoint).join('\n');
            return {
                llmContent: `Breakpoints set in ${this.params.file}:\n${summary}`,
                returnDisplay: `Set ${String(result.length)} breakpoint(s).`,
            };
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            return errorResult(msg);
        }
    }
}

export class DebugSetBreakpointTool extends BaseDeclarativeTool<
    SetBreakpointParams,
    ToolResult
> {
    static readonly Name = DEBUG_SET_BREAKPOINT_TOOL_NAME;

    constructor(messageBus: MessageBus) {
        super(
            DebugSetBreakpointTool.Name,
            'Debug SetBreakpoint',
            DEBUG_SET_BREAKPOINT_DEFINITION.base.description!,
            Kind.Edit,
            DEBUG_SET_BREAKPOINT_DEFINITION.base.parametersJsonSchema,
            messageBus,
        );
    }

    protected createInvocation(
        params: SetBreakpointParams,
        messageBus: MessageBus,
    ) {
        return new DebugSetBreakpointInvocation(
            params,
            messageBus,
            this.name,
        );
    }

    override getSchema(modelId?: string) {
        return resolveToolDeclaration(DEBUG_SET_BREAKPOINT_DEFINITION, modelId);
    }
}

// ---------------------------------------------------------------------------
// debug_get_stacktrace
// ---------------------------------------------------------------------------

interface GetStackTraceParams {
    threadId?: number;
    maxFrames?: number;
}

class DebugGetStackTraceInvocation extends BaseToolInvocation<
    GetStackTraceParams,
    ToolResult
> {
    getDescription(): string {
        return 'Getting call stack';
    }

    override async execute(_signal: AbortSignal): Promise<ToolResult> {
        try {
            const session = getSession();
            const threadId = this.params.threadId ?? 1;
            const maxFrames = this.params.maxFrames ?? 20;

            const frames = await session.stackTrace(
                threadId,
                0,
                maxFrames,
            );

            if (frames.length === 0) {
                return {
                    llmContent: 'No stack frames available. The program may not be paused at a breakpoint.',
                    returnDisplay: 'No stack frames.',
                };
            }

            // Gather scopes and variables for the top frame for intelligence analysis
            let scopes: Scope[] = [];
            const variableMap = new Map<number, Variable[]>();
            try {
                scopes = await session.scopes(frames[0].id);
                for (const scope of scopes) {
                    if (scope.name.toLowerCase() !== 'global') {
                        const vars = await session.variables(scope.variablesReference);
                        variableMap.set(scope.variablesReference, vars);
                    }
                }
            } catch {
                // Variables may not be available — continue with stack trace only
            }

            // Use intelligence layer for LLM-optimized output
            const analysis = stackTraceAnalyzer.analyze(
                lastStopReason,
                frames,
                scopes,
                variableMap,
                session.getRecentOutput(),
            );

            const result = fixSuggestionEngine.suggest(
                analysis,
                frames,
                scopes,
                variableMap,
                session.getRecentOutput(),
                lastStopReason,
            );

            return {
                llmContent: result.markdown,
                returnDisplay: `${String(frames.length)} stack frame(s) with analysis.`,
            };
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            return errorResult(msg);
        }
    }
}

export class DebugGetStackTraceTool extends BaseDeclarativeTool<
    GetStackTraceParams,
    ToolResult
> {
    static readonly Name = DEBUG_GET_STACKTRACE_TOOL_NAME;

    constructor(messageBus: MessageBus) {
        super(
            DebugGetStackTraceTool.Name,
            'Debug StackTrace',
            DEBUG_GET_STACKTRACE_DEFINITION.base.description!,
            Kind.Read,
            DEBUG_GET_STACKTRACE_DEFINITION.base.parametersJsonSchema,
            messageBus,
        );
    }

    protected createInvocation(
        params: GetStackTraceParams,
        messageBus: MessageBus,
    ) {
        return new DebugGetStackTraceInvocation(
            params,
            messageBus,
            this.name,
        );
    }

    override getSchema(modelId?: string) {
        return resolveToolDeclaration(DEBUG_GET_STACKTRACE_DEFINITION, modelId);
    }
}

// ---------------------------------------------------------------------------
// debug_get_variables
// ---------------------------------------------------------------------------

interface GetVariablesParams {
    frameIndex?: number;
    threadId?: number;
    variablesReference?: number;
}

class DebugGetVariablesInvocation extends BaseToolInvocation<
    GetVariablesParams,
    ToolResult
> {
    getDescription(): string {
        return 'Getting variables';
    }

    override async execute(_signal: AbortSignal): Promise<ToolResult> {
        try {
            const session = getSession();
            const threadId = this.params.threadId ?? 1;
            const frameIndex = this.params.frameIndex ?? 0;

            // If a specific variablesReference is given, expand it directly
            if (this.params.variablesReference !== undefined) {
                const vars = await session.variables(
                    this.params.variablesReference,
                );
                return {
                    llmContent: vars.map(formatVariable).join('\n') || 'No variables.',
                    returnDisplay: `${String(vars.length)} variable(s).`,
                };
            }

            // Otherwise, get scopes and variables for the given frame
            const frames = await session.stackTrace(threadId, 0, frameIndex + 1);
            if (frames.length <= frameIndex) {
                return errorResult(
                    `Frame index ${String(frameIndex)} out of range (${String(frames.length)} frames available).`,
                );
            }

            const frame = frames[frameIndex];
            const scopes: Scope[] = await session.scopes(frame.id);

            const sections: string[] = [];
            for (const scope of scopes) {
                const vars: Variable[] = await session.variables(
                    scope.variablesReference,
                );
                if (vars.length > 0) {
                    sections.push(
                        `## ${scope.name}\n${vars.map(formatVariable).join('\n')}`,
                    );
                }
            }

            const content =
                sections.length > 0
                    ? sections.join('\n\n')
                    : 'No variables in current scope.';

            return {
                llmContent: content,
                returnDisplay: `${String(scopes.length)} scope(s) inspected.`,
            };
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            return errorResult(msg);
        }
    }
}

export class DebugGetVariablesTool extends BaseDeclarativeTool<
    GetVariablesParams,
    ToolResult
> {
    static readonly Name = DEBUG_GET_VARIABLES_TOOL_NAME;

    constructor(messageBus: MessageBus) {
        super(
            DebugGetVariablesTool.Name,
            'Debug Variables',
            DEBUG_GET_VARIABLES_DEFINITION.base.description!,
            Kind.Read,
            DEBUG_GET_VARIABLES_DEFINITION.base.parametersJsonSchema,
            messageBus,
        );
    }

    protected createInvocation(
        params: GetVariablesParams,
        messageBus: MessageBus,
    ) {
        return new DebugGetVariablesInvocation(
            params,
            messageBus,
            this.name,
        );
    }

    override getSchema(modelId?: string) {
        return resolveToolDeclaration(DEBUG_GET_VARIABLES_DEFINITION, modelId);
    }
}

// ---------------------------------------------------------------------------
// debug_step
// ---------------------------------------------------------------------------

interface StepParams {
    action: 'continue' | 'next' | 'stepIn' | 'stepOut';
    threadId?: number;
}

class DebugStepInvocation extends BaseToolInvocation<StepParams, ToolResult> {
    getDescription(): string {
        return `Debug: ${this.params.action}`;
    }

    override async execute(_signal: AbortSignal): Promise<ToolResult> {
        try {
            const session = getSession();
            const threadId = this.params.threadId ?? 1;

            // Wait for the program to stop again after stepping
            const stoppedPromise = new Promise<Record<string, unknown>>(
                (resolve) => {
                    session.once('stopped', resolve);
                },
            );

            switch (this.params.action) {
                case 'continue':
                    await session.continue(threadId);
                    break;
                case 'next':
                    await session.next(threadId);
                    break;
                case 'stepIn':
                    await session.stepIn(threadId);
                    break;
                case 'stepOut':
                    await session.stepOut(threadId);
                    break;
                default:
                    return errorResult(`Unknown step action: ${String(this.params.action)}`);
            }

            // Wait for stopped event (with timeout)
            const stopResult = await Promise.race([
                stoppedPromise,
                new Promise<null>((resolve) =>
                    setTimeout(() => resolve(null), 5000),
                ),
            ]);

            if (stopResult === null) {
                return {
                    llmContent: `Executed '${this.params.action}'. Program is running (did not stop within 5s). Use debug_step with action 'continue' to wait for the next breakpoint, or debug_disconnect to end the session.`,
                    returnDisplay: `${this.params.action}: running.`,
                };
            }

            // Get current position
            const frames = await session.stackTrace(threadId, 0, 1);
            const location =
                frames.length > 0
                    ? formatStackFrame(frames[0], 0)
                    : 'Unknown location';

            const reason = typeof stopResult['reason'] === 'string'
                ? stopResult['reason']
                : 'unknown';

            // Update lastStopReason so the intelligence layer can use it
            lastStopReason = reason;

            return {
                llmContent: `Executed '${this.params.action}'. Stopped: ${reason}\nLocation: ${location}\nUse debug_get_stacktrace to see full analysis with fix suggestions, or debug_step to continue.`,
                returnDisplay: `${this.params.action}: stopped (${reason}).`,
            };
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            return errorResult(msg);
        }
    }
}

export class DebugStepTool extends BaseDeclarativeTool<StepParams, ToolResult> {
    static readonly Name = DEBUG_STEP_TOOL_NAME;

    constructor(messageBus: MessageBus) {
        super(
            DebugStepTool.Name,
            'Debug Step',
            DEBUG_STEP_DEFINITION.base.description!,
            Kind.Edit,
            DEBUG_STEP_DEFINITION.base.parametersJsonSchema,
            messageBus,
        );
    }

    protected createInvocation(params: StepParams, messageBus: MessageBus) {
        return new DebugStepInvocation(params, messageBus, this.name);
    }

    override getSchema(modelId?: string) {
        return resolveToolDeclaration(DEBUG_STEP_DEFINITION, modelId);
    }
}

// ---------------------------------------------------------------------------
// debug_evaluate
// ---------------------------------------------------------------------------

interface EvaluateParams {
    expression: string;
    frameIndex?: number;
    threadId?: number;
}

class DebugEvaluateInvocation extends BaseToolInvocation<
    EvaluateParams,
    ToolResult
> {
    getDescription(): string {
        return `Evaluating: ${this.params.expression}`;
    }

    override async execute(_signal: AbortSignal): Promise<ToolResult> {
        try {
            const session = getSession();
            const threadId = this.params.threadId ?? 1;
            const frameIndex = this.params.frameIndex ?? 0;

            // Resolve frameId from frame index
            const frames = await session.stackTrace(threadId, 0, frameIndex + 1);
            const frameId =
                frames.length > frameIndex ? frames[frameIndex].id : undefined;

            const result = await session.evaluate(
                this.params.expression,
                frameId,
                'repl',
            );

            const typeStr = result.type ? ` (${result.type})` : '';
            return {
                llmContent: `${this.params.expression}${typeStr} = ${result.result}`,
                returnDisplay: `Evaluated expression.`,
            };
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            return errorResult(msg);
        }
    }
}

export class DebugEvaluateTool extends BaseDeclarativeTool<
    EvaluateParams,
    ToolResult
> {
    static readonly Name = DEBUG_EVALUATE_TOOL_NAME;

    constructor(messageBus: MessageBus) {
        super(
            DebugEvaluateTool.Name,
            'Debug Evaluate',
            DEBUG_EVALUATE_DEFINITION.base.description!,
            Kind.Edit,
            DEBUG_EVALUATE_DEFINITION.base.parametersJsonSchema,
            messageBus,
        );
    }

    protected createInvocation(
        params: EvaluateParams,
        messageBus: MessageBus,
    ) {
        return new DebugEvaluateInvocation(params, messageBus, this.name);
    }

    override getSchema(modelId?: string) {
        return resolveToolDeclaration(DEBUG_EVALUATE_DEFINITION, modelId);
    }
}

// ---------------------------------------------------------------------------
// debug_disconnect
// ---------------------------------------------------------------------------

interface DisconnectParams {
    terminateDebuggee?: boolean;
}

class DebugDisconnectInvocation extends BaseToolInvocation<
    DisconnectParams,
    ToolResult
> {
    getDescription(): string {
        return 'Disconnecting debug session';
    }

    override async execute(_signal: AbortSignal): Promise<ToolResult> {
        try {
            const session = getSession();
            const terminate = this.params.terminateDebuggee ?? true;

            await session.disconnect(terminate);
            clearSession();

            return {
                llmContent: `Debug session ended.${terminate ? ' Debuggee process terminated.' : ''}`,
                returnDisplay: 'Disconnected.',
            };
        } catch (error) {
            // Even on error, clear the session
            clearSession();
            const msg = error instanceof Error ? error.message : String(error);
            return errorResult(msg);
        }
    }
}

export class DebugDisconnectTool extends BaseDeclarativeTool<
    DisconnectParams,
    ToolResult
> {
    static readonly Name = DEBUG_DISCONNECT_TOOL_NAME;

    constructor(messageBus: MessageBus) {
        super(
            DebugDisconnectTool.Name,
            'Debug Disconnect',
            DEBUG_DISCONNECT_DEFINITION.base.description!,
            Kind.Edit,
            DEBUG_DISCONNECT_DEFINITION.base.parametersJsonSchema,
            messageBus,
        );
    }

    protected createInvocation(
        params: DisconnectParams,
        messageBus: MessageBus,
    ) {
        return new DebugDisconnectInvocation(params, messageBus, this.name);
    }

    override getSchema(modelId?: string) {
        return resolveToolDeclaration(DEBUG_DISCONNECT_DEFINITION, modelId);
    }
}

// ---------------------------------------------------------------------------
// debug_attach
// ---------------------------------------------------------------------------

interface AttachParams {
    port: number;
    host?: string;
    breakpoints?: Array<{
        file: string;
        line: number;
        condition?: string;
    }>;
}

class DebugAttachInvocation extends BaseToolInvocation<AttachParams, ToolResult> {
    getDescription(): string {
        const host = this.params.host ?? '127.0.0.1';
        return `Attaching debugger to ${host}:${String(this.params.port)}`;
    }

    override async execute(_signal: AbortSignal): Promise<ToolResult> {
        try {
            // Tear down any existing session
            if (activeSession) {
                try {
                    await activeSession.disconnect(false);
                } catch {
                    // Ignore cleanup errors
                }
                clearSession();
            }

            const host = this.params.host ?? '127.0.0.1';
            const port = this.params.port;

            // Connect DAP client to existing process
            const client = new DAPClient(15000);
            await client.connect(port, host);
            await client.initialize();

            // For attach mode, we don't call launch — the process is already running
            // Send a configurationDone to signal we're ready
            await client.configurationDone();

            setSession(client);
            lastStopReason = 'attach';

            // Set initial breakpoints if provided
            const bpResults: string[] = [];
            if (this.params.breakpoints) {
                const byFile = new Map<string, Array<{ line: number; condition?: string }>>();
                for (const bp of this.params.breakpoints) {
                    const list = byFile.get(bp.file) ?? [];
                    list.push({ line: bp.line, condition: bp.condition });
                    byFile.set(bp.file, list);
                }

                for (const [file, bps] of byFile) {
                    const lines = bps.map((b) => b.line);
                    const conditions = bps.map((b) => b.condition);
                    const verified = await client.setBreakpoints(
                        file,
                        lines,
                        conditions,
                    );
                    for (const bp of verified) {
                        bpResults.push(formatBreakpoint(bp));
                    }
                }
            }

            const parts = [
                `Attached to process at ${host}:${String(port)}.`,
            ];

            if (bpResults.length > 0) {
                parts.push(`\nBreakpoints:\n${bpResults.join('\n')}`);
            }

            return {
                llmContent: parts.join(''),
                returnDisplay: `Attached to ${host}:${String(port)}`,
            };
        } catch (error) {
            clearSession();
            const msg = error instanceof Error ? error.message : String(error);
            return errorResult(`Failed to attach: ${msg}`);
        }
    }
}

export class DebugAttachTool extends BaseDeclarativeTool<
    AttachParams,
    ToolResult
> {
    static readonly Name = DEBUG_ATTACH_TOOL_NAME;

    constructor(messageBus: MessageBus) {
        super(
            DebugAttachTool.Name,
            'Debug Attach',
            DEBUG_ATTACH_DEFINITION.base.description!,
            Kind.Edit,
            DEBUG_ATTACH_DEFINITION.base.parametersJsonSchema,
            messageBus,
        );
    }

    protected createInvocation(
        params: AttachParams,
        messageBus: MessageBus,
    ) {
        return new DebugAttachInvocation(params, messageBus, this.name);
    }

    override getSchema(modelId?: string) {
        return resolveToolDeclaration(DEBUG_ATTACH_DEFINITION, modelId);
    }
}

// ---------------------------------------------------------------------------
// debug_set_function_breakpoint
// ---------------------------------------------------------------------------

interface FunctionBreakpointParams {
    breakpoints: Array<{
        name: string;
        condition?: string;
        hitCondition?: string;
    }>;
}

class DebugSetFunctionBreakpointInvocation extends BaseToolInvocation<
    FunctionBreakpointParams,
    ToolResult
> {
    getDescription(): string {
        const names = this.params.breakpoints.map((b) => b.name).join(', ');
        return `Setting function breakpoints: ${names}`;
    }

    override async execute(_signal: AbortSignal): Promise<ToolResult> {
        try {
            const session = getSession();

            // Build the DAP setFunctionBreakpoints request body
            const bps = this.params.breakpoints.map((bp) => ({
                name: bp.name,
                condition: bp.condition,
                hitCondition: bp.hitCondition,
            }));

            // Send via DAP protocol
            const response = await session.sendRequest('setFunctionBreakpoints', {
                breakpoints: bps,
            });

            // Format results
            const results: string[] = [];
            const responseBps = (response as { breakpoints?: Breakpoint[] }).breakpoints ?? [];

            for (let i = 0; i < responseBps.length; i++) {
                const bp = responseBps[i];
                const name = this.params.breakpoints[i]?.name ?? 'unknown';
                const verified = bp.verified ? '✓' : '✗';
                const cond = this.params.breakpoints[i]?.condition
                    ? ` (if: ${this.params.breakpoints[i].condition})`
                    : '';
                const hit = this.params.breakpoints[i]?.hitCondition
                    ? ` (hit: ${this.params.breakpoints[i].hitCondition})`
                    : '';
                results.push(`[${verified}] ${name}${cond}${hit}`);
            }

            const summary = results.length > 0
                ? `Function breakpoints set:\n${results.join('\n')}`
                : 'No function breakpoints set.';

            return {
                llmContent: summary,
                returnDisplay: `Set ${String(results.length)} function breakpoint(s)`,
            };
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            return errorResult(`Failed to set function breakpoints: ${msg}`);
        }
    }
}

export class DebugSetFunctionBreakpointTool extends BaseDeclarativeTool<
    FunctionBreakpointParams,
    ToolResult
> {
    static readonly Name = DEBUG_SET_FUNCTION_BREAKPOINT_TOOL_NAME;

    constructor(messageBus: MessageBus) {
        super(
            DebugSetFunctionBreakpointTool.Name,
            'Debug Function Breakpoint',
            DEBUG_SET_FUNCTION_BREAKPOINT_DEFINITION.base.description!,
            Kind.Edit,
            DEBUG_SET_FUNCTION_BREAKPOINT_DEFINITION.base.parametersJsonSchema,
            messageBus,
        );
    }

    protected createInvocation(
        params: FunctionBreakpointParams,
        messageBus: MessageBus,
    ) {
        return new DebugSetFunctionBreakpointInvocation(params, messageBus, this.name);
    }

    override getSchema(modelId?: string) {
        return resolveToolDeclaration(DEBUG_SET_FUNCTION_BREAKPOINT_DEFINITION, modelId);
    }
}

