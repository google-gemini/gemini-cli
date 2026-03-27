/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MessageBus } from '../../confirmation-bus/message-bus.js';
import { DEBUG_SET_FUNCTION_BREAKPOINT_DEFINITION } from '../definitions/debugTools.js';
import { resolveToolDeclaration } from '../definitions/resolver.js';
import { DEBUG_SET_FUNCTION_BREAKPOINT_TOOL_NAME } from '../tool-names.js';
import type { ToolResult } from '../tools.js';
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from '../tools.js';
import type { Breakpoint } from '../../debug/index.js';
import { getSession, errorResult } from './session-manager.js';

interface FunctionBreakpointParams {
  breakpoints: Array<{
    name: string;
    condition?: string;
    hitCondition?: string;
  }>;
}

class DebugSetFunctionBreakpointInvocation extends BaseToolInvocation<
  FunctionBreakpointParams,
  ToolResult
> {
  getDescription(): string {
    const names = this.params.breakpoints.map((b) => b.name).join(', ');
    return `Setting function breakpoints: ${names}`;
  }

  override async execute(_signal: AbortSignal): Promise<ToolResult> {
    try {
      const session = getSession();

      // Build the DAP setFunctionBreakpoints request body
      const bps = this.params.breakpoints.map((bp) => ({
        name: bp.name,
        condition: bp.condition,
        hitCondition: bp.hitCondition,
      }));

      // Send via DAP protocol
      const response = await session.sendRequest('setFunctionBreakpoints', {
        breakpoints: bps,
      });

      // Format results
      const results: string[] = [];
      const responseObj =
        response != null && typeof response === 'object' ? response : {};
      const rawBps: unknown[] =
        'breakpoints' in responseObj && Array.isArray(responseObj.breakpoints)
          ? (responseObj.breakpoints as unknown[])
          : [];
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- DAP protocol response is untyped
      const responseBps = rawBps as Breakpoint[];

      for (let i = 0; i < responseBps.length; i++) {
        const bp = responseBps[i];
        const name = this.params.breakpoints[i]?.name ?? 'unknown';
        const verified = bp.verified ? '✓' : '✗';
        const cond = this.params.breakpoints[i]?.condition
          ? ` (if: ${this.params.breakpoints[i].condition})`
          : '';
        const hit = this.params.breakpoints[i]?.hitCondition
          ? ` (hit: ${this.params.breakpoints[i].hitCondition})`
          : '';
        results.push(`[${verified}] ${name}${cond}${hit}`);
      }

      const summary =
        results.length > 0
          ? `Function breakpoints set:\n${results.join('\n')}`
          : 'No function breakpoints set.';

      return {
        llmContent: summary,
        returnDisplay: `Set ${String(results.length)} function breakpoint(s)`,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return errorResult(`Failed to set function breakpoints: ${msg}`);
    }
  }
}

export class DebugSetFunctionBreakpointTool extends BaseDeclarativeTool<
  FunctionBreakpointParams,
  ToolResult
> {
  static readonly Name = DEBUG_SET_FUNCTION_BREAKPOINT_TOOL_NAME;

  constructor(messageBus: MessageBus) {
    super(
      DebugSetFunctionBreakpointTool.Name,
      'Debug Function Breakpoint',
      DEBUG_SET_FUNCTION_BREAKPOINT_DEFINITION.base.description!,
      Kind.Edit,
      DEBUG_SET_FUNCTION_BREAKPOINT_DEFINITION.base.parametersJsonSchema,
      messageBus,
    );
  }

  protected createInvocation(
    params: FunctionBreakpointParams,
    messageBus: MessageBus,
  ) {
    return new DebugSetFunctionBreakpointInvocation(
      params,
      messageBus,
      this.name,
    );
  }

  override getSchema(modelId?: string) {
    return resolveToolDeclaration(
      DEBUG_SET_FUNCTION_BREAKPOINT_DEFINITION,
      modelId,
    );
  }
}
