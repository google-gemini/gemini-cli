/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, type Mock } from 'vitest';
import {
  AgentSideConnection,
  RequestError,
  type Agent,
  type Client,
} from './acp.js';
import { type ErrorResponse } from './schema.js';
import { type MethodHandler } from './connection.js';
import { ReadableStream, WritableStream } from 'node:stream/web';

const mockConnectionConstructor = vi.hoisted(() =>
  vi.fn<
    (
      arg1: MethodHandler,
      arg2: WritableStream<Uint8Array>,
      arg3: ReadableStream<Uint8Array>,
    ) => { sendRequest: Mock; sendNotification: Mock }
  >(() => ({
    sendRequest: vi.fn(),
    sendNotification: vi.fn(),
  })),
);

vi.mock('./connection.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as object),
    Connection: mockConnectionConstructor,
  };
});

describe('acp', () => {
  describe('RequestError', () => {
    it('should create a parse error', () => {
      const error = RequestError.parseError('details');
      expect(error.code).toBe(-32700);
      expect(error.message).toBe('Parse error');
      expect(error.data?.details).toBe('details');
    });

    it('should create a method not found error', () => {
      const error = RequestError.methodNotFound('details');
      expect(error.code).toBe(-32601);
      expect(error.message).toBe('Method not found');
      expect(error.data?.details).toBe('details');
    });

    it('should convert to a result', () => {
      const error = RequestError.internalError('details');
      const result = error.toResult() as { error: ErrorResponse };
      expect(result.error.code).toBe(-32603);
      expect(result.error.message).toBe('Internal error');
      expect(result.error.data).toEqual({ details: 'details' });
    });
  });

  describe('AgentSideConnection', () => {
    let mockAgent: Agent;

    let toAgent: WritableStream<Uint8Array>;
    let fromAgent: ReadableStream<Uint8Array>;
    let agentSideConnection: AgentSideConnection;
    let connectionInstance: InstanceType<typeof mockConnectionConstructor>;

    beforeEach(() => {
      vi.clearAllMocks();

      const initializeResponse = {
        agentCapabilities: { loadSession: true },
        authMethods: [],
        protocolVersion: 1,
      };
      const newSessionResponse = { sessionId: 'session-1' };
      const loadSessionResponse = { sessionId: 'session-1' };

      mockAgent = {
        initialize: vi.fn().mockResolvedValue(initializeResponse),
        newSession: vi.fn().mockResolvedValue(newSessionResponse),
        loadSession: vi.fn().mockResolvedValue(loadSessionResponse),
        authenticate: vi.fn(),
        prompt: vi.fn(),
        cancel: vi.fn(),
      };

      toAgent = new WritableStream<Uint8Array>();
      fromAgent = new ReadableStream<Uint8Array>();

      agentSideConnection = new AgentSideConnection(
        (_client: Client) => mockAgent,
        toAgent,
        fromAgent,
      );

      // Get the mocked Connection instance
      connectionInstance = mockConnectionConstructor.mock.results[0].value;
    });

    it('should initialize Connection with the correct handler and streams', () => {
      expect(mockConnectionConstructor).toHaveBeenCalledTimes(1);
      expect(mockConnectionConstructor).toHaveBeenCalledWith(
        expect.any(Function),
        toAgent,
        fromAgent,
      );
    });

    it('should call agent.initialize when Connection handler receives initialize method', async () => {
      const initializeParams = {
        clientCapabilities: { fs: { readTextFile: true, writeTextFile: true } },
        protocolVersion: 1,
      };
      const initializeResponse = {
        agentCapabilities: { loadSession: true },
        authMethods: [],
        protocolVersion: 1,
      };
      const handler = mockConnectionConstructor.mock.calls[0][0];
      const result = await handler('initialize', initializeParams);

      expect(mockAgent.initialize).toHaveBeenCalledWith(initializeParams);
      expect(result).toEqual(initializeResponse);
    });

    it('should call agent.newSession when Connection handler receives session_new method', async () => {
      const newSessionParams = { cwd: '/tmp', mcpServers: [] };
      const newSessionResponse = { sessionId: 'session-1' };
      const handler = mockConnectionConstructor.mock.calls[0][0];
      const result = await handler('session/new', newSessionParams);

      expect(mockAgent.newSession).toHaveBeenCalledWith(newSessionParams);
      expect(result).toEqual(newSessionResponse);
    });

    it('should call agent.loadSession when Connection handler receives session_load method', async () => {
      const loadSessionParams = {
        cwd: '/tmp',
        mcpServers: [],
        sessionId: 'session-1',
      };
      const loadSessionResponse = { sessionId: 'session-1' };
      const handler = mockConnectionConstructor.mock.calls[0][0];
      const result = await handler('session/load', loadSessionParams);

      expect(mockAgent.loadSession).toHaveBeenCalledWith(loadSessionParams);
      expect(result).toEqual(loadSessionResponse);
    });

    it('should throw methodNotFound if agent.loadSession is not implemented', async () => {
      mockAgent.loadSession = undefined; // Simulate not implemented
      const loadSessionParams = {
        cwd: '/tmp',
        mcpServers: [],
        sessionId: 'session-1',
      };
      const handler = mockConnectionConstructor.mock.calls[0][0];
      await expect(handler('session/load', loadSessionParams)).rejects.toThrow(
        RequestError.methodNotFound().message,
      );
    });

    it('should call agent.authenticate when Connection handler receives authenticate method', async () => {
      const authenticateParams = {
        methodId: 'test-auth-method',
      };
      const handler = mockConnectionConstructor.mock.calls[0][0];
      const result = await handler('authenticate', authenticateParams);

      expect(mockAgent.authenticate).toHaveBeenCalledWith(authenticateParams);
      expect(result).toBeUndefined();
    });

    it('should call agent.prompt when Connection handler receives session_prompt method', async () => {
      const promptParams = {
        prompt: [{ type: 'text', text: 'hi' }],
        sessionId: 'session-1',
      };
      const promptResponse = {
        response: [{ type: 'text', text: 'hello' }],
        traceId: 'trace-1',
      };
      (mockAgent.prompt as Mock).mockResolvedValue(promptResponse);
      const handler = mockConnectionConstructor.mock.calls[0][0];
      const result = await handler('session/prompt', promptParams);

      expect(mockAgent.prompt).toHaveBeenCalledWith(promptParams);
      expect(result).toEqual(promptResponse);
    });

    it('should call agent.cancel when Connection handler receives session_cancel method', async () => {
      const cancelParams = { sessionId: 'session-1' };
      const handler = mockConnectionConstructor.mock.calls[0][0];
      const result = await handler('session/cancel', cancelParams);

      expect(mockAgent.cancel).toHaveBeenCalledWith(cancelParams);
      expect(result).toBeUndefined();
    });

    it('should throw methodNotFound for unknown methods', async () => {
      const handler = mockConnectionConstructor.mock.calls[0][0];
      await expect(handler('unknown_method', {})).rejects.toThrow(
        RequestError.methodNotFound().message,
      );
    });

    it('should send sessionUpdate notification via connection', async () => {
      const params = {
        sessionId: '123',
        update: {
          sessionUpdate: 'user_message_chunk' as const,
          content: { type: 'text' as const, text: 'hello' },
        },
      };
      await agentSideConnection.sessionUpdate(params);
    });

    it('should send requestPermission request via connection', async () => {
      const params = {
        sessionId: '123',
        toolCall: {
          toolCallId: 'tool-1',
          title: 'Test Tool',
          kind: 'other' as const,
          status: 'pending' as const,
        },
        options: [
          {
            optionId: 'option-1',
            name: 'Allow',
            kind: 'allow_once' as const,
          },
        ],
      };
      const response = {
        outcome: { outcome: 'selected', optionId: 'option-1' },
      };
      connectionInstance.sendRequest.mockResolvedValue(response);

      const result = await agentSideConnection.requestPermission(params);
      expect(connectionInstance.sendRequest).toHaveBeenCalledWith(
        'session/request_permission',
        params,
      );
      expect(result).toEqual(response);
    });

    it('should send readTextFile request via connection', async () => {
      const params = { path: '/a/b.txt', sessionId: 'session-1' };
      const response = { content: 'file content' };
      connectionInstance.sendRequest.mockResolvedValue(response);

      const result = await agentSideConnection.readTextFile(params);
      expect(connectionInstance.sendRequest).toHaveBeenCalledWith(
        'fs/read_text_file',
        params,
      );
      expect(result).toEqual(response);
    });

    it('should send writeTextFile request via connection', async () => {
      const params = {
        path: '/a/b.txt',
        content: 'new content',
        sessionId: 'session-1',
      };
      const response = { success: true };
      connectionInstance.sendRequest.mockResolvedValue(response);

      const result = await agentSideConnection.writeTextFile(params);
      expect(connectionInstance.sendRequest).toHaveBeenCalledWith(
        'fs/write_text_file',
        params,
      );
      expect(result).toEqual(response);
    });
  });
});
