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
  type Mock,
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
    existsSync: () => false,
  };
});
vi.mock('./process-utils.js');
vi.mock('@modelcontextprotocol/sdk/client/index.js');
vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js');
vi.mock('@modelcontextprotocol/sdk/client/stdio.js');
vi.mock('./detect-ide.js');
vi.mock('node:os');

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

    // Mock dependencies
    vi.spyOn(process, 'cwd').mockReturnValue('/test/workspace/sub-dir');
    vi.mocked(detectIde).mockReturnValue(IDE_DEFINITIONS.vscode);
    vi.mocked(getIdeProcessInfo).mockResolvedValue({
      pid: 12345,
      command: 'test-ide',
    });
    vi.mocked(os.tmpdir).mockReturnValue('/tmp');

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
      vi.mocked(fs.promises.readFile).mockResolvedValue(JSON.stringify(config));
      (
        vi.mocked(fs.promises.readdir) as Mock<
          (path: fs.PathLike) => Promise<string[]>
        >
      ).mockResolvedValue([]);

      const ideClient = await IdeClient.getInstance();
      await ideClient.connect();

      expect(fs.promises.readFile).toHaveBeenCalledWith(
        path.join('/tmp/', 'gemini-ide-server-12345.json'),
        'utf8',
      );
      expect(StreamableHTTPClientTransport).toHaveBeenCalledWith(
        new URL('http://localhost:8080/mcp'),
        expect.any(Object),
      );
      expect(mockClient.connect).toHaveBeenCalledWith(mockHttpTransport);
      expect(ideClient.getConnectionStatus().status).toBe(
        IDEConnectionStatus.Connected,
      );
    });

    it('should connect using stdio when stdio config is provided in file', async () => {
      const config = { stdio: { command: 'test-cmd', args: ['--foo'] } };
      vi.mocked(fs.promises.readFile).mockResolvedValue(JSON.stringify(config));
      (
        vi.mocked(fs.promises.readdir) as Mock<
          (path: fs.PathLike) => Promise<string[]>
        >
      ).mockResolvedValue([]);

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
      vi.mocked(fs.promises.readFile).mockResolvedValue(JSON.stringify(config));
      (
        vi.mocked(fs.promises.readdir) as Mock<
          (path: fs.PathLike) => Promise<string[]>
        >
      ).mockResolvedValue([]);

      const ideClient = await IdeClient.getInstance();
      await ideClient.connect();

      expect(StreamableHTTPClientTransport).toHaveBeenCalled();
      expect(StdioClientTransport).not.toHaveBeenCalled();
      expect(ideClient.getConnectionStatus().status).toBe(
        IDEConnectionStatus.Connected,
      );
    });

    it('should connect using HTTP when port is provided in environment variables', async () => {
      vi.mocked(fs.promises.readFile).mockRejectedValue(
        new Error('File not found'),
      );
      (
        vi.mocked(fs.promises.readdir) as Mock<
          (path: fs.PathLike) => Promise<string[]>
        >
      ).mockResolvedValue([]);
      process.env['GEMINI_CLI_IDE_SERVER_PORT'] = '9090';

      const ideClient = await IdeClient.getInstance();
      await ideClient.connect();

      expect(StreamableHTTPClientTransport).toHaveBeenCalledWith(
        new URL('http://localhost:9090/mcp'),
        expect.any(Object),
      );
      expect(mockClient.connect).toHaveBeenCalledWith(mockHttpTransport);
      expect(ideClient.getConnectionStatus().status).toBe(
        IDEConnectionStatus.Connected,
      );
    });

    it('should connect using stdio when stdio config is in environment variables', async () => {
      vi.mocked(fs.promises.readFile).mockRejectedValue(
        new Error('File not found'),
      );
      (
        vi.mocked(fs.promises.readdir) as Mock<
          (path: fs.PathLike) => Promise<string[]>
        >
      ).mockResolvedValue([]);
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
      vi.mocked(fs.promises.readFile).mockResolvedValue(JSON.stringify(config));
      (
        vi.mocked(fs.promises.readdir) as Mock<
          (path: fs.PathLike) => Promise<string[]>
        >
      ).mockResolvedValue([]);
      process.env['GEMINI_CLI_IDE_SERVER_PORT'] = '9090';

      const ideClient = await IdeClient.getInstance();
      await ideClient.connect();

      expect(StreamableHTTPClientTransport).toHaveBeenCalledWith(
        new URL('http://localhost:8080/mcp'),
        expect.any(Object),
      );
      expect(ideClient.getConnectionStatus().status).toBe(
        IDEConnectionStatus.Connected,
      );
    });

    it('should be disconnected if no config is found', async () => {
      vi.mocked(fs.promises.readFile).mockRejectedValue(
        new Error('File not found'),
      );
      (
        vi.mocked(fs.promises.readdir) as Mock<
          (path: fs.PathLike) => Promise<string[]>
        >
      ).mockResolvedValue([]);

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
      vi.mocked(fs.promises.readFile).mockResolvedValue(JSON.stringify(config));

      const ideClient = await IdeClient.getInstance();
      // In tests, the private method can be accessed like this.
      const result = await (
        ideClient as unknown as {
          getConnectionConfigFromFile: () => Promise<unknown>;
        }
      ).getConnectionConfigFromFile();

      expect(result).toEqual(config);
      expect(fs.promises.readFile).toHaveBeenCalledWith(
        path.join('/tmp', 'gemini-ide-server-12345.json'),
        'utf8',
      );
    });

    it('should return undefined if no config files are found', async () => {
      vi.mocked(fs.promises.readFile).mockRejectedValue(new Error('not found'));
      (
        vi.mocked(fs.promises.readdir) as Mock<
          (path: fs.PathLike) => Promise<string[]>
        >
      ).mockResolvedValue([]);

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
      vi.mocked(fs.promises.readFile).mockRejectedValueOnce(
        new Error('not found'),
      ); // For old path
      (
        vi.mocked(fs.promises.readdir) as Mock<
          (path: fs.PathLike) => Promise<string[]>
        >
      ).mockResolvedValue(['gemini-ide-server-12345-123.json']);
      vi.mocked(fs.promises.readFile).mockResolvedValue(JSON.stringify(config));
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
      expect(fs.promises.readFile).toHaveBeenCalledWith(
        path.join('/tmp/gemini/ide', 'gemini-ide-server-12345-123.json'),
        'utf8',
      );
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
      vi.mocked(fs.promises.readFile).mockRejectedValueOnce(
        new Error('not found'),
      );
      (
        vi.mocked(fs.promises.readdir) as Mock<
          (path: fs.PathLike) => Promise<string[]>
        >
      ).mockResolvedValue([
        'gemini-ide-server-12345-111.json',
        'gemini-ide-server-12345-222.json',
      ]);
      vi.mocked(fs.promises.readFile)
        .mockResolvedValueOnce(JSON.stringify(invalidConfig))
        .mockResolvedValueOnce(JSON.stringify(validConfig));

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
        'VS Code',
        '/test/workspace/sub-dir',
      );
      expect(validateSpy).toHaveBeenCalledWith(
        '/test/workspace',
        'VS Code',
        '/test/workspace/sub-dir',
      );
    });

    it('should return the first valid config when multiple workspaces are valid', async () => {
      const config1 = { port: '1111', workspacePath: '/test/workspace' };
      const config2 = { port: '2222', workspacePath: '/test/workspace2' };
      vi.mocked(fs.promises.readFile).mockRejectedValueOnce(
        new Error('not found'),
      );
      (
        vi.mocked(fs.promises.readdir) as Mock<
          (path: fs.PathLike) => Promise<string[]>
        >
      ).mockResolvedValue([
        'gemini-ide-server-12345-111.json',
        'gemini-ide-server-12345-222.json',
      ]);
      vi.mocked(fs.promises.readFile)
        .mockResolvedValueOnce(JSON.stringify(config1))
        .mockResolvedValueOnce(JSON.stringify(config2));
      vi.spyOn(IdeClient, 'validateWorkspacePath').mockReturnValue({
        isValid: true,
      });

      const ideClient = await IdeClient.getInstance();
      const result = await (
        ideClient as unknown as {
          getConnectionConfigFromFile: () => Promise<unknown>;
        }
      ).getConnectionConfigFromFile();

      expect(result).toEqual(config1);
    });

    it('should prioritize the config matching the port from the environment variable', async () => {
      process.env['GEMINI_CLI_IDE_SERVER_PORT'] = '2222';
      const config1 = { port: '1111', workspacePath: '/test/workspace' };
      const config2 = { port: '2222', workspacePath: '/test/workspace2' };
      vi.mocked(fs.promises.readFile).mockRejectedValueOnce(
        new Error('not found'),
      );
      (
        vi.mocked(fs.promises.readdir) as Mock<
          (path: fs.PathLike) => Promise<string[]>
        >
      ).mockResolvedValue([
        'gemini-ide-server-12345-111.json',
        'gemini-ide-server-12345-222.json',
      ]);
      vi.mocked(fs.promises.readFile)
        .mockResolvedValueOnce(JSON.stringify(config1))
        .mockResolvedValueOnce(JSON.stringify(config2));
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
      vi.mocked(fs.promises.readFile).mockRejectedValueOnce(
        new Error('not found'),
      );
      (
        vi.mocked(fs.promises.readdir) as Mock<
          (path: fs.PathLike) => Promise<string[]>
        >
      ).mockResolvedValue([
        'gemini-ide-server-12345-111.json',
        'gemini-ide-server-12345-222.json',
      ]);
      vi.mocked(fs.promises.readFile)
        .mockResolvedValueOnce('invalid json')
        .mockResolvedValueOnce(JSON.stringify(validConfig));
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

    it('should return undefined if readdir throws an error', async () => {
      vi.mocked(fs.promises.readFile).mockRejectedValueOnce(
        new Error('not found'),
      );
      vi.mocked(fs.promises.readdir).mockRejectedValue(
        new Error('readdir failed'),
      );

      const ideClient = await IdeClient.getInstance();
      const result = await (
        ideClient as unknown as {
          getConnectionConfigFromFile: () => Promise<unknown>;
        }
      ).getConnectionConfigFromFile();

      expect(result).toBeUndefined();
    });

    it('should ignore files with invalid names', async () => {
      const validConfig = { port: '3333', workspacePath: '/test/workspace' };
      vi.mocked(fs.promises.readFile).mockRejectedValueOnce(
        new Error('not found'),
      );
      (
        vi.mocked(fs.promises.readdir) as Mock<
          (path: fs.PathLike) => Promise<string[]>
        >
      ).mockResolvedValue([
        'gemini-ide-server-12345-111.json', // valid
        'not-a-config-file.txt', // invalid
        'gemini-ide-server-asdf.json', // invalid
      ]);
      vi.mocked(fs.promises.readFile).mockResolvedValueOnce(
        JSON.stringify(validConfig),
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
      expect(fs.promises.readFile).toHaveBeenCalledWith(
        path.join('/tmp/gemini/ide', 'gemini-ide-server-12345-111.json'),
        'utf8',
      );
      expect(fs.promises.readFile).not.toHaveBeenCalledWith(
        path.join('/tmp/gemini/ide', 'not-a-config-file.txt'),
        'utf8',
      );
    });

    it('should match env port string to a number port in the config', async () => {
      process.env['GEMINI_CLI_IDE_SERVER_PORT'] = '3333';
      const config1 = { port: 1111, workspacePath: '/test/workspace' };
      const config2 = { port: 3333, workspacePath: '/test/workspace2' };
      vi.mocked(fs.promises.readFile).mockRejectedValueOnce(
        new Error('not found'),
      );
      (
        vi.mocked(fs.promises.readdir) as Mock<
          (path: fs.PathLike) => Promise<string[]>
        >
      ).mockResolvedValue([
        'gemini-ide-server-12345-111.json',
        'gemini-ide-server-12345-222.json',
      ]);
      vi.mocked(fs.promises.readFile)
        .mockResolvedValueOnce(JSON.stringify(config1))
        .mockResolvedValueOnce(JSON.stringify(config2));
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
      vi.mocked(fs.promises.readFile).mockResolvedValue(JSON.stringify(config));
      (
        vi.mocked(fs.promises.readdir) as Mock<
          (path: fs.PathLike) => Promise<string[]>
        >
      ).mockResolvedValue([]);
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
      vi.mocked(fs.promises.readFile).mockResolvedValue(JSON.stringify(config));
      (
        vi.mocked(fs.promises.readdir) as Mock<
          (path: fs.PathLike) => Promise<string[]>
        >
      ).mockResolvedValue([]);
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
      vi.mocked(fs.promises.readFile).mockResolvedValue(JSON.stringify(config));
      (
        vi.mocked(fs.promises.readdir) as Mock<
          (path: fs.PathLike) => Promise<string[]>
        >
      ).mockResolvedValue([]);
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
      vi.mocked(fs.promises.readFile).mockResolvedValue(JSON.stringify(config));
      (
        vi.mocked(fs.promises.readdir) as Mock<
          (path: fs.PathLike) => Promise<string[]>
        >
      ).mockResolvedValue([]);
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

  describe('authentication', () => {
    it('should connect with an auth token if provided in the discovery file', async () => {
      const authToken = 'test-auth-token';
      const config = { port: '8080', authToken };
      vi.mocked(fs.promises.readFile).mockResolvedValue(JSON.stringify(config));
      (
        vi.mocked(fs.promises.readdir) as Mock<
          (path: fs.PathLike) => Promise<string[]>
        >
      ).mockResolvedValue([]);

      const ideClient = await IdeClient.getInstance();
      await ideClient.connect();

      expect(StreamableHTTPClientTransport).toHaveBeenCalledWith(
        new URL('http://localhost:8080/mcp'),
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
  });
});
