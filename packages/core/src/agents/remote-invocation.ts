/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ToolConfirmationOutcome } from '../tools/tools.js';
import {
  BaseToolInvocation,
  type ToolResult,
  type ToolCallConfirmationDetails,
} from '../tools/tools.js';
import { DEFAULT_QUERY_STRING } from './types.js';
import type {
  RemoteAgentInputs,
  RemoteAgentDefinition,
  AgentInputs,
} from './types.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { A2AClientManager } from './a2a-client-manager.js';
import { v4 as uuidv4 } from 'uuid';
import {
  extractMessageText,
  extractTaskText,
  extractIdsFromResponse,
} from './a2aUtils.js';
import { GoogleAuth } from 'google-auth-library';
import type { AuthenticationHandler } from '@a2a-js/sdk/client';
import { debugLogger } from '../utils/debugLogger.js';

/**
 * Authentication handler implementation using Google Application Default Credentials (ADC).
 */
export class ADCHandler implements AuthenticationHandler {
  private auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });

  async headers(): Promise<Record<string, string>> {
    try {
      const client = await this.auth.getClient();
      const token = await client.getAccessToken();
      if (token.token) {
        return { Authorization: `Bearer ${token.token}` };
      }
      throw new Error('Failed to retrieve ADC access token.');
    } catch (e) {
      const errorMessage = `Failed to get ADC token: ${e instanceof Error ? e.message : String(e)
        }`;
      debugLogger.log('ERROR', errorMessage);
      throw new Error(errorMessage);
    }
  }

  async shouldRetryWithHeaders(
    _response: unknown,
  ): Promise<Record<string, string> | undefined> {
    // For ADC, we usually just re-fetch the token if needed.
    return this.headers();
  }
}

/**
 * A tool invocation that proxies to a remote A2A agent.
 *
 * This implementation bypasses the local `LocalAgentExecutor` loop and directly
 * invokes the configured A2A tool.
 */
export class RemoteAgentInvocation extends BaseToolInvocation<
  RemoteAgentInputs,
  ToolResult
> {
  // Persist state across ephemeral invocation instances.
  private static readonly sessionState = new Map<
    string,
    { contextId?: string; taskId?: string }
  >();
  // State for the ongoing conversation with the remote agent
  private contextId: string | undefined;
  private taskId: string | undefined;
  // TODO: See if we can reuse the singleton from AppContainer or similar, but for now use getInstance directly
  // as per the current pattern in the codebase.
  private readonly clientManager = A2AClientManager.getInstance();
  private readonly authHandler = new ADCHandler();

  constructor(
    private readonly definition: RemoteAgentDefinition,
    params: AgentInputs,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ) {
    const query = params['query'] ?? DEFAULT_QUERY_STRING;
    if (typeof query !== 'string') {
      throw new Error(
        `Remote agent '${definition.name}' requires a string 'query' input.`,
      );
    }
    // Safe to pass strict object to super
    super(
      { 
        query, 
        async: typeof params['async'] === 'boolean' ? params['async'] : undefined,
        subscribe: typeof params['subscribe'] === 'boolean' ? params['subscribe'] : undefined,
        sessionId: typeof params['sessionId'] === 'string' ? params['sessionId'] : undefined
      },
      messageBus,
      _toolName ?? definition.name,
      _toolDisplayName ?? definition.displayName,
    );
  }

  getDescription(): string {
    return `Calling remote agent ${this.definition.displayName ?? this.definition.name}`;
  }

  protected override async getConfirmationDetails(
    _abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    // For now, always require confirmation for remote agents until we have a policy system for them.
    return {
      type: 'info',
      title: `Call Remote Agent: ${this.definition.displayName ?? this.definition.name}`,
      prompt: `Calling remote agent: "${this.params.query}"`,
      onConfirm: async (_outcome: ToolConfirmationOutcome) => {
        // Policy updates are now handled centrally by the scheduler
      },
    };
  }

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    // 1. Ensure the agent is loaded (cached by manager)
    // We assume the user has provided an access token via some mechanism (TODO),
    // or we rely on ADC.
    try {
      const isAsync = this.params.async === true;
      
      // Only reuse session state for synchronous conversational turns.
      // Async tasks (parallel workers) should get a fresh context to avoid blocking each other
      // and to allow the proxy to track them as separate sub-agent instances.
      if (!isAsync) {
        const priorState = RemoteAgentInvocation.sessionState.get(
          this.definition.name,
        );
        if (priorState) {
          this.contextId = priorState.contextId;
          this.taskId = priorState.taskId;
        }
      }

      if (this.params.sessionId) {
        this.contextId = this.params.sessionId;
        this.taskId = undefined; // Force a new task in the requested session
      }

      const baseName = this.definition.name.replace(/_\d+$/, '');

      if (!this.clientManager.getClient(baseName)) {
        // Skip ADC authentication for localhost agents (team P2P mesh)
        const agentUrl = this.definition.agentCardUrl ?? '';
        const isLocalAgent = agentUrl.includes('localhost') || agentUrl.includes('127.0.0.1');
        await this.clientManager.loadAgent(
          baseName,
          this.definition.agentCardUrl,
          isLocalAgent ? undefined : this.authHandler,
        );
      }

      const message = this.params.query;

      const isSubscribe = this.params.subscribe === true;
      let pushNotificationUrl = process.env['A2A_WEBHOOK_URL'];

      if (!this.contextId) {
        this.contextId = uuidv4();
      }

      if (isAsync && isSubscribe && pushNotificationUrl) {        const callerName = process.env['CODER_AGENT_NAME'] || 'unknown';
        pushNotificationUrl = `${pushNotificationUrl}?caller=${encodeURIComponent(callerName)}&callee=${encodeURIComponent(baseName)}`;
      }

      console.log(`[RemoteAgentInvocation] Calling sendMessage to ${baseName} (as ${this.definition.name}), async: ${isAsync}, subscribe: ${isSubscribe}`);
      const startMs = Date.now();
      const response = await this.clientManager.sendMessage(
        baseName,
        message,
        {
          contextId: this.contextId,
          taskId: this.taskId,
          blocking: !isAsync,
          pushNotificationUrl: isAsync ? pushNotificationUrl : undefined,
        },
      );
      const elapsedMs = Date.now() - startMs;
      console.log(`[RemoteAgentInvocation] sendMessage returned after ${elapsedMs}ms. Response kind: ${response.kind}`);

      // Extracts IDs, taskID will be undefined if the task is completed/failed/canceled.
      const { contextId, taskId } = extractIdsFromResponse(response);

      this.contextId = contextId ?? this.contextId;
      this.taskId = taskId;

      RemoteAgentInvocation.sessionState.set(this.definition.name, {
        contextId: this.contextId,
        taskId: this.taskId,
      });

      // Extract the output text
      let outputText: string;
      if (isAsync) {
        outputText = `작업이 백그라운드(비동기)로 제출되었습니다. (Task ID: ${taskId}, Session ID: ${this.contextId}).\n작업이 완료되면 시스템 알림(인터럽트)으로 결과를 받게 됩니다. 더 이상 결과를 기다리지 말고 즉시 다음 계획을 진행하세요.\n*참고: 이 백그라운드 워커와 같은 세션(Context)에서 추가 작업을 이어서 시키려면, 다음 호출 때 \`sessionId\` 파라미터로 "${this.contextId}"를 넘겨주세요.*`;
      } else {
        outputText = response.kind === 'task'
          ? extractTaskText(response)
          : response.kind === 'message'
            ? extractMessageText(response)
            : JSON.stringify(response);
      }

      debugLogger.debug(
        `[RemoteAgent] Response from ${this.definition.name}:\n${JSON.stringify(response, null, 2)}`,
      );

      return {
        llmContent: [{ text: outputText }],
        returnDisplay: outputText,
      };
    } catch (error: unknown) {
      const errorMessage = `Error calling remote agent: ${error instanceof Error ? error.message : String(error)}`;
      return {
        llmContent: [{ text: errorMessage }],
        returnDisplay: errorMessage,
        error: { message: errorMessage },
      };
    }
  }
}
