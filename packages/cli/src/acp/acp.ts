/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/* ACP defines a schema for a simple (experimental) JSON-RPC protocol that allows GUI applications to interact with agents. */

import { Icon } from '@google/gemini-cli-core';
import { WritableStream, ReadableStream } from 'node:stream/web';

export class ClientConnection implements Client {
  #connection: Connection<Agent>;

  constructor(
    agent: (client: Client) => Agent,
    input: WritableStream<Uint8Array>,
    output: ReadableStream<Uint8Array>,
  ) {
    this.#connection = new Connection(agent(this), input, output);
  }

  /**
   * Streams part of an assistant response to the client
   */
  async streamAssistantMessageChunk(
    params: StreamAssistantMessageChunkParams,
  ): Promise<void> {
    await this.#connection.sendRequest('streamAssistantMessageChunk', params);
  }

  /**
   * Request confirmation before running a tool
   *
   * When allowed, the client returns a [`ToolCallId`] which can be used
   * to update the tool call's `status` and `content` as it runs.
   */
  requestToolCallConfirmation(
    params: RequestToolCallConfirmationParams,
  ): Promise<RequestToolCallConfirmationResponse> {
    return this.#connection.sendRequest('requestToolCallConfirmation', params);
  }

  /**
   * pushToolCall allows the agent to start a tool call
   * when it does not need to request permission to do so.
   *
   * The returned id can be used to update the UI for the tool
   * call as needed.
   */
  pushToolCall(params: PushToolCallParams): Promise<PushToolCallResponse> {
    return this.#connection.sendRequest('pushToolCall', params);
  }

  /**
   * updateToolCall allows the agent to update the content and status of the tool call.
   *
   * The new content replaces what is currently displayed in the UI.
   *
   * The [`ToolCallId`] is included in the response of
   * `pushToolCall` or `requestToolCallConfirmation` respectively.
   */
  async updateToolCall(params: UpdateToolCallParams): Promise<void> {
    await this.#connection.sendRequest('updateToolCall', params);
  }
}

type AnyMessage = AnyRequest | AnyResponse;

type AnyRequest = {
  id: number;
  method: string;
  params?: unknown;
};

type AnyResponse = { jsonrpc: '2.0'; id: number } & Result<unknown>;

type Result<T> =
  | {
      result: T;
    }
  | {
      error: ErrorResponse;
    };

type ErrorResponse = {
  code: number;
  message: string;
  data?: { details?: string };
};

type PendingResponse = {
  resolve: (response: unknown) => void;
  reject: (error: ErrorResponse) => void;
};

class Connection<D> {
  #pendingResponses: Map<number, PendingResponse> = new Map();
  #nextRequestId: number = 0;
  #delegate: D;
  #peerInput: WritableStream<Uint8Array>;
  #writeQueue: Promise<void> = Promise.resolve();
  #textEncoder: TextEncoder;

  constructor(
    delegate: D,
    peerInput: WritableStream<Uint8Array>,
    peerOutput: ReadableStream<Uint8Array>,
  ) {
    this.#peerInput = peerInput;
    this.#textEncoder = new TextEncoder();

    this.#delegate = delegate;
    this.#receive(peerOutput);
  }

  async #receive(output: ReadableStream<Uint8Array>) {
    let content = '';
    const decoder = new TextDecoder();
    for await (const chunk of output) {
      content += decoder.decode(chunk, { stream: true });
      const lines = content.split('\n');
      content = lines.pop() || '';

      for (const line of lines) {
        const trimmedLine = line.trim();

        if (trimmedLine) {
          const message = JSON.parse(trimmedLine);
          this.#processMessage(message);
        }
      }
    }
  }

  async #processMessage(message: AnyMessage) {
    if ('method' in message) {
      const response = await this.#tryCallDelegateMethod(
        message.method,
        message.params,
      );

      await this.#sendMessage({
        jsonrpc: '2.0',
        id: message.id,
        ...response,
      });
    } else {
      this.#handleResponse(message);
    }
  }

  async #tryCallDelegateMethod(
    method: string,
    params?: unknown,
  ): Promise<Result<unknown>> {
    const methodName = method as keyof D;
    if (typeof this.#delegate[methodName] !== 'function') {
      return RequestError.methodNotFound(method).toResult();
    }

    try {
      const result = await this.#delegate[methodName](params);
      return { result: result ?? null };
    } catch (error: unknown) {
      if (error instanceof RequestError) {
        return error.toResult();
      }

      let details;

      if (error instanceof Error) {
        details = error.message;
      } else if (
        typeof error === 'object' &&
        error != null &&
        'message' in error &&
        typeof error.message === 'string'
      ) {
        details = error.message;
      }

      return RequestError.internalError(details).toResult();
    }
  }

  #handleResponse(response: AnyResponse) {
    const pendingResponse = this.#pendingResponses.get(response.id);
    if (pendingResponse) {
      if ('result' in response) {
        pendingResponse.resolve(response.result);
      } else if ('error' in response) {
        pendingResponse.reject(response.error);
      }
      this.#pendingResponses.delete(response.id);
    }
  }

  async sendRequest<Req, Resp>(method: string, params?: Req): Promise<Resp> {
    const id = this.#nextRequestId++;
    const responsePromise = new Promise((resolve, reject) => {
      this.#pendingResponses.set(id, { resolve, reject });
    });
    await this.#sendMessage({ jsonrpc: '2.0', id, method, params });
    return responsePromise as Promise<Resp>;
  }

  async #sendMessage(json: AnyMessage) {
    const content = JSON.stringify(json) + '\n';
    this.#writeQueue = this.#writeQueue
      .then(async () => {
        const writer = this.#peerInput.getWriter();
        try {
          await writer.write(this.#textEncoder.encode(content));
        } finally {
          writer.releaseLock();
        }
      })
      .catch((error) => {
        // Continue processing writes on error
        console.error('ACP write error:', error);
      });
    return this.#writeQueue;
  }
}

export class RequestError extends Error {
  data?: { details?: string };

  constructor(
    public code: number,
    message: string,
    details?: string,
  ) {
    super(message);
    this.name = 'RequestError';
    if (details) {
      this.data = { details };
    }
  }

  static parseError(details?: string): RequestError {
    return new RequestError(-32700, 'Parse error', details);
  }

  static invalidRequest(details?: string): RequestError {
    return new RequestError(-32600, 'Invalid request', details);
  }

  static methodNotFound(details?: string): RequestError {
    return new RequestError(-32601, 'Method not found', details);
  }

  static invalidParams(details?: string): RequestError {
    return new RequestError(-32602, 'Invalid params', details);
  }

  static internalError(details?: string): RequestError {
    return new RequestError(-32603, 'Internal error', details);
  }

  toResult<T>(): Result<T> {
    return {
      error: {
        code: this.code,
        message: this.message,
        data: this.data,
      },
    };
  }
}

// Protocol types

export const LATEST_PROTOCOL_VERSION = '0.0.9';

export type AssistantMessageChunk =
  | {
      text: string;
    }
  | {
      thought: string;
    };

export type ToolCallConfirmation =
  | {
      description?: string | null;
      type: 'edit';
    }
  | {
      description?: string | null;
      type: 'execute';
      command: string;
      rootCommand: string;
    }
  | {
      description?: string | null;
      type: 'mcp';
      serverName: string;
      toolDisplayName: string;
      toolName: string;
    }
  | {
      description?: string | null;
      type: 'fetch';
      urls: string[];
    }
  | {
      description: string;
      type: 'other';
    };

export type ToolCallContent =
  | {
      type: 'markdown';
      markdown: string;
    }
  | {
      type: 'diff';
      newText: string;
      oldText: string | null;
      path: string;
    };

export type ToolCallStatus = 'running' | 'finished' | 'error';

export type ToolCallId = number;

export type ToolCallConfirmationOutcome =
  | 'allow'
  | 'alwaysAllow'
  | 'alwaysAllowMcpServer'
  | 'alwaysAllowTool'
  | 'reject'
  | 'cancel';

/**
 * A part in a user message
 */
export type UserMessageChunk =
  | {
      text: string;
    }
  | {
      path: string;
    };

export interface StreamAssistantMessageChunkParams {
  chunk: AssistantMessageChunk;
}

export interface RequestToolCallConfirmationParams {
  confirmation: ToolCallConfirmation;
  content?: ToolCallContent | null;
  icon: Icon;
  label: string;
  locations?: ToolCallLocation[];
}

export interface ToolCallLocation {
  line?: number | null;
  path: string;
}

export interface PushToolCallParams {
  content?: ToolCallContent | null;
  icon: Icon;
  label: string;
  locations?: ToolCallLocation[];
}

export interface UpdateToolCallParams {
  content: ToolCallContent | null;
  status: ToolCallStatus;
  toolCallId: ToolCallId;
}

export interface RequestToolCallConfirmationResponse {
  id: ToolCallId;
  outcome: ToolCallConfirmationOutcome;
}

export interface PushToolCallResponse {
  id: ToolCallId;
}

export interface InitializeParams {
  /**
   * The version of the protocol that the client supports.
   * This should be the latest version supported by the client.
   */
  protocolVersion: string;
}

export interface SendUserMessageParams {
  chunks: UserMessageChunk[];
}

export interface InitializeResponse {
  /**
   * Indicates whether the agent is authenticated and
   * ready to handle requests.
   */
  isAuthenticated: boolean;
  /**
   * The version of the protocol that the agent supports.
   * If the agent supports the requested version, it should respond with the same version.
   * Otherwise, the agent should respond with the latest version it supports.
   */
  protocolVersion: string;
}

export interface Error {
  code: number;
  data?: unknown;
  message: string;
}

export interface Client {
  streamAssistantMessageChunk(
    params: StreamAssistantMessageChunkParams,
  ): Promise<void>;

  requestToolCallConfirmation(
    params: RequestToolCallConfirmationParams,
  ): Promise<RequestToolCallConfirmationResponse>;

  pushToolCall(params: PushToolCallParams): Promise<PushToolCallResponse>;

  updateToolCall(params: UpdateToolCallParams): Promise<void>;
}

export interface Agent {
  /**
   * Initializes the agent's state. It should be called before any other method,
   * and no other methods should be called until it has completed.
   *
   * If the agent is not authenticated, then the client should prompt the user to authenticate,
   * and then call the `authenticate` method.
   * Otherwise the client can send other messages to the agent.
   */
  initialize(params: InitializeParams): Promise<InitializeResponse>;

  /**
   * Begins the authentication process.
   *
   * This method should only be called if `initialize` indicates the user isn't already authenticated.
   * The Promise MUST not resolve until authentication is complete.
   */
  authenticate(): Promise<void>;

  /**
   * Allows the user to send a message to the agent.
   * This method should complete after the agent is finished, during
   * which time the agent may update the client by calling
   * streamAssistantMessageChunk and other methods.
   */
  sendUserMessage(params: SendUserMessageParams): Promise<void>;

  /**
   * Cancels the current generation.
   */
  cancelSendMessage(): Promise<void>;
}
