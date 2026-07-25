/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi } from 'vitest';
import type {
  ShellExecutionHandle,
  ShellExecutionResult,
  ShellOutputEvent,
  ShellExecutionConfig,
} from '@google/gemini-cli-core';

export interface MockShellCommand {
  command: string | RegExp;
  result: Partial<ShellExecutionResult>;
  events?: ShellOutputEvent[];
}

type ShellExecutionServiceExecute = (
  commandToExecute: string,
  cwd: string,
  onOutputEvent: (event: ShellOutputEvent) => void,
  abortSignal: AbortSignal,
  shouldUseNodePty: boolean,
  shellExecutionConfig: ShellExecutionConfig,
) => Promise<ShellExecutionHandle>;

export class MockShellExecutionService {
  private static mockCommands: MockShellCommand[] = [];
  private static originalExecute: ShellExecutionServiceExecute | undefined;
  private static passthroughEnabled = false;

  /**
   * Registers the original implementation to allow falling back to real shell execution.
   */
  static setOriginalImplementation(
    implementation: ShellExecutionServiceExecute,
  ) {
    this.originalExecute = implementation;
  }

  /**
   * Enables or disables passthrough to the real implementation when no mock matches.
   */
  static setPassthrough(enabled: boolean) {
    this.passthroughEnabled = enabled;
  }

  static setMockCommands(commands: MockShellCommand[]) {
    this.mockCommands = commands;
  }

  static reset() {
    this.mockCommands = [];
    this.passthroughEnabled = false;
    this.writeToPty.mockClear();
    this.kill.mockClear();
    this.background.mockClear();
    this.resizePty.mockClear();
    this.scrollPty.mockClear();
  }

  static async execute(
    commandToExecute: string,
    cwd: string,
    onOutputEvent: (event: ShellOutputEvent) => void,
    abortSignal: AbortSignal,
    shouldUseNodePty: boolean,
    shellExecutionConfig: ShellExecutionConfig,
  ): Promise<ShellExecutionHandle> {
    const mock = this.mockCommands.find((m) =>
      typeof m.command === 'string'
        ? m.command === commandToExecute
        : m.command.test(commandToExecute),
    );

    const pid = Math.floor(Math.random() * 10000);

    if (mock) {
      if (mock.events) {
        for (const event of mock.events) {
          onOutputEvent(event);
        }
      }

      const result: ShellExecutionResult = {
        rawOutput: Buffer.from(mock.result.output || ''),
        output: mock.result.output || '',
        exitCode: mock.result.exitCode ?? 0,
        signal: mock.result.signal ?? null,
        error: mock.result.error ?? null,
        aborted: false,
        pid,
        executionMethod: 'none',
        ...mock.result,
      };

      return {
        pid,
        result: Promise.resolve(result),
      };
    }

    if (this.passthroughEnabled && this.originalExecute) {
      return this.originalExecute(
        commandToExecute,
        cwd,
        onOutputEvent,
        abortSignal,
        shouldUseNodePty,
        shellExecutionConfig,
      );
    }

    return {
      pid,
      result: Promise.resolve({
        rawOutput: Buffer.from(''),
        output: `Command not found: ${commandToExecute}`,
        exitCode: 127,
        signal: null,
        error: null,
        aborted: false,
        pid,
        executionMethod: 'none',
      }),
    };
  }

  static writeToPty = vi.fn();
  static isPtyActive = vi.fn(() => false);
  static onExit = vi.fn(() => () => {});
  static kill = vi.fn();
  static background = vi.fn();
  static subscribe = vi.fn(() => () => {});
  static resizePty = vi.fn();
  static scrollPty = vi.fn();
}
