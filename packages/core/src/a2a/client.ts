/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { fetch } from 'undici';
import crypto from 'crypto';
import type {
  A2AClientConfig,
  Agent,
  MessageSendParams,
  Message,
  Task,
  JSONRPCRequest,
  JSONRPCResponse,
} from './types.js';

export class A2AClient {
  private readonly config: A2AClientConfig;

  constructor(config: A2AClientConfig) {
    this.config = config;
  }

  async sendMessage(params: MessageSendParams): Promise<Task | Message> {
    const request: JSONRPCRequest = {
      jsonrpc: '2.0',
      id: crypto.randomUUID(),
      method: 'message/send',
      params: params as Record<string, unknown>,
    };

    const response = await this.sendRequest(request);

    if (response.error) {
      throw new Error(
        `A2A Error ${response.error.code}: ${response.error.message}`,
      );
    }

    const result = response.result;
    if (!this.isTaskOrMessage(result)) {
      throw new Error('Invalid response format: expected Task or Message');
    }

    return result;
  }

  private async discoverEndpoint(): Promise<string> {
    const url = new URL(this.config.baseUrl);
    url.pathname = '/.well-known/agent.json';

    try {
      const response = await fetch(url.toString());
      if (response.ok) {
        let agentJson: unknown;
        try {
          // Parsing user-controlled JSON can throw if the body is not valid JSON.
          agentJson = await response.json();
        } catch (e) {
          console.warn(
            `Failed to parse agent.json response: ${(e as Error).message}. Falling back to base URL.`,
          );
          return this.config.baseUrl;
        }

        // Validate the structure before accessing nested properties to avoid
        // runtime TypeError crashes and potential DoS vectors.
        if (this.isAgent(agentJson)) {
          return agentJson.a2a.url;
        }
        console.warn(
          'agent.json did not match expected schema. Falling back to base URL.',
        );
      }
    } catch (e) {
      // Fall through to using the base URL.
      const error = e as Error;
      console.warn(
        `A2A endpoint discovery failed: ${error.message}. Falling back to base URL.`,
      );
    }

    return this.config.baseUrl;
  }

  private async sendRequest(request: JSONRPCRequest): Promise<JSONRPCResponse> {
    const endpoint = await this.discoverEndpoint();
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(
        `Request failed: ${response.status} ${response.statusText}`,
      );
    }

    try {
      const json = await response.json();
      if (!this.isJSONRPCResponse(json)) {
        throw new Error('Invalid JSON-RPC response format');
      }
      return json;
    } catch (e) {
      throw new Error(`Failed to parse JSON response: ${(e as Error).message}`);
    }
  }

  private isJSONRPCResponse(value: unknown): value is JSONRPCResponse {
    if (typeof value !== 'object' || value === null) {
      return false;
    }
    const resp = value as JSONRPCResponse;
    return (
      resp.jsonrpc === '2.0' &&
      ('result' in resp || 'error' in resp) &&
      'id' in resp
    );
  }

  private isTask(value: unknown): value is Task {
    return (
      typeof value === 'object' &&
      value !== null &&
      'kind' in value &&
      value.kind === 'task'
    );
  }

  private isMessage(value: unknown): value is Message {
    return (
      typeof value === 'object' &&
      value !== null &&
      'kind' in value &&
      value.kind === 'message'
    );
  }

  private isTaskOrMessage(value: unknown): value is Task | Message {
    return this.isTask(value) || this.isMessage(value);
  }

  // Type-guard to validate the expected Agent structure from agent.json.
  private isAgent(value: unknown): value is Agent {
    if (typeof value !== 'object' || value === null) {
      return false;
    }
    const maybeAgent = value as Record<string, unknown>;
    const a2a = maybeAgent['a2a'];
    if (typeof a2a !== 'object' || a2a === null) {
      return false;
    }
    const url = (a2a as Record<string, unknown>)['url'];
    return typeof url === 'string' && url.length > 0;
  }
}
