/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mocked,
} from 'vitest';
import { IdeClient, IDEConnectionStatus } from './ide-client.js';
import type * as fs from 'node:fs';
import { getIdeProcessInfo } from './process-utils.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { detectIde, IDE_DEFINITIONS } from './detect-ide.js';
import * as os from 'node:os';

import {
  getConnectionConfigFromFile,
  getStdioConfigFromEnv,
  getPortFromEnv,
  validateWorkspacePath,
  getIdeServerHost,
} from './ide-connection-utils.js';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof fs>();
  return {
    ...(actual as object),
    promises: {
      ...actual.promises,
      readFile: vi.fn(),
      readdir: vi.fn(),
    },
    realpathSync: (p: string) => p,
    existsSync: vi.fn(() => false),
  };
});
vi.mock('./process-utils.js');
vi.mock('@modelcontextprotocol/sdk/client/index.js');
vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js');
vi.mock('@modelcontextprotocol/sdk/client/stdio.js');
vi.mock('./detect-ide.js');
vi.mock('node:os');
vi.mock('./ide-connection-utils.js');

describe('IdeClient', () => {
  let mockClient: Mocked<Client>;
  let mockHttpTransport: Mocked<StreamableHTTPClientTransport>;
  let mockStdioTransport: Mocked<StdioClientTransport>;

  beforeEach(async () => {
    // Reset singleton instance for test isolation
    (IdeClient as unknown as { instance: IdeClient | undefined }).instance =
      undefined;

    // Mock environment variables
    process.env['GEMINI_CLI_IDE_WORKSPACE_PATH'] = '/test/workspace';
    delete process.env['GEMINI_CLI_IDE_SERVER_PORT'];
    delete process.env['GEMINI_CLI_IDE_SERVER_STDIO_COMMAND'];
    delete process.env['GEMINI_CLI_IDE_SERVER_STDIO_ARGS'];
    delete process.env['GEMINI_CLI_IDE_AUTH_TOKEN'];

    // Mock dependencies
    vi.spyOn(process, 'cwd').mockReturnValue('/test/workspace/sub-dir');
    vi.mocked(detectIde).mockReturnValue(IDE_DEFINITIONS.vscode);
    vi.mocked(getIdeProcessInfo).mockResolvedValue({
      pid: 12345,
      command: 'test-ide',
    });
    vi.mocked(os.tmpdir).mockReturnValue('/tmp');
    vi.mocked(getIdeServerHost).mockReturnValue('127.0.0.1');

    // Mock MCP client and transports
    mockClient = {
      connect: vi.fn().mockResolvedValue(undefined),
      close: vi.fn(),
      setNotificationHandler: vi.fn(),
      callTool: vi.fn(),
      request: vi.fn(),
    } as unknown as Mocked<Client>;
    mockHttpTransport = {
      close: vi.fn(),
    } as unknown as Mocked<StreamableHTTPClientTransport>;
    mockStdioTransport = {
      close: vi.fn(),
    } as unknown as Mocked<StdioClientTransport>;

    vi.mocked(Client).mockReturnValue(mockClient);
    vi.mocked(StreamableHTTPClientTransport).mockReturnValue(mockHttpTransport);
    vi.mocked(StdioClientTransport).mockReturnValue(mockStdioTransport);

    await IdeClient.getInstance();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('connect', () => {
    it('should connect using HTTP when port is provided in config file', async () => {
      const config = { port: '8080' };
      vi.mocked(getConnectionConfigFromFile).mockResolvedValue(config);
      vi.mocked(validateWorkspacePath).mockReturnValue({ isValid: true });

      const ideClient = await IdeClient.getInstance();
      await ideClient.connect();

      expect(getConnectionConfigFromFile).toHaveBeenCalledWith(12345);
      expect(StreamableHTTPClientTransport).toHaveBeenCalledWith(
        new URL('http://127.0.0.1:8080/mcp'),
        expect.any(Object),
      );
      expect(mockClient.connect).toHaveBeenCalledWith(mockHttpTransport);
      expect(ideClient.getConnectionStatus().status).toBe(
        IDEConnectionStatus.Connected,
      );
    });

    it('should connect using stdio when stdio config is provided in file', async () => {
      // Update the mock to use the new utility
      const config = { stdio: { command: 'test-cmd', args: ['--foo'] } };
      vi.mocked(getConnectionConfigFromFile).mockResolvedValue(config);
      vi.mocked(validateWorkspacePath).mockReturnValue({ isValid: true });

      const ideClient = await IdeClient.getInstance();
      await ideClient.connect();

      expect(StdioClientTransport).toHaveBeenCalledWith({
        command: 'test-cmd',
        args: ['--foo'],
      });
      expect(mockClient.connect).toHaveBeenCalledWith(mockStdioTransport);
      expect(ideClient.getConnectionStatus().status).toBe(
        IDEConnectionStatus.Connected,
      );
    });

    it('should prioritize port over stdio when both are in config file', async () => {
      const config = {
        port: '8080',
        stdio: { command: 'test-cmd', args: ['--foo'] },
      };
      vi.mocked(getConnectionConfigFromFile).mockResolvedValue(config);
      vi.mocked(validateWorkspacePath).mockReturnValue({ isValid: true });

      const ideClient = await IdeClient.getInstance();
      await ideClient.connect();

      expect(StreamableHTTPClientTransport).toHaveBeenCalled();
      expect(StdioClientTransport).not.toHaveBeenCalled();
      expect(ideClient.getConnectionStatus().status).toBe(
        IDEConnectionStatus.Connected,
      );
    });

    it('should connect using HTTP when port is provided in environment variables', async () => {
      vi.mocked(getConnectionConfigFromFile).mockResolvedValue(undefined);
      vi.mocked(validateWorkspacePath).mockReturnValue({ isValid: true });
      vi.mocked(getPortFromEnv).mockReturnValue('9090');

      const ideClient = await IdeClient.getInstance();
      await ideClient.connect();

      expect(StreamableHTTPClientTransport).toHaveBeenCalledWith(
        new URL('http://127.0.0.1:9090/mcp'),
        expect.any(Object),
      );
      expect(mockClient.connect).toHaveBeenCalledWith(mockHttpTransport);
      expect(ideClient.getConnectionStatus().status).toBe(
        IDEConnectionStatus.Connected,
      );
    });

    it('should connect using stdio when stdio config is in environment variables', async () => {
      vi.mocked(getConnectionConfigFromFile).mockResolvedValue(undefined);
      vi.mocked(validateWorkspacePath).mockReturnValue({ isValid: true });
      vi.mocked(getStdioConfigFromEnv).mockReturnValue({
        command: 'env-cmd',
        args: ['--bar'],
      });

      const ideClient = await IdeClient.getInstance();
      await ideClient.connect();

      expect(StdioClientTransport).toHaveBeenCalledWith({
        command: 'env-cmd',
        args: ['--bar'],
      });
      expect(mockClient.connect).toHaveBeenCalledWith(mockStdioTransport);
      expect(ideClient.getConnectionStatus().status).toBe(
        IDEConnectionStatus.Connected,
      );
    });

    it('should prioritize file config over environment variables', async () => {
      const config = { port: '8080' };
      vi.mocked(getConnectionConfigFromFile).mockResolvedValue(config);
      vi.mocked(validateWorkspacePath).mockReturnValue({ isValid: true });
      vi.mocked(getPortFromEnv).mockReturnValue('9090');

      const ideClient = await IdeClient.getInstance();
      await ideClient.connect();

      expect(StreamableHTTPClientTransport).toHaveBeenCalledWith(
        new URL('http://127.0.0.1:8080/mcp'),
        expect.any(Object),
      );
      expect(ideClient.getConnectionStatus().status).toBe(
        IDEConnectionStatus.Connected,
      );
    });

    it('should be disconnected if no config is found', async () => {
      vi.mocked(getConnectionConfigFromFile).mockResolvedValue(undefined);
      vi.mocked(validateWorkspacePath).mockReturnValue({ isValid: true });

      const ideClient = await IdeClient.getInstance();
      await ideClient.connect();

      expect(StreamableHTTPClientTransport).not.toHaveBeenCalled();
      expect(StdioClientTransport).not.toHaveBeenCalled();
      expect(ideClient.getConnectionStatus().status).toBe(
        IDEConnectionStatus.Disconnected,
      );
      expect(ideClient.getConnectionStatus().details).toContain(
        'Failed to connect',
      );
    });
  });

  describe('isDiffingEnabled', () => {
    it('should return false if not connected', async () => {
      const ideClient = await IdeClient.getInstance();
      expect(ideClient.isDiffingEnabled()).toBe(false);
    });

    it('should return false if tool discovery fails', async () => {
      const config = { port: '8080' };
      vi.mocked(getConnectionConfigFromFile).mockResolvedValue(config);
      vi.mocked(validateWorkspacePath).mockReturnValue({ isValid: true });
      mockClient.request.mockRejectedValue(new Error('Method not found'));

      const ideClient = await IdeClient.getInstance();
      await ideClient.connect();

      expect(ideClient.getConnectionStatus().status).toBe(
        IDEConnectionStatus.Connected,
      );
      expect(ideClient.isDiffingEnabled()).toBe(false);
    });

    it('should return false if diffing tools are not available', async () => {
      const config = { port: '8080' };
      vi.mocked(getConnectionConfigFromFile).mockResolvedValue(config);
      vi.mocked(validateWorkspacePath).mockReturnValue({ isValid: true });
      mockClient.request.mockResolvedValue({
        tools: [{ name: 'someOtherTool' }],
      });

      const ideClient = await IdeClient.getInstance();
      await ideClient.connect();

      expect(ideClient.getConnectionStatus().status).toBe(
        IDEConnectionStatus.Connected,
      );
      expect(ideClient.isDiffingEnabled()).toBe(false);
    });

    it('should return false if only openDiff tool is available', async () => {
      const config = { port: '8080' };
      vi.mocked(getConnectionConfigFromFile).mockResolvedValue(config);
      vi.mocked(validateWorkspacePath).mockReturnValue({ isValid: true });
      mockClient.request.mockResolvedValue({
        tools: [{ name: 'openDiff' }],
      });

      const ideClient = await IdeClient.getInstance();
      await ideClient.connect();

      expect(ideClient.getConnectionStatus().status).toBe(
        IDEConnectionStatus.Connected,
      );
      expect(ideClient.isDiffingEnabled()).toBe(false);
    });

    it('should return true if connected and diffing tools are available', async () => {
      const config = { port: '8080' };
      vi.mocked(getConnectionConfigFromFile).mockResolvedValue(config);
      vi.mocked(validateWorkspacePath).mockReturnValue({ isValid: true });
      mockClient.request.mockResolvedValue({
        tools: [{ name: 'openDiff' }, { name: 'closeDiff' }],
      });

      const ideClient = await IdeClient.getInstance();
      await ideClient.connect();

      expect(ideClient.getConnectionStatus().status).toBe(
        IDEConnectionStatus.Connected,
      );
      expect(ideClient.isDiffingEnabled()).toBe(true);
    });
  });

  describe('resolveDiffFromCli', () => {
    beforeEach(async () => {
      // Ensure client is "connected" for these tests
      const ideClient = await IdeClient.getInstance();
      // We need to set the client property on the instance for openDiff to work
      (ideClient as unknown as { client: Client }).client = mockClient;
      mockClient.request.mockResolvedValue({
        isError: false,
        content: [],
      });
    });

    it("should resolve an open diff as 'accepted' and return the final content", async () => {
      const ideClient = await IdeClient.getInstance();
      const closeDiffSpy = vi
        .spyOn(
          ideClient as unknown as {
            closeDiff: () => Promise<string | undefined>;
          },
          'closeDiff',
        )
        .mockResolvedValue('final content from ide');

      const diffPromise = ideClient.openDiff('/test.txt', 'new content');

      // Yield to the event loop to allow the openDiff promise executor to run
      await new Promise((resolve) => setImmediate(resolve));

      await ideClient.resolveDiffFromCli('/test.txt', 'accepted');

      const result = await diffPromise;

      expect(result).toEqual({
        status: 'accepted',
        content: 'final content from ide',
      });
      expect(closeDiffSpy).toHaveBeenCalledWith('/test.txt', {
        suppressNotification: true,
      });
      expect(
        (
          ideClient as unknown as { diffResponses: Map<string, unknown> }
        ).diffResponses.has('/test.txt'),
      ).toBe(false);
    });

    it("should resolve an open diff as 'rejected'", async () => {
      const ideClient = await IdeClient.getInstance();
      const closeDiffSpy = vi
        .spyOn(
          ideClient as unknown as {
            closeDiff: () => Promise<string | undefined>;
          },
          'closeDiff',
        )
        .mockResolvedValue(undefined);

      const diffPromise = ideClient.openDiff('/test.txt', 'new content');

      // Yield to the event loop to allow the openDiff promise executor to run
      await new Promise((resolve) => setImmediate(resolve));

      await ideClient.resolveDiffFromCli('/test.txt', 'rejected');

      const result = await diffPromise;

      expect(result).toEqual({
        status: 'rejected',
        content: undefined,
      });
      expect(closeDiffSpy).toHaveBeenCalledWith('/test.txt', {
        suppressNotification: true,
      });
      expect(
        (
          ideClient as unknown as { diffResponses: Map<string, unknown> }
        ).diffResponses.has('/test.txt'),
      ).toBe(false);
    });

    it('should do nothing if no diff is open for the given file path', async () => {
      const ideClient = await IdeClient.getInstance();
      const closeDiffSpy = vi
        .spyOn(
          ideClient as unknown as {
            closeDiff: () => Promise<string | undefined>;
          },
          'closeDiff',
        )
        .mockResolvedValue(undefined);

      // No call to openDiff, so no resolver will exist.
      await ideClient.resolveDiffFromCli('/non-existent.txt', 'accepted');

      expect(closeDiffSpy).toHaveBeenCalledWith('/non-existent.txt', {
        suppressNotification: true,
      });
      // No crash should occur, and nothing should be in the map.
      expect(
        (
          ideClient as unknown as { diffResponses: Map<string, unknown> }
        ).diffResponses.has('/non-existent.txt'),
      ).toBe(false);
    });
  });

  describe('closeDiff', () => {
    beforeEach(async () => {
      const ideClient = await IdeClient.getInstance();
      (ideClient as unknown as { client: Client }).client = mockClient;
    });

    it('should return undefined if client is not connected', async () => {
      const ideClient = await IdeClient.getInstance();
      (ideClient as unknown as { client: Client | undefined }).client =
        undefined;

      const result = await (
        ideClient as unknown as { closeDiff: (f: string) => Promise<void> }
      ).closeDiff('/test.txt');
      expect(result).toBeUndefined();
    });

    it('should call client.request with correct arguments', async () => {
      const ideClient = await IdeClient.getInstance();
      // Return a valid, empty response as the return value is not under test here.
      mockClient.request.mockResolvedValue({ isError: false, content: [] });

      await (
        ideClient as unknown as {
          closeDiff: (
            f: string,
            o?: { suppressNotification?: boolean },
          ) => Promise<void>;
        }
      ).closeDiff('/test.txt', { suppressNotification: true });

      expect(mockClient.request).toHaveBeenCalledWith(
        expect.objectContaining({
          params: {
            name: 'closeDiff',
            arguments: {
              filePath: '/test.txt',
              suppressNotification: true,
            },
          },
        }),
        expect.any(Object), // Schema
        expect.any(Object), // Options
      );
    });

    it('should return content from a valid JSON response', async () => {
      const ideClient = await IdeClient.getInstance();
      const response = {
        isError: false,
        content: [
          { type: 'text', text: JSON.stringify({ content: 'file content' }) },
        ],
      };
      mockClient.request.mockResolvedValue(response);

      const result = await (
        ideClient as unknown as { closeDiff: (f: string) => Promise<string> }
      ).closeDiff('/test.txt');
      expect(result).toBe('file content');
    });

    it('should return undefined for a valid JSON response with null content', async () => {
      const ideClient = await IdeClient.getInstance();
      const response = {
        isError: false,
        content: [{ type: 'text', text: JSON.stringify({ content: null }) }],
      };
      mockClient.request.mockResolvedValue(response);

      const result = await (
        ideClient as unknown as { closeDiff: (f: string) => Promise<void> }
      ).closeDiff('/test.txt');
      expect(result).toBeUndefined();
    });

    it('should return undefined if response is not valid JSON', async () => {
      const ideClient = await IdeClient.getInstance();
      const response = {
        isError: false,
        content: [{ type: 'text', text: 'not json' }],
      };
      mockClient.request.mockResolvedValue(response);

      const result = await (
        ideClient as unknown as { closeDiff: (f: string) => Promise<void> }
      ).closeDiff('/test.txt');
      expect(result).toBeUndefined();
    });

    it('should return undefined if request result has isError: true', async () => {
      const ideClient = await IdeClient.getInstance();
      const response = {
        isError: true,
        content: [{ type: 'text', text: 'An error occurred' }],
      };
      mockClient.request.mockResolvedValue(response);

      const result = await (
        ideClient as unknown as { closeDiff: (f: string) => Promise<void> }
      ).closeDiff('/test.txt');
      expect(result).toBeUndefined();
    });

    it('should return undefined if client.request throws', async () => {
      const ideClient = await IdeClient.getInstance();
      mockClient.request.mockRejectedValue(new Error('Request failed'));

      const result = await (
        ideClient as unknown as { closeDiff: (f: string) => Promise<void> }
      ).closeDiff('/test.txt');
      expect(result).toBeUndefined();
    });

    it('should return undefined if response has no text part', async () => {
      const ideClient = await IdeClient.getInstance();
      const response = {
        isError: false,
        content: [{ type: 'other' }],
      };
      mockClient.request.mockResolvedValue(response);

      const result = await (
        ideClient as unknown as { closeDiff: (f: string) => Promise<void> }
      ).closeDiff('/test.txt');
      expect(result).toBeUndefined();
    });

    it('should return undefined if response is falsy', async () => {
      const ideClient = await IdeClient.getInstance();
      // Mocking with `null as any` to test the falsy path, as the mock
      // function is strictly typed.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockClient.request.mockResolvedValue(null as any);

      const result = await (
        ideClient as unknown as { closeDiff: (f: string) => Promise<void> }
      ).closeDiff('/test.txt');
      expect(result).toBeUndefined();
    });
  });

  describe('authentication', () => {
    it('should connect with an auth token if provided in the discovery file', async () => {
      const authToken = 'test-auth-token';
      const config = { port: '8080', authToken };
      vi.mocked(getConnectionConfigFromFile).mockResolvedValue(config);
      vi.mocked(validateWorkspacePath).mockReturnValue({ isValid: true });

      const ideClient = await IdeClient.getInstance();
      await ideClient.connect();

      expect(StreamableHTTPClientTransport).toHaveBeenCalledWith(
        new URL('http://127.0.0.1:8080/mcp'),
        expect.objectContaining({
          requestInit: {
            headers: {
              Authorization: `Bearer ${authToken}`,
            },
          },
        }),
      );
      expect(ideClient.getConnectionStatus().status).toBe(
        IDEConnectionStatus.Connected,
      );
    });

    it('should connect with an auth token from environment variable if config file is missing', async () => {
      vi.mocked(getConnectionConfigFromFile).mockResolvedValue(undefined);
      vi.mocked(validateWorkspacePath).mockReturnValue({ isValid: true });
      vi.mocked(getPortFromEnv).mockReturnValue('9090');
      process.env['GEMINI_CLI_IDE_AUTH_TOKEN'] = 'env-auth-token';

      const ideClient = await IdeClient.getInstance();
      await ideClient.connect();

      expect(StreamableHTTPClientTransport).toHaveBeenCalledWith(
        new URL('http://127.0.0.1:9090/mcp'),
        expect.objectContaining({
          requestInit: {
            headers: {
              Authorization: 'Bearer env-auth-token',
            },
          },
        }),
      );
      expect(ideClient.getConnectionStatus().status).toBe(
        IDEConnectionStatus.Connected,
      );
    });
  });
});
