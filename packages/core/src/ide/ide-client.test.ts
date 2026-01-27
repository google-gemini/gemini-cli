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
import * as fs from 'node:fs';
import { getIdeProcessInfo } from './process-utils.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { detectIde, IDE_DEFINITIONS } from './detect-ide.js';
import * as os from 'node:os';
import * as path from 'node:path';
import { getIdeServerHost } from './ide-client.js';
import { pathToFileURL } from 'node:url';

// Mock os.tmpdir to control the temp directory in tests
vi.mock('node:os', async (importOriginal) => {
  const actualOs = await importOriginal<typeof os>();
  return {
    ...actualOs,
    tmpdir: vi.fn(),
  };
});

// Mock node:fs to allow spying on existsSync while keeping real implementation for others
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof fs>();
  return {
    ...actual,
    existsSync: vi.fn(actual.existsSync),
  };
});

vi.mock('./process-utils.js');
vi.mock('@modelcontextprotocol/sdk/client/index.js');
vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js');
vi.mock('@modelcontextprotocol/sdk/client/stdio.js');
vi.mock('./detect-ide.js');

describe('IdeClient', () => {
  let mockClient: Mocked<Client>;
  let mockHttpTransport: Mocked<StreamableHTTPClientTransport>;
  let mockStdioTransport: Mocked<StdioClientTransport>;
  let testTmpDir: string;
  let ideConfigDir: string;

  beforeEach(async () => {
    // Setup temporary directory for tests
    testTmpDir = await fs.promises.mkdtemp(
      path.join(os.homedir(), 'ide-client-test-'),
    );
    ideConfigDir = path.join(testTmpDir, 'gemini', 'ide');
    await fs.promises.mkdir(ideConfigDir, { recursive: true });

    // Mock os.tmpdir to return our test temp directory
    vi.mocked(os.tmpdir).mockReturnValue(testTmpDir);

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

  afterEach(async () => {
    // Clean up temporary directory
    if (testTmpDir) {
      await fs.promises.rm(testTmpDir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  describe('connect', () => {
    it('should connect using HTTP when port is provided in config file', async () => {
      const config = { port: '8080' };
      const configPath = path.join(
        ideConfigDir,
        'gemini-ide-server-12345.json',
      );
      await fs.promises.writeFile(configPath, JSON.stringify(config), 'utf8');

      const ideClient = await IdeClient.getInstance();
      await ideClient.connect();

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
      const config = { stdio: { command: 'test-cmd', args: ['--foo'] } };
      const configPath = path.join(
        ideConfigDir,
        'gemini-ide-server-12345.json',
      );
      await fs.promises.writeFile(configPath, JSON.stringify(config), 'utf8');

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
      const configPath = path.join(
        ideConfigDir,
        'gemini-ide-server-12345.json',
      );
      await fs.promises.writeFile(configPath, JSON.stringify(config), 'utf8');

      const ideClient = await IdeClient.getInstance();
      await ideClient.connect();

      expect(StreamableHTTPClientTransport).toHaveBeenCalled();
      expect(StdioClientTransport).not.toHaveBeenCalled();
      expect(ideClient.getConnectionStatus().status).toBe(
        IDEConnectionStatus.Connected,
      );
    });

    it('should connect using HTTP when port is provided in environment variables', async () => {
      process.env['GEMINI_CLI_IDE_SERVER_PORT'] = '9090';

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
      process.env['GEMINI_CLI_IDE_SERVER_STDIO_COMMAND'] = 'env-cmd';
      process.env['GEMINI_CLI_IDE_SERVER_STDIO_ARGS'] = '["--bar"]';

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
      const configPath = path.join(
        ideConfigDir,
        'gemini-ide-server-12345.json',
      );
      await fs.promises.writeFile(configPath, JSON.stringify(config), 'utf8');

      process.env['GEMINI_CLI_IDE_SERVER_PORT'] = '9090';

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

  describe('getConnectionConfigFromFile', () => {
    it('should return config from the specific pid file if it exists', async () => {
      const config = { port: '1234', workspacePath: '/test/workspace' };
      const configPath = path.join(
        ideConfigDir,
        'gemini-ide-server-12345.json',
      );
      await fs.promises.writeFile(configPath, JSON.stringify(config), 'utf8');

      const ideClient = await IdeClient.getInstance();
      // In tests, the private method can be accessed like this.
      const result = await (
        ideClient as unknown as {
          getConnectionConfigFromFile: () => Promise<unknown>;
        }
      ).getConnectionConfigFromFile();

      expect(result).toEqual(config);
    });

    it('should return undefined if no config files are found', async () => {
      const ideClient = await IdeClient.getInstance();
      const result = await (
        ideClient as unknown as {
          getConnectionConfigFromFile: () => Promise<unknown>;
        }
      ).getConnectionConfigFromFile();

      expect(result).toBeUndefined();
    });

    it('should find and parse a single config file with the new naming scheme', async () => {
      const config = { port: '5678', workspacePath: '/test/workspace' };
      const configPath = path.join(
        ideConfigDir,
        'gemini-ide-server-12345-123.json',
      );
      await fs.promises.writeFile(configPath, JSON.stringify(config), 'utf8');

      vi.spyOn(IdeClient, 'validateWorkspacePath').mockReturnValue({
        isValid: true,
      });

      const ideClient = await IdeClient.getInstance();
      const result = await (
        ideClient as unknown as {
          getConnectionConfigFromFile: () => Promise<unknown>;
        }
      ).getConnectionConfigFromFile();

      expect(result).toEqual(config);
    });

    it('should filter out configs with invalid workspace paths', async () => {
      const validConfig = {
        port: '5678',
        workspacePath: '/test/workspace',
      };
      const invalidConfig = {
        port: '1111',
        workspacePath: '/invalid/workspace',
      };

      await fs.promises.writeFile(
        path.join(ideConfigDir, 'gemini-ide-server-12345-111.json'),
        JSON.stringify(invalidConfig),
        'utf8',
      );
      await fs.promises.writeFile(
        path.join(ideConfigDir, 'gemini-ide-server-12345-222.json'),
        JSON.stringify(validConfig),
        'utf8',
      );

      const validateSpy = vi
        .spyOn(IdeClient, 'validateWorkspacePath')
        .mockReturnValueOnce({ isValid: false })
        .mockReturnValueOnce({ isValid: true });

      const ideClient = await IdeClient.getInstance();
      const result = await (
        ideClient as unknown as {
          getConnectionConfigFromFile: () => Promise<unknown>;
        }
      ).getConnectionConfigFromFile();

      expect(result).toEqual(validConfig);
      expect(validateSpy).toHaveBeenCalledWith(
        '/invalid/workspace',
        '/test/workspace/sub-dir',
      );
      expect(validateSpy).toHaveBeenCalledWith(
        '/test/workspace',
        '/test/workspace/sub-dir',
      );
    });

    it('should return the first valid config when multiple workspaces are valid', async () => {
      const config1 = { port: '1111', workspacePath: '/test/workspace' };
      const config2 = { port: '2222', workspacePath: '/test/workspace2' };

      await fs.promises.writeFile(
        path.join(ideConfigDir, 'gemini-ide-server-12345-111.json'),
        JSON.stringify(config1),
        'utf8',
      );
      await fs.promises.writeFile(
        path.join(ideConfigDir, 'gemini-ide-server-12345-222.json'),
        JSON.stringify(config2),
        'utf8',
      );

      vi.spyOn(IdeClient, 'validateWorkspacePath').mockReturnValue({
        isValid: true,
      });

      const ideClient = await IdeClient.getInstance();
      const result = await (
        ideClient as unknown as {
          getConnectionConfigFromFile: () => Promise<unknown>;
        }
      ).getConnectionConfigFromFile();

      // readdir order is not guaranteed, but usually sorted by name or creation.
      // The implementation of getConnectionConfigFromFile explicitly sorts the files:
      // const matchingFiles = portFiles.filter(...).sort();
      // So '111' should come before '222'.
      expect(result).toEqual(config1);
    });

    it('should prioritize the config matching the port from the environment variable', async () => {
      process.env['GEMINI_CLI_IDE_SERVER_PORT'] = '2222';
      const config1 = { port: '1111', workspacePath: '/test/workspace' };
      const config2 = { port: '2222', workspacePath: '/test/workspace2' };

      await fs.promises.writeFile(
        path.join(ideConfigDir, 'gemini-ide-server-12345-111.json'),
        JSON.stringify(config1),
        'utf8',
      );
      await fs.promises.writeFile(
        path.join(ideConfigDir, 'gemini-ide-server-12345-222.json'),
        JSON.stringify(config2),
        'utf8',
      );

      vi.spyOn(IdeClient, 'validateWorkspacePath').mockReturnValue({
        isValid: true,
      });

      const ideClient = await IdeClient.getInstance();
      const result = await (
        ideClient as unknown as {
          getConnectionConfigFromFile: () => Promise<unknown>;
        }
      ).getConnectionConfigFromFile();

      expect(result).toEqual(config2);
    });

    it('should handle invalid JSON in one of the config files', async () => {
      const validConfig = { port: '2222', workspacePath: '/test/workspace' };

      await fs.promises.writeFile(
        path.join(ideConfigDir, 'gemini-ide-server-12345-111.json'),
        'invalid json',
        'utf8',
      );
      await fs.promises.writeFile(
        path.join(ideConfigDir, 'gemini-ide-server-12345-222.json'),
        JSON.stringify(validConfig),
        'utf8',
      );

      vi.spyOn(IdeClient, 'validateWorkspacePath').mockReturnValue({
        isValid: true,
      });

      const ideClient = await IdeClient.getInstance();
      const result = await (
        ideClient as unknown as {
          getConnectionConfigFromFile: () => Promise<unknown>;
        }
      ).getConnectionConfigFromFile();

      expect(result).toEqual(validConfig);
    });

    it('should ignore files with invalid names', async () => {
      const validConfig = { port: '3333', workspacePath: '/test/workspace' };

      await fs.promises.writeFile(
        path.join(ideConfigDir, 'gemini-ide-server-12345-111.json'), // valid
        JSON.stringify(validConfig),
        'utf8',
      );
      await fs.promises.writeFile(
        path.join(ideConfigDir, 'not-a-config-file.txt'), // invalid
        'some content',
        'utf8',
      );
      await fs.promises.writeFile(
        path.join(ideConfigDir, 'gemini-ide-server-asdf.json'), // invalid
        'some content',
        'utf8',
      );

      vi.spyOn(IdeClient, 'validateWorkspacePath').mockReturnValue({
        isValid: true,
      });

      const ideClient = await IdeClient.getInstance();
      const result = await (
        ideClient as unknown as {
          getConnectionConfigFromFile: () => Promise<unknown>;
        }
      ).getConnectionConfigFromFile();

      expect(result).toEqual(validConfig);
    });

    it('should match env port string to a number port in the config', async () => {
      process.env['GEMINI_CLI_IDE_SERVER_PORT'] = '3333';
      const config1 = { port: 1111, workspacePath: '/test/workspace' };
      const config2 = { port: 3333, workspacePath: '/test/workspace2' };

      await fs.promises.writeFile(
        path.join(ideConfigDir, 'gemini-ide-server-12345-111.json'),
        JSON.stringify(config1),
        'utf8',
      );
      await fs.promises.writeFile(
        path.join(ideConfigDir, 'gemini-ide-server-12345-222.json'),
        JSON.stringify(config2),
        'utf8',
      );

      vi.spyOn(IdeClient, 'validateWorkspacePath').mockReturnValue({
        isValid: true,
      });

      const ideClient = await IdeClient.getInstance();
      const result = await (
        ideClient as unknown as {
          getConnectionConfigFromFile: () => Promise<unknown>;
        }
      ).getConnectionConfigFromFile();

      expect(result).toEqual(config2);
    });
  });

  describe('isDiffingEnabled', () => {
    it('should return false if not connected', async () => {
      const ideClient = await IdeClient.getInstance();
      expect(ideClient.isDiffingEnabled()).toBe(false);
    });

    it('should return false if tool discovery fails', async () => {
      const config = { port: '8080' };
      const configPath = path.join(
        ideConfigDir,
        'gemini-ide-server-12345.json',
      );
      await fs.promises.writeFile(configPath, JSON.stringify(config), 'utf8');

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
      const configPath = path.join(
        ideConfigDir,
        'gemini-ide-server-12345.json',
      );
      await fs.promises.writeFile(configPath, JSON.stringify(config), 'utf8');

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
      const configPath = path.join(
        ideConfigDir,
        'gemini-ide-server-12345.json',
      );
      await fs.promises.writeFile(configPath, JSON.stringify(config), 'utf8');

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
      const configPath = path.join(
        ideConfigDir,
        'gemini-ide-server-12345.json',
      );
      await fs.promises.writeFile(configPath, JSON.stringify(config), 'utf8');

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
      const configPath = path.join(
        ideConfigDir,
        'gemini-ide-server-12345.json',
      );
      await fs.promises.writeFile(configPath, JSON.stringify(config), 'utf8');

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
      process.env['GEMINI_CLI_IDE_SERVER_PORT'] = '9090';
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

describe('getIdeServerHost', () => {
  let originalSshConnection: string | undefined;
  let originalVscodeRemoteSession: string | undefined;
  let originalRemoteContainers: string | undefined;

  beforeEach(() => {
    vi.mocked(fs.existsSync).mockClear();
    originalSshConnection = process.env['SSH_CONNECTION'];
    originalVscodeRemoteSession =
      process.env['VSCODE_REMOTE_CONTAINERS_SESSION'];
    originalRemoteContainers = process.env['REMOTE_CONTAINERS'];

    delete process.env['SSH_CONNECTION'];
    delete process.env['VSCODE_REMOTE_CONTAINERS_SESSION'];
    delete process.env['REMOTE_CONTAINERS'];
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalSshConnection !== undefined) {
      process.env['SSH_CONNECTION'] = originalSshConnection;
    } else {
      delete process.env['SSH_CONNECTION'];
    }
    if (originalVscodeRemoteSession !== undefined) {
      process.env['VSCODE_REMOTE_CONTAINERS_SESSION'] =
        originalVscodeRemoteSession;
    } else {
      delete process.env['VSCODE_REMOTE_CONTAINERS_SESSION'];
    }
    if (originalRemoteContainers !== undefined) {
      process.env['REMOTE_CONTAINERS'] = originalRemoteContainers;
    } else {
      delete process.env['REMOTE_CONTAINERS'];
    }
  });

  // Helper to set existsSync mock behavior
  const setupFsMocks = (
    dockerenvExists: boolean,
    containerenvExists: boolean,
  ) => {
    vi.mocked(fs.existsSync).mockImplementation(
      (path: string | fs.PathLike) => {
        const p = path.toString();
        if (p === '/.dockerenv') {
          return dockerenvExists;
        }
        if (p === '/run/.containerenv') {
          return containerenvExists;
        }
        return false;
      },
    );
  };

  it('should return 127.0.0.1 when not in container and no SSH_CONNECTION or Dev Container env vars', () => {
    setupFsMocks(false, false);
    delete process.env['SSH_CONNECTION'];
    delete process.env['VSCODE_REMOTE_CONTAINERS_SESSION'];
    delete process.env['REMOTE_CONTAINERS'];
    expect(getIdeServerHost()).toBe('127.0.0.1');
    expect(fs.existsSync).toHaveBeenCalledWith('/.dockerenv');
    expect(fs.existsSync).toHaveBeenCalledWith('/run/.containerenv');
  });

  it('should return 127.0.0.1 when not in container but SSH_CONNECTION is set', () => {
    setupFsMocks(false, false);
    process.env['SSH_CONNECTION'] = 'some_ssh_value';
    delete process.env['VSCODE_REMOTE_CONTAINERS_SESSION'];
    delete process.env['REMOTE_CONTAINERS'];
    expect(getIdeServerHost()).toBe('127.0.0.1');
    expect(fs.existsSync).toHaveBeenCalledWith('/.dockerenv');
    expect(fs.existsSync).toHaveBeenCalledWith('/run/.containerenv');
  });

  it('should return host.docker.internal when in .dockerenv container and no SSH_CONNECTION or Dev Container env vars', () => {
    setupFsMocks(true, false);
    delete process.env['SSH_CONNECTION'];
    delete process.env['VSCODE_REMOTE_CONTAINERS_SESSION'];
    delete process.env['REMOTE_CONTAINERS'];
    expect(getIdeServerHost()).toBe('host.docker.internal');
    expect(fs.existsSync).toHaveBeenCalledWith('/.dockerenv');
    expect(fs.existsSync).not.toHaveBeenCalledWith('/run/.containerenv'); // Short-circuiting
  });

  it('should return 127.0.0.1 when in .dockerenv container and SSH_CONNECTION is set', () => {
    setupFsMocks(true, false);
    process.env['SSH_CONNECTION'] = 'some_ssh_value';
    delete process.env['VSCODE_REMOTE_CONTAINERS_SESSION'];
    delete process.env['REMOTE_CONTAINERS'];
    expect(getIdeServerHost()).toBe('127.0.0.1');
    expect(fs.existsSync).toHaveBeenCalledWith('/.dockerenv');
    expect(fs.existsSync).not.toHaveBeenCalledWith('/run/.containerenv'); // Short-circuiting
  });

  it('should return 127.0.0.1 when in .dockerenv container and VSCODE_REMOTE_CONTAINERS_SESSION is set', () => {
    setupFsMocks(true, false);
    delete process.env['SSH_CONNECTION'];
    process.env['VSCODE_REMOTE_CONTAINERS_SESSION'] = 'some_session_id';
    expect(getIdeServerHost()).toBe('127.0.0.1');
    expect(fs.existsSync).toHaveBeenCalledWith('/.dockerenv');
    expect(fs.existsSync).not.toHaveBeenCalledWith('/run/.containerenv'); // Short-circuiting
  });

  it('should return host.docker.internal when in .containerenv container and no SSH_CONNECTION or Dev Container env vars', () => {
    setupFsMocks(false, true);
    delete process.env['SSH_CONNECTION'];
    delete process.env['VSCODE_REMOTE_CONTAINERS_SESSION'];
    delete process.env['REMOTE_CONTAINERS'];
    expect(getIdeServerHost()).toBe('host.docker.internal');
    expect(fs.existsSync).toHaveBeenCalledWith('/.dockerenv');
    expect(fs.existsSync).toHaveBeenCalledWith('/run/.containerenv');
  });

  it('should return 127.0.0.1 when in .containerenv container and SSH_CONNECTION is set', () => {
    setupFsMocks(false, true);
    process.env['SSH_CONNECTION'] = 'some_ssh_value';
    delete process.env['VSCODE_REMOTE_CONTAINERS_SESSION'];
    delete process.env['REMOTE_CONTAINERS'];
    expect(getIdeServerHost()).toBe('127.0.0.1');
    expect(fs.existsSync).toHaveBeenCalledWith('/.dockerenv');
    expect(fs.existsSync).toHaveBeenCalledWith('/run/.containerenv');
  });

  it('should return 127.0.0.1 when in .containerenv container and REMOTE_CONTAINERS is set', () => {
    setupFsMocks(false, true);
    delete process.env['SSH_CONNECTION'];
    process.env['REMOTE_CONTAINERS'] = 'true';
    expect(getIdeServerHost()).toBe('127.0.0.1');
    expect(fs.existsSync).toHaveBeenCalledWith('/.dockerenv');
    expect(fs.existsSync).toHaveBeenCalledWith('/run/.containerenv');
  });

  it('should return host.docker.internal when in both containers and no SSH_CONNECTION or Dev Container env vars', () => {
    setupFsMocks(true, true);
    delete process.env['SSH_CONNECTION'];
    delete process.env['VSCODE_REMOTE_CONTAINERS_SESSION'];
    delete process.env['REMOTE_CONTAINERS'];
    expect(getIdeServerHost()).toBe('host.docker.internal');
    expect(fs.existsSync).toHaveBeenCalledWith('/.dockerenv');
    expect(fs.existsSync).not.toHaveBeenCalledWith('/run/.containerenv'); // Short-circuiting
  });

  it('should return 127.0.0.1 when in both containers and SSH_CONNECTION is set', () => {
    setupFsMocks(true, true);
    process.env['SSH_CONNECTION'] = 'some_ssh_value';
    delete process.env['VSCODE_REMOTE_CONTAINERS_SESSION'];
    delete process.env['REMOTE_CONTAINERS'];
    expect(getIdeServerHost()).toBe('127.0.0.1');
    expect(fs.existsSync).toHaveBeenCalledWith('/.dockerenv');
    expect(fs.existsSync).not.toHaveBeenCalledWith('/run/.containerenv'); // Short-circuiting
  });

  it('should return 127.0.0.1 when in both containers and VSCODE_REMOTE_CONTAINERS_SESSION is set', () => {
    setupFsMocks(true, true);
    delete process.env['SSH_CONNECTION'];
    process.env['VSCODE_REMOTE_CONTAINERS_SESSION'] = 'some_session_id';
    expect(getIdeServerHost()).toBe('127.0.0.1');
    expect(fs.existsSync).toHaveBeenCalledWith('/.dockerenv');
    expect(fs.existsSync).not.toHaveBeenCalledWith('/run/.containerenv'); // Short-circuiting
  });

  describe('validateWorkspacePath', () => {
    describe('with special characters and encoding', () => {
      it('should return true for a URI-encoded path with spaces', () => {
        const workspaceDir = path.resolve('/test/my workspace');
        const workspacePath = '/test/my%20workspace';
        const cwd = path.join(workspaceDir, 'sub-dir');
        const result = IdeClient.validateWorkspacePath(workspacePath, cwd);
        expect(result.isValid).toBe(true);
      });

      it('should return true for a URI-encoded path with Korean characters', () => {
        const workspaceDir = path.resolve('/test/테스트');
        const workspacePath = '/test/%ED%85%8C%EC%8A%A4%ED%8A%B8'; // "테스트"
        const cwd = path.join(workspaceDir, 'sub-dir');
        const result = IdeClient.validateWorkspacePath(workspacePath, cwd);
        expect(result.isValid).toBe(true);
      });

      it('should return true for a plain decoded path with Korean characters', () => {
        const workspacePath = path.resolve('/test/테스트');
        const cwd = path.join(workspacePath, 'sub-dir');
        const result = IdeClient.validateWorkspacePath(workspacePath, cwd);
        expect(result.isValid).toBe(true);
      });

      it('should return true when one of multi-root paths is a valid URI-encoded path', () => {
        const workspaceDir1 = path.resolve('/another/workspace');
        const workspaceDir2 = path.resolve('/test/테스트');
        const workspacePath = [
          workspaceDir1,
          '/test/%ED%85%8C%EC%8A%A4%ED%8A%B8', // "테스트"
        ].join(path.delimiter);
        const cwd = path.join(workspaceDir2, 'sub-dir');
        const result = IdeClient.validateWorkspacePath(workspacePath, cwd);
        expect(result.isValid).toBe(true);
      });

      it('should return true for paths containing a literal % sign', () => {
        const workspacePath = path.resolve('/test/a%path');
        const cwd = path.join(workspacePath, 'sub-dir');
        const result = IdeClient.validateWorkspacePath(workspacePath, cwd);
        expect(result.isValid).toBe(true);
      });

      it.skipIf(process.platform !== 'win32')(
        'should correctly convert a Windows file URI',
        () => {
          const workspacePath = 'file:///C:\\Users\\test';
          const cwd = 'C:\\Users\\test\\sub-dir';

          const result = IdeClient.validateWorkspacePath(workspacePath, cwd);

          expect(result.isValid).toBe(true);
        },
      );
    });
  });

  describe('validateWorkspacePath (sanitization)', () => {
    it.each([
      {
        description: 'should return true for identical paths',
        workspacePath: path.resolve('test', 'ws'),
        cwd: path.resolve('test', 'ws'),
        expectedValid: true,
      },
      {
        description: 'should return true when workspace has file:// protocol',
        workspacePath: pathToFileURL(path.resolve('test', 'ws')).toString(),
        cwd: path.resolve('test', 'ws'),
        expectedValid: true,
      },
      {
        description: 'should return true when workspace has encoded spaces',
        workspacePath: path.resolve('test', 'my ws').replace(/ /g, '%20'),
        cwd: path.resolve('test', 'my ws'),
        expectedValid: true,
      },
      {
        description:
          'should return true when cwd needs normalization matching workspace',
        workspacePath: path.resolve('test', 'my ws'),
        cwd: path.resolve('test', 'my ws').replace(/ /g, '%20'),
        expectedValid: true,
      },
    ])('$description', ({ workspacePath, cwd, expectedValid }) => {
      expect(IdeClient.validateWorkspacePath(workspacePath, cwd)).toMatchObject(
        { isValid: expectedValid },
      );
    });
  });
});
