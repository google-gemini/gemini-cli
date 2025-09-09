/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/* ACP defines a schema for a simple (experimental) JSON-RPC protocol that allows GUI applications to interact with agents. */

import { z } from 'zod';
import { EOL } from 'node:os';
import * as schema from './schema.js';
export * from './schema.js';

import type { WritableStream, ReadableStream } from 'node:stream/web';

export class AgentSideConnection implements Client {
  #connection: Connection;

  constructor(
    toAgent: (conn: Client) => Agent,
    input: WritableStream<Uint8Array>,
    output: ReadableStream<Uint8Array>,
  ) {
    const agent = toAgent(this);

    const handler = async (
      method: string,
      params: unknown,
    ): Promise<unknown> => {
      switch (method) {
        case schema.AGENT_METHODS.initialize: {
          const validatedParams = schema.initializeRequestSchema.parse(params);
          return agent.initialize(validatedParams);
        }
        case schema.AGENT_METHODS.session_new: {
          const validatedParams = schema.newSessionRequestSchema.parse(params);
          return agent.newSession(validatedParams);
        }
        case schema.AGENT_METHODS.session_load: {
          if (!agent.loadSession) {
            throw RequestError.methodNotFound();
          }
          const validatedParams = schema.loadSessionRequestSchema.parse(params);
          return agent.loadSession(validatedParams);
        }
        case schema.AGENT_METHODS.authenticate: {
          const validatedParams =
            schema.authenticateRequestSchema.parse(params);
          return agent.authenticate(validatedParams);
        }
        case schema.AGENT_METHODS.session_prompt: {
          const validatedParams = schema.promptRequestSchema.parse(params);
          return agent.prompt(validatedParams);
        }
        case schema.AGENT_METHODS.session_cancel: {
          const validatedParams = schema.cancelNotificationSchema.parse(params);
          return agent.cancel(validatedParams);
        }
        default:
          throw RequestError.methodNotFound(method);
      }
    };

    this.#connection = new Connection(handler, input, output);
  }

  /**
   * Streams new content to the client including text, tool calls, etc.
   */
  async sessionUpdate(params: schema.SessionNotification): Promise<void> {
    return await this.#connection.sendNotification(
      schema.CLIENT_METHODS.session_update,
      params,
    );
  }

  /**
   * Request permission before running a tool
   *
   * The agent specifies a series of permission options with different granularity,
   * and the client returns the chosen one.
   */
  async requestPermission(
    params: schema.RequestPermissionRequest,
  ): Promise<schema.RequestPermissionResponse> {
    return await this.#connection.sendRequest(
      schema.CLIENT_METHODS.session_request_permission,
      params,
    );
  }

  async readTextFile(
    params: schema.ReadTextFileRequest,
  ): Promise<schema.ReadTextFileResponse> {
    return await this.#connection.sendRequest(
      schema.CLIENT_METHODS.fs_read_text_file,
      params,
    );
  }

  async writeTextFile(
    params: schema.WriteTextFileRequest,
  ): Promise<schema.WriteTextFileResponse> {
    return await this.#connection.sendRequest(
      schema.CLIENT_METHODS.fs_write_text_file,
      params,
    );
  }
}

type AnyMessage = AnyRequest | AnyResponse | AnyNotification;

type AnyRequest = {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: unknown;
};

type AnyResponse = {
  jsonrpc: '2.0';
  id: string | number;
} & Result<unknown>;

type AnyNotification = {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
};

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
  data?: unknown;
};

type PendingResponse = {
  resolve: (response: unknown) => void;
  reject: (error: ErrorResponse) => void;
};

type MethodHandler = (method: string, params: unknown) => Promise<unknown>;

class Connection {
  #pendingResponses: Map<string | number, PendingResponse> = new Map();
  #nextRequestId: number = 0;
  #handler: MethodHandler;
  #peerInput: WritableStream<Uint8Array>;
  #writeQueue: Promise<void> = Promise.resolve();
  #textEncoder: TextEncoder;

  constructor(
    handler: MethodHandler,
    peerInput: WritableStream<Uint8Array>,
    peerOutput: ReadableStream<Uint8Array>,
  ) {
    this.#handler = handler;
    this.#peerInput = peerInput;
    this.#textEncoder = new TextEncoder();
    this.#receive(peerOutput);
  }

  async #receive(output: ReadableStream<Uint8Array>) {
    let content = '';
    const decoder = new TextDecoder();
    for await (const chunk of output) {
      content += decoder.decode(chunk, { stream: true });
      const lines = content.split(EOL);
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
    if ('method' in message && 'id' in message) {
      // It's a request
      const response = await this.#tryCallHandler(
        message.method,
        message.params,
      );

      await this.#sendMessage({
        jsonrpc: '2.0',
        id: message.id,
        ...response,
      });
    } else if ('method' in message) {
      // It's a notification
      await this.#tryCallHandler(message.method, message.params);
    } else if ('id' in message) {
      // It's a response
      this.#handleResponse(message as AnyResponse);
    }
  }

  async #tryCallHandler(
    method: string,
    params?: unknown,
  ): Promise<Result<unknown>> {
    try {
      const result = await this.#handler(method, params);
      return { result: result ?? null };
    } catch (error: unknown) {
      if (error instanceof RequestError) {
        return error.toResult();
      }

      if (error instanceof z.ZodError) {
        return RequestError.invalidParams(
          JSON.stringify(error.format(), undefined, 2),
        ).toResult();
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

  async sendNotification<N>(method: string, params?: N): Promise<void> {
    await this.#sendMessage({ jsonrpc: '2.0', method, params });
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

  static authRequired(details?: string): RequestError {
    return new RequestError(-32000, 'Authentication required', details);
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

export interface Client {
  requestPermission(
    params: schema.RequestPermissionRequest,
  ): Promise<schema.RequestPermissionResponse>;
  sessionUpdate(params: schema.SessionNotification): Promise<void>;
  writeTextFile(
    params: schema.WriteTextFileRequest,
  ): Promise<schema.WriteTextFileResponse>;
  readTextFile(
    params: schema.ReadTextFileRequest,
  ): Promise<schema.ReadTextFileResponse>;
}

export interface Agent {
  initialize(
    params: schema.InitializeRequest,
  ): Promise<schema.InitializeResponse>;
  newSession(
    params: schema.NewSessionRequest,
  ): Promise<schema.NewSessionResponse>;
  loadSession?(
    params: schema.LoadSessionRequest,
  ): Promise<schema.LoadSessionResponse>;
  authenticate(params: schema.AuthenticateRequest): Promise<void>;
  prompt(params: schema.PromptRequest): Promise<schema.PromptResponse>;
  cancel(params: schema.CancelNotification): Promise<void>;
}
