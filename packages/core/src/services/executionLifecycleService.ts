/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { InjectionService } from '../config/injectionService.js';
import type { AnsiOutput } from '../utils/terminalSerializer.js';
import { debugLogger } from '../utils/debugLogger.js';

export type ExecutionMethod =
  | 'lydell-node-pty'
  | 'node-pty'
  | 'child_process'
  | 'remote_agent'
  | 'none';

export interface ExecutionResult {
  rawOutput?: Buffer;
  output: string;
  exitCode: number | null;
  signal: number | null;
  error: Error | null;
  aborted: boolean;
  pid: number | undefined;
  executionMethod: ExecutionMethod;
  backgrounded?: boolean;
}

export interface ExecutionHandle {
  pid: number | undefined;
  result: Promise<ExecutionResult>;
}

export type ExecutionOutputEvent =
  | {
      type: 'data';
      chunk: string | AnsiOutput;
    }
  | {
      type: 'binary_detected';
    }
  | {
      type: 'binary_progress';
      bytesReceived: number;
    }
  | {
      type: 'exit';
      exitCode: number | null;
      signal: number | null;
    };

export interface ExecutionCompletionOptions {
  exitCode?: number | null;
  signal?: number | null;
  error?: Error | null;
  aborted?: boolean;
}

export interface ExternalExecutionRegistration {
  executionMethod: ExecutionMethod;
  initialOutput?: string;
  getBackgroundOutput?: () => string;
  getSubscriptionSnapshot?: () => string | AnsiOutput | undefined;
  writeInput?: (input: string) => void;
  kill?: () => void;
  isActive?: () => boolean;
}

/**
 * Callback that an execution creator provides to control how its output
 * is formatted when reinjected into the model conversation after backgrounding.
 * Return `null` to skip injection entirely.
 */
export type FormatInjectionFn = (
  output: string,
  error: Error | null,
) => string | null;

interface ManagedExecutionBase {
  executionMethod: ExecutionMethod;
  output: string;
  backgrounded?: boolean;
  formatInjection?: FormatInjectionFn;
  getBackgroundOutput?: () => string;
  getSubscriptionSnapshot?: () => string | AnsiOutput | undefined;
}

/**
 * Payload emitted when a previously-backgrounded execution settles.
 */
export interface BackgroundCompletionInfo {
  executionId: number;
  executionMethod: ExecutionMethod;
  output: string;
  error: Error | null;
  /** Pre-formatted injection text from the execution creator, or `null` if skipped. */
  injectionText: string | null;
}

export type BackgroundCompletionListener = (
  info: BackgroundCompletionInfo,
) => void;

interface VirtualExecutionState extends ManagedExecutionBase {
  kind: 'virtual';
  onKill?: () => void;
}

interface ExternalExecutionState extends ManagedExecutionBase {
  kind: 'external';
  writeInput?: (input: string) => void;
  kill?: () => void;
  isActive?: () => boolean;
}

type ManagedExecutionState = VirtualExecutionState | ExternalExecutionState;

const NON_PROCESS_EXECUTION_ID_START = 2_000_000_000;

/**
 * Central owner for execution backgrounding lifecycle across shell and tools.
 */
export class ExecutionLifecycleService {
  private static readonly EXIT_INFO_TTL_MS = 5 * 60 * 1000;
  private static nextExecutionId = NON_PROCESS_EXECUTION_ID_START;

  private static activeExecutions = new Map<number, ManagedExecutionState>();
  private static activeResolvers = new Map<
    number,
    (result: ExecutionResult) => void
  >();
  private static activeListeners = new Map<
    number,
    Set<(event: ExecutionOutputEvent) => void>
  >();
  private static exitedExecutionInfo = new Map<
    number,
    { exitCode: number; signal?: number }
  >();
  private static backgroundCompletionListeners =
    new Set<BackgroundCompletionListener>();
  private static injectionService: InjectionService | null = null;

  /**
   * Wires a singleton InjectionService so that backgrounded executions
   * can inject their output directly without routing through the UI layer.
   */
  static setInjectionService(service: InjectionService): void {
    this.injectionService = service;
  }

  /**
   * Registers a listener that fires when a previously-backgrounded
   * execution settles (completes or errors).
   */
  static onBackgroundComplete(listener: BackgroundCompletionListener): void {
    this.backgroundCompletionListeners.add(listener);
  }

  /**
   * Unregisters a background completion listener.
   */
  static offBackgroundComplete(listener: BackgroundCompletionListener): void {
    this.backgroundCompletionListeners.delete(listener);
  }

  private static storeExitInfo(
    executionId: number,
    exitCode: number,
    signal?: number,
  ): void {
    this.exitedExecutionInfo.set(executionId, {
      exitCode,
      signal,
    });
    setTimeout(() => {
      this.exitedExecutionInfo.delete(executionId);
    }, this.EXIT_INFO_TTL_MS).unref();
  }

  private static allocateExecutionId(): number {
    let executionId = ++this.nextExecutionId;
    while (this.activeExecutions.has(executionId)) {
      executionId = ++this.nextExecutionId;
    }
    return executionId;
  }

  private static createPendingResult(
    executionId: number,
  ): Promise<ExecutionResult> {
    return new Promise<ExecutionResult>((resolve) => {
      this.activeResolvers.set(executionId, resolve);
    });
  }

  private static createAbortedResult(
    executionId: number,
    execution: ManagedExecutionState,
  ): ExecutionResult {
    const output = execution.getBackgroundOutput?.() ?? execution.output;
    return {
      rawOutput: Buffer.from(output, 'utf8'),
      output,
      exitCode: 130,
      signal: null,
      error: new Error('Operation cancelled by user.'),
      aborted: true,
      pid: executionId,
      executionMethod: execution.executionMethod,
    };
  }

  /**
   * Resets lifecycle state for isolated unit tests.
   */
  static resetForTest(): void {
    this.activeExecutions.clear();
    this.activeResolvers.clear();
    this.activeListeners.clear();
    this.exitedExecutionInfo.clear();
    this.backgroundCompletionListeners.clear();
    this.injectionService = null;
    this.nextExecutionId = NON_PROCESS_EXECUTION_ID_START;
  }

  static attachExecution(
    executionId: number,
    registration: ExternalExecutionRegistration,
  ): ExecutionHandle {
    if (
      this.activeExecutions.has(executionId) ||
      this.activeResolvers.has(executionId)
    ) {
      throw new Error(`Execution ${executionId} is already attached.`);
    }
    this.exitedExecutionInfo.delete(executionId);

    this.activeExecutions.set(executionId, {
      executionMethod: registration.executionMethod,
      output: registration.initialOutput ?? '',
      kind: 'external',
      getBackgroundOutput: registration.getBackgroundOutput,
      getSubscriptionSnapshot: registration.getSubscriptionSnapshot,
      writeInput: registration.writeInput,
      kill: registration.kill,
      isActive: registration.isActive,
    });

    return {
      pid: executionId,
      result: this.createPendingResult(executionId),
    };
  }

  static createExecution(
    initialOutput = '',
    onKill?: () => void,
    executionMethod: ExecutionMethod = 'none',
    formatInjection?: FormatInjectionFn,
  ): ExecutionHandle {
    const executionId = this.allocateExecutionId();

    this.activeExecutions.set(executionId, {
      executionMethod,
      output: initialOutput,
      kind: 'virtual',
      onKill,
      formatInjection,
      getBackgroundOutput: () => {
        const state = this.activeExecutions.get(executionId);
        return state?.output ?? initialOutput;
      },
      getSubscriptionSnapshot: () => {
        const state = this.activeExecutions.get(executionId);
        return state?.output ?? initialOutput;
      },
    });

    return {
      pid: executionId,
      result: this.createPendingResult(executionId),
    };
  }

  static appendOutput(executionId: number, chunk: string): void {
    const execution = this.activeExecutions.get(executionId);
    if (!execution || chunk.length === 0) {
      return;
    }

    execution.output += chunk;
    this.emitEvent(executionId, { type: 'data', chunk });
  }

  static emitEvent(executionId: number, event: ExecutionOutputEvent): void {
    const listeners = this.activeListeners.get(executionId);
    if (listeners) {
      listeners.forEach((listener) => listener(event));
    }
  }

  private static resolvePending(
    executionId: number,
    result: ExecutionResult,
  ): void {
    const resolve = this.activeResolvers.get(executionId);
    if (!resolve) {
      return;
    }

    resolve(result);
    this.activeResolvers.delete(executionId);
  }

  private static settleExecution(
    executionId: number,
    result: ExecutionResult,
  ): void {
    const execution = this.activeExecutions.get(executionId);
    if (!execution) {
      return;
    }

    // Fire background completion listeners if this was a backgrounded execution.
    if (execution.backgrounded && !result.aborted) {
      const injectionText = execution.formatInjection
        ? execution.formatInjection(result.output, result.error)
        : null;
      const info: BackgroundCompletionInfo = {
        executionId,
        executionMethod: execution.executionMethod,
        output: result.output,
        error: result.error,
        injectionText,
      };

      // Inject directly into the model conversation if injection text is
      // available and the injection service has been wired up.
      if (injectionText && this.injectionService) {
        this.injectionService.addInjection(
          injectionText,
          'background_completion',
        );
      }

      for (const listener of this.backgroundCompletionListeners) {
        try {
          listener(info);
        } catch (error) {
          debugLogger.warn(`Background completion listener failed: ${error}`);
        }
      }
    }

    this.resolvePending(executionId, result);
    this.emitEvent(executionId, {
      type: 'exit',
      exitCode: result.exitCode,
      signal: result.signal,
    });

    this.activeListeners.delete(executionId);
    this.activeExecutions.delete(executionId);
    this.storeExitInfo(
      executionId,
      result.exitCode ?? 0,
      result.signal ?? undefined,
    );
  }

  static completeExecution(
    executionId: number,
    options?: ExecutionCompletionOptions,
  ): void {
    const execution = this.activeExecutions.get(executionId);
    if (!execution) {
      return;
    }

    const {
      error = null,
      aborted = false,
      exitCode = error ? 1 : 0,
      signal = null,
    } = options ?? {};

    const output = execution.getBackgroundOutput?.() ?? execution.output;

    this.settleExecution(executionId, {
      rawOutput: Buffer.from(output, 'utf8'),
      output,
      exitCode,
      signal,
      error,
      aborted,
      pid: executionId,
      executionMethod: execution.executionMethod,
    });
  }

  static completeWithResult(
    executionId: number,
    result: ExecutionResult,
  ): void {
    this.settleExecution(executionId, result);
  }

  static background(executionId: number): void {
    const resolve = this.activeResolvers.get(executionId);
    if (!resolve) {
      return;
    }

    const execution = this.activeExecutions.get(executionId);
    if (!execution) {
      return;
    }

    const output = execution.getBackgroundOutput?.() ?? execution.output;

    resolve({
      rawOutput: Buffer.from(''),
      output,
      exitCode: null,
      signal: null,
      error: null,
      aborted: false,
      pid: executionId,
      executionMethod: execution.executionMethod,
      backgrounded: true,
    });

    this.activeResolvers.delete(executionId);
    execution.backgrounded = true;
  }

  static subscribe(
    executionId: number,
    listener: (event: ExecutionOutputEvent) => void,
  ): () => void {
    if (!this.activeListeners.has(executionId)) {
      this.activeListeners.set(executionId, new Set());
    }
    this.activeListeners.get(executionId)?.add(listener);

    const execution = this.activeExecutions.get(executionId);
    if (execution) {
      const snapshot =
        execution.getSubscriptionSnapshot?.() ??
        (execution.output.length > 0 ? execution.output : undefined);
      if (snapshot && (typeof snapshot !== 'string' || snapshot.length > 0)) {
        listener({ type: 'data', chunk: snapshot });
      }
    }

    return () => {
      this.activeListeners.get(executionId)?.delete(listener);
      if (this.activeListeners.get(executionId)?.size === 0) {
        this.activeListeners.delete(executionId);
      }
    };
  }

  static onExit(
    executionId: number,
    callback: (exitCode: number, signal?: number) => void,
  ): () => void {
    if (this.activeExecutions.has(executionId)) {
      const listener = (event: ExecutionOutputEvent) => {
        if (event.type === 'exit') {
          callback(event.exitCode ?? 0, event.signal ?? undefined);
          unsubscribe();
        }
      };
      const unsubscribe = this.subscribe(executionId, listener);
      return unsubscribe;
    }

    const exitedInfo = this.exitedExecutionInfo.get(executionId);
    if (exitedInfo) {
      callback(exitedInfo.exitCode, exitedInfo.signal);
    }

    return () => {};
  }

  static kill(executionId: number): void {
    const execution = this.activeExecutions.get(executionId);
    if (!execution) {
      return;
    }

    if (execution.kind === 'virtual') {
      execution.onKill?.();
    }

    if (execution.kind === 'external') {
      execution.kill?.();
    }

    this.completeWithResult(
      executionId,
      this.createAbortedResult(executionId, execution),
    );
  }

  static isActive(executionId: number): boolean {
    const execution = this.activeExecutions.get(executionId);
    if (!execution) {
      if (executionId >= NON_PROCESS_EXECUTION_ID_START) {
        return false;
      }
      try {
        return process.kill(executionId, 0);
      } catch {
        return false;
      }
    }

    if (execution.kind === 'virtual') {
      return true;
    }

    if (execution.kind === 'external' && execution.isActive) {
      try {
        return execution.isActive();
      } catch {
        return false;
      }
    }

    try {
      return process.kill(executionId, 0);
    } catch {
      return false;
    }
  }

  static writeInput(executionId: number, input: string): void {
    const execution = this.activeExecutions.get(executionId);
    if (execution?.kind === 'external') {
      execution.writeInput?.(input);
    }
  }
}
