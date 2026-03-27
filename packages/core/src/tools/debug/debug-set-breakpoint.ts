/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MessageBus } from '../../confirmation-bus/message-bus.js';
import { DEBUG_SET_BREAKPOINT_DEFINITION } from '../definitions/debugTools.js';
import { resolveToolDeclaration } from '../definitions/resolver.js';
import { DEBUG_SET_BREAKPOINT_TOOL_NAME } from '../tool-names.js';
import type { ToolResult } from '../tools.js';
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from '../tools.js';
import {
  getSession,
  formatBreakpoint,
  errorResult,
} from './session-manager.js';

interface SetBreakpointParams {
  file: string;
  breakpoints: Array<{
    line: number;
    condition?: string;
    logMessage?: string;
  }>;
}

class DebugSetBreakpointInvocation extends BaseToolInvocation<
  SetBreakpointParams,
  ToolResult
> {
  getDescription(): string {
    return `Setting breakpoints in ${this.params.file}`;
  }

  override async execute(_signal: AbortSignal): Promise<ToolResult> {
    try {
      const session = getSession();
      const lines = this.params.breakpoints.map((bp) => bp.line);
      const conditions = this.params.breakpoints.map((bp) => bp.condition);
      const logMessages = this.params.breakpoints.map((bp) => bp.logMessage);

      const result = await session.setBreakpoints(
        this.params.file,
        lines,
        conditions,
        logMessages,
      );

      const summary = result.map(formatBreakpoint).join('\n');
      return {
        llmContent: `Breakpoints set in ${this.params.file}:\n${summary}`,
        returnDisplay: `Set ${String(result.length)} breakpoint(s).`,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return errorResult(msg);
    }
  }
}

export class DebugSetBreakpointTool extends BaseDeclarativeTool<
  SetBreakpointParams,
  ToolResult
> {
  static readonly Name = DEBUG_SET_BREAKPOINT_TOOL_NAME;

  constructor(messageBus: MessageBus) {
    super(
      DebugSetBreakpointTool.Name,
      'Debug SetBreakpoint',
      DEBUG_SET_BREAKPOINT_DEFINITION.base.description!,
      Kind.Edit,
      DEBUG_SET_BREAKPOINT_DEFINITION.base.parametersJsonSchema,
      messageBus,
    );
  }

  protected createInvocation(
    params: SetBreakpointParams,
    messageBus: MessageBus,
  ) {
    return new DebugSetBreakpointInvocation(params, messageBus, this.name);
  }

  override getSchema(modelId?: string) {
    return resolveToolDeclaration(DEBUG_SET_BREAKPOINT_DEFINITION, modelId);
  }
}
