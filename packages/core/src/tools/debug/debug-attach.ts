/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MessageBus } from '../../confirmation-bus/message-bus.js';
import { DEBUG_ATTACH_DEFINITION } from '../definitions/debugTools.js';
import { resolveToolDeclaration } from '../definitions/resolver.js';
import { DEBUG_ATTACH_TOOL_NAME } from '../tool-names.js';
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

interface AttachParams {
  port: number;
  host?: string;
  breakpoints?: Array<{
    file: string;
    line: number;
    condition?: string;
  }>;
}

class DebugAttachInvocation extends BaseToolInvocation<
  AttachParams,
  ToolResult
> {
  getDescription(): string {
    const host = this.params.host ?? '127.0.0.1';
    return `Attaching debugger to ${host}:${String(this.params.port)}`;
  }

  override async execute(_signal: AbortSignal): Promise<ToolResult> {
    try {
      // Tear down any existing session
      const existing = getActiveSession();
      if (existing) {
        try {
          await existing.disconnect(false);
        } catch {
          // Ignore cleanup errors
        }
        clearSession();
      }

      const host = this.params.host ?? '127.0.0.1';
      const port = this.params.port;

      // Connect DAP client to existing process
      const client = new DAPClient(15000);
      await client.connect(port, host);
      await client.initialize();

      // For attach mode, we don't call launch — the process is already running
      await client.configurationDone();

      setSession(client);
      setLastStopReason('attach');

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

      const parts = [`Attached to process at ${host}:${String(port)}.`];

      if (bpResults.length > 0) {
        parts.push(`\nBreakpoints:\n${bpResults.join('\n')}`);
      }

      return {
        llmContent: parts.join(''),
        returnDisplay: `Attached to ${host}:${String(port)}`,
      };
    } catch (error) {
      clearSession();
      const msg = error instanceof Error ? error.message : String(error);
      return errorResult(`Failed to attach: ${msg}`);
    }
  }
}

export class DebugAttachTool extends BaseDeclarativeTool<
  AttachParams,
  ToolResult
> {
  static readonly Name = DEBUG_ATTACH_TOOL_NAME;

  constructor(messageBus: MessageBus) {
    super(
      DebugAttachTool.Name,
      'Debug Attach',
      DEBUG_ATTACH_DEFINITION.base.description!,
      Kind.Edit,
      DEBUG_ATTACH_DEFINITION.base.parametersJsonSchema,
      messageBus,
    );
  }

  protected createInvocation(params: AttachParams, messageBus: MessageBus) {
    return new DebugAttachInvocation(params, messageBus, this.name);
  }

  override getSchema(modelId?: string) {
    return resolveToolDeclaration(DEBUG_ATTACH_DEFINITION, modelId);
  }
}
