/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ShellExecutionService,
  type ShellExecutionHandle,
  type ShellOutputEvent,
} from './shellExecutionService.js';

export interface ExecutionCompletionOptions {
  exitCode?: number | null;
  signal?: number | null;
  error?: Error | null;
  aborted?: boolean;
}

/**
 * Generic lifecycle facade for backgroundable executions.
 *
 * This wraps ShellExecutionService so non-shell executors (remote/local agents)
 * can use neutral lifecycle naming without duplicating process-management logic.
 */
export class ExecutionLifecycleService {
  static createExecution(
    initialOutput = '',
    onKill?: () => void,
  ): ShellExecutionHandle {
    return ShellExecutionService.createVirtualExecution(initialOutput, onKill);
  }

  static appendOutput(executionId: number, chunk: string): void {
    ShellExecutionService.appendVirtualOutput(executionId, chunk);
  }

  static completeExecution(
    executionId: number,
    options?: ExecutionCompletionOptions,
  ): void {
    ShellExecutionService.completeVirtualExecution(executionId, options);
  }

  static background(executionId: number): void {
    ShellExecutionService.background(executionId);
  }

  static subscribe(
    executionId: number,
    listener: (event: ShellOutputEvent) => void,
  ): () => void {
    return ShellExecutionService.subscribe(executionId, listener);
  }

  static onExit(
    executionId: number,
    callback: (exitCode: number, signal?: number) => void,
  ): () => void {
    return ShellExecutionService.onExit(executionId, callback);
  }

  static kill(executionId: number): void {
    ShellExecutionService.kill(executionId);
  }

  static isActive(executionId: number): boolean {
    return ShellExecutionService.isPtyActive(executionId);
  }

  static writeInput(executionId: number, input: string): void {
    ShellExecutionService.writeToPty(executionId, input);
  }
}
