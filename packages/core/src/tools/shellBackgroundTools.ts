/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import { ShellExecutionService } from '../services/shellExecutionService.js';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  type ToolResult,
} from './tools.js';
import { ToolErrorType } from './tool-error.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';

// --- list_background_processes ---

class ListBackgroundProcessesInvocation extends BaseToolInvocation<
  Record<string, never>,
  ToolResult
> {
  getDescription(): string {
    return 'Listing background processes';
  }

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    const processes = ShellExecutionService.listBackgroundProcesses();
    if (processes.length === 0) {
      return {
        llmContent: 'No background processes found.',
        returnDisplay: 'No background processes found.',
      };
    }

    const lines = processes.map(
      (p) =>
        `- [PID ${p.pid}] ${p.status.toUpperCase()}: \`${p.command}\`${
          p.exitCode !== undefined ? ` (Exit Code: ${p.exitCode})` : ''
        }${p.signal ? ` (Signal: ${p.signal})` : ''}`,
    );

    const content = lines.join('\n');
    return {
      llmContent: content,
      returnDisplay: content,
    };
  }
}

export class ListBackgroundProcessesTool extends BaseDeclarativeTool<
  Record<string, never>,
  ToolResult
> {
  static readonly Name = 'list_background_processes';

  constructor(messageBus: MessageBus) {
    super(
      ListBackgroundProcessesTool.Name,
      'List Background Processes',
      'Lists all active and recently completed background shell processes orchestrating by the agent.',
      Kind.Read,
      {
        type: 'object',
        properties: {},
      },
      messageBus,
    );
  }

  protected createInvocation(
    params: Record<string, never>,
    messageBus: MessageBus,
  ) {
    return new ListBackgroundProcessesInvocation(params, messageBus, this.name);
  }
}

// --- read_background_output ---

interface ReadBackgroundOutputParams {
  pid: number;
  lines?: number;
}

class ReadBackgroundOutputInvocation extends BaseToolInvocation<
  ReadBackgroundOutputParams,
  ToolResult
> {
  getDescription(): string {
    return `Reading output for background process ${this.params.pid}`;
  }

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    const pid = this.params.pid;

    // Verify process belongs to this session to prevent reading logs of processes from other sessions/users
    const processes = ShellExecutionService.listBackgroundProcesses();
    if (!processes.some((p) => p.pid === pid)) {
      return {
        llmContent: `Access denied. Background process ID ${pid} not found in this session's history.`,
        returnDisplay: 'Access denied.',
        error: {
          message: `Background process history lookup failed for PID ${pid}`,
          type: ToolErrorType.EXECUTION_FAILED,
        },
      };
    }

    const logPath = ShellExecutionService.getLogFilePath(pid);

    try {
      await fs.promises.access(logPath);
    } catch {
      return {
        llmContent: `No output log found for process ID ${pid}. It might not have produced output or was cleaned up.`,
        returnDisplay: `No log found for PID ${pid}`,
        error: {
          message: `Log file not found at ${logPath}`,
          type: ToolErrorType.EXECUTION_FAILED,
        },
      };
    }

    try {
      // Async read to prevent blocking the Node event loop
      const content = await fs.promises.readFile(logPath, 'utf-8');

      if (!content) {
        return {
          llmContent: 'Log is empty.',
          returnDisplay: 'Log is empty.',
        };
      }

      const logLines = content.split('\n');
      if (logLines.length > 0 && logLines[logLines.length - 1] === '') {
        logLines.pop();
      }

      const requestedLinesCount = this.params.lines ?? 100; // Default to 100 lines
      const tailLines = logLines.slice(-requestedLinesCount);
      const output = tailLines.join('\n');

      const header =
        requestedLinesCount < logLines.length
          ? `Showing last ${requestedLinesCount} of ${logLines.length} lines:\n`
          : 'Full Log Output:\n';

      const responseContent = header + output;

      return {
        llmContent: responseContent,
        returnDisplay: responseContent,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        llmContent: `Error reading background log: ${errorMessage}`,
        returnDisplay: 'Failed to read log.',
        error: {
          message: errorMessage,
          type: ToolErrorType.EXECUTION_FAILED,
        },
      };
    }
  }
}

export class ReadBackgroundOutputTool extends BaseDeclarativeTool<
  ReadBackgroundOutputParams,
  ToolResult
> {
  static readonly Name = 'read_background_output';

  constructor(messageBus: MessageBus) {
    super(
      ReadBackgroundOutputTool.Name,
      'Read Background Output',
      'Reads the output log of a background shell process. Support reading tail snapshot.',
      Kind.Read,
      {
        type: 'object',
        properties: {
          pid: {
            type: 'integer',
            description:
              'The process ID (PID) of the background process to inspect.',
          },
          lines: {
            type: 'integer',
            description:
              'Optional. Number of lines to read from the end of the log. Defaults to 100.',
          },
        },
        required: ['pid'],
      },
      messageBus,
    );
  }

  protected createInvocation(
    params: ReadBackgroundOutputParams,
    messageBus: MessageBus,
  ) {
    return new ReadBackgroundOutputInvocation(params, messageBus, this.name);
  }
}
