/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AnsiOutput } from '../utils/terminalSerializer.js';

export type ExecutionMethod =
  | 'lydell-node-pty'
  | 'node-pty'
  | 'child_process'
  | 'none';

export interface ExecutionResult {
  rawOutput: Buffer;
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

interface ManagedExecutionState {
  executionMethod: ExecutionMethod;
  output: string;
  isVirtual: boolean;
  onKill?: () => void;
  getBackgroundOutput?: () => string;
  getSubscriptionSnapshot?: () => string | AnsiOutput | undefined;
  writeInput?: (input: string) => void;
  kill?: () => void;
  isActive?: () => boolean;
}

/**
 * Central owner for execution backgrounding lifecycle across shell and tools.
 */
export class ExecutionLifecycleService {
  private static readonly EXIT_INFO_TTL_MS = 5 * 60 * 1000;
  private static nextVirtualExecutionId = 2_000_000_000;

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

  private static allocateVirtualExecutionId(): number {
    let executionId = ++this.nextVirtualExecutionId;
    while (this.activeExecutions.has(executionId)) {
      executionId = ++this.nextVirtualExecutionId;
    }
    return executionId;
  }

  private static createPendingResult(executionId: number): Promise<ExecutionResult> {
    return new Promise<ExecutionResult>((resolve) => {
      this.activeResolvers.set(executionId, resolve);
    });
  }

  static registerExecution(
    executionId: number,
    registration: ExternalExecutionRegistration,
  ): ExecutionHandle {
    this.activeExecutions.set(executionId, {
      executionMethod: registration.executionMethod,
      output: registration.initialOutput ?? '',
      isVirtual: false,
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
  ): ExecutionHandle {
    const executionId = this.allocateVirtualExecutionId();

    this.activeExecutions.set(executionId, {
      executionMethod: 'none',
      output: initialOutput,
      isVirtual: true,
      onKill,
      getBackgroundOutput: () => {
        const state = this.activeExecutions.get(executionId);
        return state?.output ?? initialOutput;
      },
      getSubscriptionSnapshot: () => {
        const state = this.activeExecutions.get(executionId);
        return state?.output ?? initialOutput;
      },
      isActive: () => true,
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

    this.resolvePending(executionId, {
      rawOutput: Buffer.from(output, 'utf8'),
      output,
      exitCode,
      signal,
      error,
      aborted,
      pid: executionId,
      executionMethod: execution.executionMethod,
    });

    this.emitEvent(executionId, {
      type: 'exit',
      exitCode,
      signal,
    });

    this.activeListeners.delete(executionId);
    this.activeExecutions.delete(executionId);
    this.storeExitInfo(executionId, exitCode ?? 0, signal ?? undefined);
  }

  static finalizeExecution(
    executionId: number,
    result: ExecutionResult,
  ): void {
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

    if (execution.isVirtual) {
      execution.onKill?.();
      this.completeExecution(executionId, {
        error: new Error('Operation cancelled by user.'),
        aborted: true,
        exitCode: 130,
      });
      return;
    }

    execution.kill?.();
    this.activeResolvers.delete(executionId);
    this.activeListeners.delete(executionId);
    this.activeExecutions.delete(executionId);
  }

  static isActive(executionId: number): boolean {
    const execution = this.activeExecutions.get(executionId);
    if (!execution) {
      try {
        return process.kill(executionId, 0);
      } catch {
        return false;
      }
    }

    if (execution.isVirtual) {
      return true;
    }

    if (execution.isActive) {
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
    this.activeExecutions.get(executionId)?.writeInput?.(input);
  }
}
