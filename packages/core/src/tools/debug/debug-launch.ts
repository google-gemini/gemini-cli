/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MessageBus } from '../../confirmation-bus/message-bus.js';
import { DEBUG_LAUNCH_DEFINITION } from '../definitions/debugTools.js';
import { resolveToolDeclaration } from '../definitions/resolver.js';
import { DEBUG_LAUNCH_TOOL_NAME } from '../tool-names.js';
import type { ToolResult } from '../tools.js';
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from '../tools.js';
import { DAPClient } from '../../debug/index.js';
import {
  getActiveSession,
  setSession,
  clearSession,
  setLastStopReason,
  formatBreakpoint,
  errorResult,
} from './session-manager.js';

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

class DebugLaunchInvocation extends BaseToolInvocation<
  LaunchParams,
  ToolResult
> {
  getDescription(): string {
    return `Launching debugger for: ${this.params.program}`;
  }

  override async execute(_signal: AbortSignal): Promise<ToolResult> {
    try {
      // Tear down any existing session
      const existing = getActiveSession();
      if (existing) {
        try {
          await existing.disconnect(true);
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
            new Error(
              `Process exited with code ${String(code)} before debugger started`,
            ),
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
        const byFile = new Map<
          string,
          Array<{ line: number; condition?: string }>
        >();
        for (const bp of this.params.breakpoints) {
          const list = byFile.get(bp.file) ?? [];
          list.push({ line: bp.line, condition: bp.condition });
          byFile.set(bp.file, list);
        }

        for (const [file, bps] of byFile) {
          const lines = bps.map((b) => b.line);
          const conditions = bps.map((b) => b.condition);
          const verified = await client.setBreakpoints(file, lines, conditions);
          for (const bp of verified) {
            bpResults.push(formatBreakpoint(bp));
          }
        }
      }

      // Auto-configure exception breakpoints
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
      setLastStopReason('entry');

      // Store child process reference for cleanup
      client.on('terminated', () => {
        try {
          child.kill();
        } catch {
          /* ignore */
        }
        clearSession();
      });

      const bpSummary =
        bpResults.length > 0 ? `\nBreakpoints:\n${bpResults.join('\n')}` : '';

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

export class DebugLaunchTool extends BaseDeclarativeTool<
  LaunchParams,
  ToolResult
> {
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
