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
      const errorMessage = `Failed to get ADC token: ${
        e instanceof Error ? e.message : String(e)
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
 * Authentication handler for OAuth 2.0 Client Credentials flow.
 * Used for service-to-service authentication without user interaction.
 */
export class ClientCredentialsAuthHandler implements AuthenticationHandler {
  private accessToken: string | null = null;
  private tokenExpiresAt: number | null = null;

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly tokenUrl: string,
    private readonly scopes?: string[],
    private readonly audience?: string,
  ) {}

  async headers(): Promise<Record<string, string>> {
    // Check if we have a valid token
    if (
      this.accessToken &&
      this.tokenExpiresAt &&
      Date.now() < this.tokenExpiresAt
    ) {
      return { Authorization: `Bearer ${this.accessToken}` };
    }

    // Fetch new token
    try {
      const params = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: this.clientId,
        client_secret: this.clientSecret,
      });

      if (this.scopes && this.scopes.length > 0) {
        params.append('scope', this.scopes.join(' '));
      }

      if (this.audience) {
        params.append('audience', this.audience);
      }

      const response = await fetch(this.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `OAuth Client Credentials token request failed: ${response.status} - ${errorText}`,
        );
      }

      const tokenData = (await response.json()) as {
        access_token: string;
        expires_in?: number;
      };

      if (!tokenData.access_token) {
        throw new Error('No access token in response');
      }

      this.accessToken = tokenData.access_token;
      if (tokenData.expires_in) {
        // Set expiry with 60 second buffer
        this.tokenExpiresAt = Date.now() + (tokenData.expires_in - 60) * 1000;
      }

      return { Authorization: `Bearer ${this.accessToken}` };
    } catch (e) {
      const errorMessage = `Failed to get OAuth Client Credentials token: ${
        e instanceof Error ? e.message : String(e)
      }`;
      debugLogger.log('ERROR', errorMessage);
      throw new Error(errorMessage);
    }
  }

  async shouldRetryWithHeaders(
    _response: unknown,
  ): Promise<Record<string, string> | undefined> {
    // Invalidate current token and fetch new one
    this.accessToken = null;
    this.tokenExpiresAt = null;
    return this.headers();
  }
}

/**
 * Authentication handler for Mutual TLS (mTLS) certificate-based authentication.
 * Note: mTLS authentication is handled at the transport layer (HTTPS agent),
 * not via HTTP headers. This handler is used for API compatibility.
 */
export class MTLSAuthHandler implements AuthenticationHandler {
  constructor(
    private readonly certPath: string,
    private readonly keyPath: string,
    private readonly passphrase?: string,
  ) {}

  async headers(): Promise<Record<string, string>> {
    // mTLS uses certificates at transport level, not headers
    // Return empty object for API compatibility
    return {};
  }

  async shouldRetryWithHeaders(
    _response: unknown,
  ): Promise<Record<string, string> | undefined> {
    // No retry logic for mTLS - certificate validation happens at TLS handshake
    return undefined;
  }

  /**
   * Get the certificate configuration for creating an HTTPS agent.
   */
  getCertConfig(): { certPath: string; keyPath: string; passphrase?: string } {
    return {
      certPath: this.certPath,
      keyPath: this.keyPath,
      passphrase: this.passphrase,
    };
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
  private readonly authHandler: AuthenticationHandler;

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
      { query },
      messageBus,
      _toolName ?? definition.name,
      _toolDisplayName ?? definition.displayName,
    );

    // Select authentication handler based on configuration
    const authType = definition.authentication?.type || 'adc';

    switch (authType) {
      case 'oauth_client_credentials':
        if (
          !definition.authentication?.clientId ||
          !definition.authentication?.clientSecret ||
          !definition.authentication?.tokenUrl
        ) {
          throw new Error(
            `Remote agent '${definition.name}' configured for OAuth Client Credentials but missing required fields (clientId, clientSecret, tokenUrl)`,
          );
        }
        this.authHandler = new ClientCredentialsAuthHandler(
          definition.authentication.clientId,
          definition.authentication.clientSecret,
          definition.authentication.tokenUrl,
          definition.authentication.scopes,
          definition.authentication.audience,
        );
        debugLogger.debug(
          `Remote agent '${definition.name}' using OAuth Client Credentials authentication`,
        );
        break;

      case 'mtls':
        if (
          !definition.authentication?.certPath ||
          !definition.authentication?.keyPath
        ) {
          throw new Error(
            `Remote agent '${definition.name}' configured for mTLS but missing required fields (certPath, keyPath)`,
          );
        }
        this.authHandler = new MTLSAuthHandler(
          definition.authentication.certPath,
          definition.authentication.keyPath,
          definition.authentication.passphrase,
        );
        debugLogger.debug(
          `Remote agent '${definition.name}' using mTLS certificate authentication`,
        );
        break;

      case 'adc':
      default:
        this.authHandler = new ADCHandler();
        debugLogger.debug(
          `Remote agent '${definition.name}' using Application Default Credentials`,
        );
        break;
    }
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
      onConfirm: async (outcome: ToolConfirmationOutcome) => {
        await this.publishPolicyUpdate(outcome);
      },
    };
  }

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    // 1. Ensure the agent is loaded (cached by manager)
    // We assume the user has provided an access token via some mechanism (TODO),
    // or we rely on ADC.
    try {
      const priorState = RemoteAgentInvocation.sessionState.get(
        this.definition.name,
      );
      if (priorState) {
        this.contextId = priorState.contextId;
        this.taskId = priorState.taskId;
      }

      if (!this.clientManager.getClient(this.definition.name)) {
        await this.clientManager.loadAgent(
          this.definition.name,
          this.definition.agentCardUrl,
          this.authHandler,
        );
      }

      const message = this.params.query;

      const response = await this.clientManager.sendMessage(
        this.definition.name,
        message,
        {
          contextId: this.contextId,
          taskId: this.taskId,
        },
      );

      // Extracts IDs, taskID will be undefined if the task is completed/failed/canceled.
      const { contextId, taskId } = extractIdsFromResponse(response);

      this.contextId = contextId ?? this.contextId;
      this.taskId = taskId;

      RemoteAgentInvocation.sessionState.set(this.definition.name, {
        contextId: this.contextId,
        taskId: this.taskId,
      });

      // Extract the output text
      const outputText =
        response.kind === 'task'
          ? extractTaskText(response)
          : response.kind === 'message'
            ? extractMessageText(response)
            : JSON.stringify(response);

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
