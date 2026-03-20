/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type ShellExecutionResult } from '../services/shellExecutionService.js';
import { type ShellToolParams } from './shell.js';

export interface FormatShellOutputOptions {
  params: ShellToolParams;
  result: ShellExecutionResult;
  debugMode: boolean;
  timeoutMessage?: string;
  backgroundPIDs: number[];
  summarizedOutput?: string;
  isAiMode: boolean;
}

export interface FormattedShellOutput {
  llmContent: string;
  returnDisplay: string;
  data: Record<string, unknown>;
}

export function formatShellOutput(
  options: FormatShellOutputOptions,
): FormattedShellOutput {
  const {
    params,
    result,
    debugMode,
    timeoutMessage,
    backgroundPIDs,
    summarizedOutput,
  } = options;

  let llmContent = '';
  let data: Record<string, unknown> = {};

  if (result.aborted) {
    llmContent = timeoutMessage || 'Command cancelled by user.';
    if (result.output.trim()) {
      llmContent += ` Below is the output before it was cancelled:\n${result.output}`;
    } else {
      llmContent += ' There was no output before it was cancelled.';
    }
  } else if (params.is_background || result.backgrounded) {
    const isAutoPromoted = result.backgrounded && !params.is_background;
    if (isAutoPromoted) {
      llmContent = `Command auto-promoted to background (PID: ${result.pid}). The process is still running. To check its screen state, call the read_shell tool with pid ${result.pid}. To send input or keystrokes, call the write_to_shell tool with pid ${result.pid}. If the process does not exit on its own when done, kill it with write_to_shell using special_keys=["Ctrl-C"].`;
    } else {
      llmContent = `Command moved to background (PID: ${result.pid}). Output hidden. Press Ctrl+B to view.`;
    }
    data = {
      pid: result.pid,
      command: params.command,
      directory: params.dir_path,
      backgrounded: true,
    };
  } else {
    const llmContentParts: string[] = [];

    let content = summarizedOutput ?? result.output.trim();
    if (!content) {
      content = '(empty)';
    }

    llmContentParts.push(`Output: ${content}`);

    if (result.error) {
      llmContentParts.push(`Error: ${result.error.message}`);
    }

    if (result.exitCode !== null && result.exitCode !== 0) {
      llmContentParts.push(`Exit Code: ${result.exitCode}`);
    }
    if (result.signal !== null) {
      llmContentParts.push(`Signal: ${result.signal}`);
    }
    if (backgroundPIDs.length) {
      llmContentParts.push(`Background PIDs: ${backgroundPIDs.join(', ')}`);
    }
    if (result.pid) {
      llmContentParts.push(`Process Group PGID: ${result.pid}`);
    }

    llmContent = llmContentParts.join('\n');
  }

  let returnDisplay = '';
  if (debugMode) {
    returnDisplay = llmContent;
  } else {
    if (params.is_background || result.backgrounded) {
      const isAutoPromotedDisplay =
        result.backgrounded && !params.is_background;
      if (isAutoPromotedDisplay) {
        returnDisplay = `Command auto-promoted to background (PID: ${result.pid}).`;
      } else {
        returnDisplay = `Command moved to background (PID: ${result.pid}). Output hidden. Press Ctrl+B to view.`;
      }
    } else if (result.aborted) {
      const cancelMsg = timeoutMessage || 'Command cancelled by user.';
      if (result.output.trim()) {
        returnDisplay = `${cancelMsg}\n\nOutput before cancellation:\n${result.output}`;
      } else {
        returnDisplay = cancelMsg;
      }
    } else if (result.error) {
      returnDisplay = `Command failed: ${result.error.message}`;
    } else if (result.exitCode !== 0 && result.exitCode !== null) {
      returnDisplay = `Command exited with code ${result.exitCode}`;
      if (result.output.trim()) {
        returnDisplay += `\n\n${result.output}`;
      }
    } else if (summarizedOutput) {
      returnDisplay = `Command succeeded. Output summarized:\n${summarizedOutput}`;
    } else {
      returnDisplay = `Command succeeded.`;
      if (result.output.trim()) {
        returnDisplay += `\n\n${result.output}`;
      }
    }
  }

  return { llmContent, returnDisplay, data };
}
