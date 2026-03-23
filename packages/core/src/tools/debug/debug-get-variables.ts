/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MessageBus } from '../../confirmation-bus/message-bus.js';
import { DEBUG_GET_VARIABLES_DEFINITION } from '../definitions/debugTools.js';
import { resolveToolDeclaration } from '../definitions/resolver.js';
import { DEBUG_GET_VARIABLES_TOOL_NAME } from '../tool-names.js';
import type { ToolResult } from '../tools.js';
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from '../tools.js';
import type { Scope, Variable } from '../../debug/index.js';
import { getSession, formatVariable, errorResult } from './session-manager.js';

interface GetVariablesParams {
  frameIndex?: number;
  threadId?: number;
  variablesReference?: number;
}

class DebugGetVariablesInvocation extends BaseToolInvocation<
  GetVariablesParams,
  ToolResult
> {
  getDescription(): string {
    return 'Getting variables';
  }

  override async execute(_signal: AbortSignal): Promise<ToolResult> {
    try {
      const session = getSession();
      const threadId = this.params.threadId ?? 1;
      const frameIndex = this.params.frameIndex ?? 0;

      // If a specific variablesReference is given, expand it directly
      if (this.params.variablesReference !== undefined) {
        const vars = await session.variables(this.params.variablesReference);
        return {
          llmContent: vars.map(formatVariable).join('\n') || 'No variables.',
          returnDisplay: `${String(vars.length)} variable(s).`,
        };
      }

      // Otherwise, get scopes and variables for the given frame
      const frames = await session.stackTrace(threadId, 0, frameIndex + 1);
      if (frames.length <= frameIndex) {
        return errorResult(
          `Frame index ${String(frameIndex)} out of range (${String(frames.length)} frames available).`,
        );
      }

      const frame = frames[frameIndex];
      const scopes: Scope[] = await session.scopes(frame.id);

      const sections: string[] = [];
      for (const scope of scopes) {
        const vars: Variable[] = await session.variables(
          scope.variablesReference,
        );
        if (vars.length > 0) {
          sections.push(
            `## ${scope.name}\n${vars.map(formatVariable).join('\n')}`,
          );
        }
      }

      const content =
        sections.length > 0
          ? sections.join('\n\n')
          : 'No variables in current scope.';

      return {
        llmContent: content,
        returnDisplay: `${String(scopes.length)} scope(s) inspected.`,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return errorResult(msg);
    }
  }
}

export class DebugGetVariablesTool extends BaseDeclarativeTool<
  GetVariablesParams,
  ToolResult
> {
  static readonly Name = DEBUG_GET_VARIABLES_TOOL_NAME;

  constructor(messageBus: MessageBus) {
    super(
      DebugGetVariablesTool.Name,
      'Debug Variables',
      DEBUG_GET_VARIABLES_DEFINITION.base.description!,
      Kind.Read,
      DEBUG_GET_VARIABLES_DEFINITION.base.parametersJsonSchema,
      messageBus,
    );
  }

  protected createInvocation(
    params: GetVariablesParams,
    messageBus: MessageBus,
  ) {
    return new DebugGetVariablesInvocation(params, messageBus, this.name);
  }

  override getSchema(modelId?: string) {
    return resolveToolDeclaration(DEBUG_GET_VARIABLES_DEFINITION, modelId);
  }
}
