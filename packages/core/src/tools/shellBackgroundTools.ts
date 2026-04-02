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
import type { AgentLoopContext } from '../config/agent-loop-context.js';
import { isNodeError } from '../utils/errors.js';

const MAX_BUFFER_LOAD_CAP_BYTES = 64 * 1024; // Safe 64KB buffer load Cap
const DEFAULT_TAIL_LINES_COUNT = 100;

// --- list_background_processes ---

class ListBackgroundProcessesInvocation extends BaseToolInvocation<
  Record<string, never>,
  ToolResult
> {
  constructor(
    private readonly context: AgentLoopContext,
    params: Record<string, never>,
    messageBus: MessageBus,
    toolName?: string,
    toolDisplayName?: string,
  ) {
    super(params, messageBus, toolName, toolDisplayName);
  }

  getDescription(): string {
    return 'Lists all active and recently completed background processes for the current session.';
  }

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    const processes = ShellExecutionService.listBackgroundProcesses(
      this.context.config.getSessionId(),
    );
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

  constructor(
    private readonly context: AgentLoopContext,
    messageBus: MessageBus,
  ) {
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
    return new ListBackgroundProcessesInvocation(
      this.context,
      params,
      messageBus,
      this.name,
    );
  }
}

// --- read_background_output ---

interface ReadBackgroundOutputParams {
  pid: number;
  lines?: number;
  delay_ms?: number;
}

class ReadBackgroundOutputInvocation extends BaseToolInvocation<
  ReadBackgroundOutputParams,
  ToolResult
> {
  constructor(
    private readonly context: AgentLoopContext,
    params: ReadBackgroundOutputParams,
    messageBus: MessageBus,
    toolName?: string,
    toolDisplayName?: string,
  ) {
    super(params, messageBus, toolName, toolDisplayName);
  }

  getDescription(): string {
    return `Reading output for background process ${this.params.pid}`;
  }

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    const pid = this.params.pid;

    if (this.params.delay_ms && this.params.delay_ms > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.params.delay_ms));
    }

    // Verify process belongs to this session to prevent reading logs of processes from other sessions/users
    const processes = ShellExecutionService.listBackgroundProcesses(
      this.context.config.getSessionId(),
    );
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
      const fileHandle = await fs.promises.open(
        logPath,
        fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW,
      );

      let content = '';
      let position = 0;
      try {
        const stats = await fileHandle.stat();
        const readSize = Math.min(stats.size, MAX_BUFFER_LOAD_CAP_BYTES);
        position = Math.max(0, stats.size - readSize);

        const buffer = Buffer.alloc(readSize);
        await fileHandle.read(buffer, 0, readSize, position);
        content = buffer.toString('utf-8');
      } finally {
        await fileHandle.close();
      }

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

      // Discard first line if we started reading from middle of file to avoid partial lines
      if (position > 0 && logLines.length > 0) {
        logLines.shift();
      }

      const requestedLinesCount = this.params.lines ?? DEFAULT_TAIL_LINES_COUNT;
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
      if (isNodeError(error) && error.code === 'ELOOP') {
        return {
          llmContent:
            'Symbolic link detected at predicted log path. Access is denied for security reasons.',
          returnDisplay: `Symlink detected for PID ${pid}`,
          error: {
            message:
              'Symbolic link detected at predicted log path. Access is denied for security reasons.',
            type: ToolErrorType.EXECUTION_FAILED,
          },
        };
      }
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

  constructor(
    private readonly context: AgentLoopContext,
    messageBus: MessageBus,
  ) {
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
            minimum: 1,
            description:
              'Optional. Number of lines to read from the end of the log. Defaults to 100.',
          },
          delay_ms: {
            type: 'integer',
            description:
              'Optional. Delay in milliseconds to wait before reading the output. Useful to allow the process to start and generate initial output.',
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
    return new ReadBackgroundOutputInvocation(
      this.context,
      params,
      messageBus,
      this.name,
    );
  }
}
