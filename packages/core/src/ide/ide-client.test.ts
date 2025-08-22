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
import { getIdeProcessId } from './process-utils.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import {
  detectIde,
  DetectedIde,
  getIdeInfo,
  type IdeInfo,
} from './detect-ide.js';
import * as os from 'node:os';
import * as path from 'node:path';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as object),
    promises: {
      readFile: vi.fn(),
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

  beforeEach(() => {
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
    vi.mocked(detectIde).mockReturnValue(DetectedIde.VSCode);
    vi.mocked(getIdeInfo).mockReturnValue({
      displayName: 'VS Code',
    } as IdeInfo);
    vi.mocked(getIdeProcessId).mockResolvedValue(12345);
    vi.mocked(os.tmpdir).mockReturnValue('/tmp');

    // Mock MCP client and transports
    mockClient = {
      connect: vi.fn().mockResolvedValue(undefined),
      close: vi.fn(),
      setNotificationHandler: vi.fn(),
      callTool: vi.fn(),
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
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('connect', () => {
    it('should connect using HTTP when port is provided in config file', async () => {
      const config = { port: '8080' };
      vi.mocked(fs.promises.readFile).mockResolvedValue(JSON.stringify(config));

      const ideClient = IdeClient.getInstance();
      await ideClient.connect();

      expect(fs.promises.readFile).toHaveBeenCalledWith(
        path.join('/tmp', 'gemini-ide-server-12345.json'),
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

      const ideClient = IdeClient.getInstance();
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

      const ideClient = IdeClient.getInstance();
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
      process.env['GEMINI_CLI_IDE_SERVER_PORT'] = '9090';

      const ideClient = IdeClient.getInstance();
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
      process.env['GEMINI_CLI_IDE_SERVER_STDIO_COMMAND'] = 'env-cmd';
      process.env['GEMINI_CLI_IDE_SERVER_STDIO_ARGS'] = '["--bar"]';

      const ideClient = IdeClient.getInstance();
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
      process.env['GEMINI_CLI_IDE_SERVER_PORT'] = '9090';

      const ideClient = IdeClient.getInstance();
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

      const ideClient = IdeClient.getInstance();
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
});
