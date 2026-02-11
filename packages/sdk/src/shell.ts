/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config as CoreConfig } from '@google/gemini-cli-core';
import { ShellExecutionService } from '@google/gemini-cli-core';
import type {
  AgentShell,
  AgentShellResult,
  AgentShellOptions,
} from './types.js';

export class SdkAgentShell implements AgentShell {
  constructor(private readonly config: CoreConfig) {}

  async exec(
    command: string,
    options?: AgentShellOptions,
  ): Promise<AgentShellResult> {
    const cwd = options?.cwd || this.config.getWorkingDir();
    const abortController = new AbortController();

    const handle = await ShellExecutionService.execute(
      command,
      cwd,
      () => {}, // No-op output event handler for now
      abortController.signal,
      false, // shouldUseNodePty: false for headless execution
      this.config.getShellExecutionConfig(),
    );

    const result = await handle.result;

    return {
      output: result.output,
      stdout: result.output, // ShellExecutionService combines stdout/stderr usually
      stderr: '', // ShellExecutionService currently combines, so stderr is empty or mixed
      exitCode: result.exitCode,
    };
  }
}
