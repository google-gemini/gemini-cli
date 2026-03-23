/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MessageBus } from '../../confirmation-bus/message-bus.js';
import { DEBUG_DISCONNECT_DEFINITION } from '../definitions/debugTools.js';
import { resolveToolDeclaration } from '../definitions/resolver.js';
import { DEBUG_DISCONNECT_TOOL_NAME } from '../tool-names.js';
import type { ToolResult } from '../tools.js';
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from '../tools.js';
import { getSession, clearSession, errorResult } from './session-manager.js';

interface DisconnectParams {
  terminateDebuggee?: boolean;
}

class DebugDisconnectInvocation extends BaseToolInvocation<
  DisconnectParams,
  ToolResult
> {
  getDescription(): string {
    return 'Disconnecting debug session';
  }

  override async execute(_signal: AbortSignal): Promise<ToolResult> {
    try {
      const session = getSession();
      const terminate = this.params.terminateDebuggee ?? true;

      await session.disconnect(terminate);
      clearSession();

      return {
        llmContent: `Debug session ended.${terminate ? ' Debuggee process terminated.' : ''}`,
        returnDisplay: 'Disconnected.',
      };
    } catch (error) {
      // Even on error, clear the session
      clearSession();
      const msg = error instanceof Error ? error.message : String(error);
      return errorResult(msg);
    }
  }
}

export class DebugDisconnectTool extends BaseDeclarativeTool<
  DisconnectParams,
  ToolResult
> {
  static readonly Name = DEBUG_DISCONNECT_TOOL_NAME;

  constructor(messageBus: MessageBus) {
    super(
      DebugDisconnectTool.Name,
      'Debug Disconnect',
      DEBUG_DISCONNECT_DEFINITION.base.description!,
      Kind.Edit,
      DEBUG_DISCONNECT_DEFINITION.base.parametersJsonSchema,
      messageBus,
    );
  }

  protected createInvocation(params: DisconnectParams, messageBus: MessageBus) {
    return new DebugDisconnectInvocation(params, messageBus, this.name);
  }

  override getSchema(modelId?: string) {
    return resolveToolDeclaration(DEBUG_DISCONNECT_DEFINITION, modelId);
  }
}
