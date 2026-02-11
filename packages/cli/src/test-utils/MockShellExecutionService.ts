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
} from '@google/gemini-cli-core';

export interface MockShellCommand {
  command: string | RegExp;
  result: Partial<ShellExecutionResult>;
  events?: ShellOutputEvent[];
}

export class MockShellExecutionService {
  private static mockCommands: MockShellCommand[] = [];

  static setMockCommands(commands: MockShellCommand[]) {
    this.mockCommands = commands;
  }

  static async execute(
    commandToExecute: string,
    _cwd: string,
    onOutputEvent: (event: ShellOutputEvent) => void,
    _abortSignal: AbortSignal,
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
