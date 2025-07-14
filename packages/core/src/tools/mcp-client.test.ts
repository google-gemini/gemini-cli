/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {
  populateMcpServerCommand,
  createTransport,
  generateValidName,
  isEnabled,
  discoverTools,
} from './mcp-client.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import * as SdkClientStdioLib from '@modelcontextprotocol/sdk/client/stdio.js';
import * as ClientLib from '@modelcontextprotocol/sdk/client/index.js';
import * as GenAiLib from '@google/genai';

vi.mock('@modelcontextprotocol/sdk/client/stdio.js');
vi.mock('@modelcontextprotocol/sdk/client/index.js');
vi.mock('@google/genai');

describe('mcp-client', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('discoverTools', () => {
    it('should discover tools', async () => {
      const mockedClient = {} as unknown as ClientLib.Client;
      const mockedMcpToTool = vi.mocked(GenAiLib.mcpToTool).mockReturnValue({
        tool: () => ({
          functionDeclarations: [
            {
              name: 'testFunction',
            },
          ],
        }),
      } as unknown as GenAiLib.CallableTool);

      const tools = await discoverTools('test-server', {}, mockedClient);

      expect(tools.length).toBe(1);
      expect(mockedMcpToTool).toHaveBeenCalledOnce();
    });
  });

  describe('appendMcpServerCommand', () => {
    it('should do nothing if no MCP servers or command are configured', () => {
      const out = populateMcpServerCommand({}, undefined);
      expect(out).toEqual({});
    });

    it('should discover tools via mcpServerCommand', () => {
      const commandString = 'command --arg1 value1';
      const out = populateMcpServerCommand({}, commandString);
      expect(out).toEqual({
        mcp: {
          command: 'command',
          args: ['--arg1', 'value1'],
        },
      });
    });

    it('should handle error if mcpServerCommand parsing fails', () => {
      expect(() => populateMcpServerCommand({}, 'derp && herp')).toThrowError();
    });
  });

  describe('createTransport', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      vi.resetModules();
      process.env = {};
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    describe('should connect via httpUrl', () => {
      it('without headers', async () => {
        const transport = createTransport(
          'test-server',
          {
            httpUrl: 'http://test-server',
          },
          false,
        );

        expect(transport).toEqual(
          new StreamableHTTPClientTransport(new URL('http://test-server'), {}),
        );
      });

      it('with headers', async () => {
        const transport = createTransport(
          'test-server',
          {
            httpUrl: 'http://test-server',
            headers: { Authorization: 'derp' },
          },
          false,
        );

        expect(transport).toEqual(
          new StreamableHTTPClientTransport(new URL('http://test-server'), {
            requestInit: {
              headers: { Authorization: 'derp' },
            },
          }),
        );
      });
    });

    describe('should connect via url', () => {
      it('without headers', async () => {
        const transport = createTransport(
          'test-server',
          {
            url: 'http://test-server',
          },
          false,
        );
        expect(transport).toEqual(
          new SSEClientTransport(new URL('http://test-server'), {}),
        );
      });

      it('with headers', async () => {
        const transport = createTransport(
          'test-server',
          {
            url: 'http://test-server',
            headers: { Authorization: 'derp' },
          },
          false,
        );

        expect(transport).toEqual(
          new SSEClientTransport(new URL('http://test-server'), {
            requestInit: {
              headers: { Authorization: 'derp' },
            },
          }),
        );
      });
    });

    it('should connect via command', () => {
      const mockedTransport = vi.mocked(SdkClientStdioLib.StdioClientTransport);

      createTransport(
        'test-server',
        {
          command: 'test-command',
          args: ['--foo', 'bar'],
          env: { FOO: 'bar' },
          cwd: 'test/cwd',
        },
        false,
      );

      expect(mockedTransport).toHaveBeenCalledWith({
        command: 'test-command',
        args: ['--foo', 'bar'],
        cwd: 'test/cwd',
        env: { FOO: 'bar' },
        stderr: 'pipe',
      });
    });
  });
  describe('generateValidName', () => {
    it('should return a valid name for a simple function', () => {
      const funcDecl = { name: 'myFunction' };
      const serverName = 'myServer';
      const result = generateValidName(funcDecl, serverName);
      expect(result).toBe('myServer__myFunction');
    });

    it('should prepend the server name', () => {
      const funcDecl = { name: 'anotherFunction' };
      const serverName = 'production-server';
      const result = generateValidName(funcDecl, serverName);
      expect(result).toBe('production-server__anotherFunction');
    });

    it('should replace invalid characters with underscores', () => {
      const funcDecl = { name: 'invalid-name with spaces' };
      const serverName = 'test_server';
      const result = generateValidName(funcDecl, serverName);
      expect(result).toBe('test_server__invalid-name_with_spaces');
    });

    it('should truncate long names', () => {
      const funcDecl = {
        name: 'a_very_long_function_name_that_will_definitely_exceed_the_limit',
      };
      const serverName = 'a_long_server_name';
      const result = generateValidName(funcDecl, serverName);
      expect(result.length).toBe(63);
      expect(result).toBe(
        'a_long_server_name__a_very_l___will_definitely_exceed_the_limit',
      );
    });

    it('should handle names with only invalid characters', () => {
      const funcDecl = { name: '!@#$%^&*()' };
      const serverName = 'special-chars';
      const result = generateValidName(funcDecl, serverName);
      expect(result).toBe('special-chars____________');
    });

    it('should handle names that are already valid', () => {
      const funcDecl = { name: 'already_valid' };
      const serverName = 'validator';
      const result = generateValidName(funcDecl, serverName);
      expect(result).toBe('validator__already_valid');
    });

    it('should handle names with leading/trailing invalid characters', () => {
      const funcDecl = { name: '-_invalid-_' };
      const serverName = 'trim-test';
      const result = generateValidName(funcDecl, serverName);
      expect(result).toBe('trim-test__-_invalid-_');
    });

    it('should handle names that are exactly 63 characters long', () => {
      const longName = 'a'.repeat(45);
      const funcDecl = { name: longName };
      const serverName = 'server';
      const result = generateValidName(funcDecl, serverName);
      expect(result).toBe(`server__${longName}`);
      expect(result.length).toBe(53);
    });

    it('should handle names that are exactly 64 characters long', () => {
      const longName = 'a'.repeat(55);
      const funcDecl = { name: longName };
      const serverName = 'server';
      const result = generateValidName(funcDecl, serverName);
      expect(result.length).toBe(63);
      expect(result).toBe(
        'server__aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      );
    });

    it('should handle names that are longer than 64 characters', () => {
      const longName = 'a'.repeat(100);
      const funcDecl = { name: longName };
      const serverName = 'long-server';
      const result = generateValidName(funcDecl, serverName);
      expect(result.length).toBe(63);
      expect(result).toBe(
        'long-server__aaaaaaaaaaaaaaa___aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      );
    });
  });
  describe('isEnabled', () => {
    const funcDecl = { name: 'myTool' };
    const serverName = 'myServer';

    it('should return true if no include or exclude lists are provided', () => {
      const mcpServerConfig = {};
      expect(isEnabled(funcDecl, serverName, mcpServerConfig)).toBe(true);
    });

    it('should return false if the tool is in the exclude list', () => {
      const mcpServerConfig = { excludeTools: ['myTool'] };
      expect(isEnabled(funcDecl, serverName, mcpServerConfig)).toBe(false);
    });

    it('should return true if the tool is in the include list', () => {
      const mcpServerConfig = { includeTools: ['myTool'] };
      expect(isEnabled(funcDecl, serverName, mcpServerConfig)).toBe(true);
    });

    it('should return true if the tool is in the include list with parentheses', () => {
      const mcpServerConfig = { includeTools: ['myTool()'] };
      expect(isEnabled(funcDecl, serverName, mcpServerConfig)).toBe(true);
    });

    it('should return false if the include list exists but does not contain the tool', () => {
      const mcpServerConfig = { includeTools: ['anotherTool'] };
      expect(isEnabled(funcDecl, serverName, mcpServerConfig)).toBe(false);
    });

    it('should return false if the tool is in both the include and exclude lists', () => {
      const mcpServerConfig = {
        includeTools: ['myTool'],
        excludeTools: ['myTool'],
      };
      expect(isEnabled(funcDecl, serverName, mcpServerConfig)).toBe(false);
    });

    it('should return false if the function declaration has no name', () => {
      const namelessFuncDecl = {};
      const mcpServerConfig = {};
      expect(isEnabled(namelessFuncDecl, serverName, mcpServerConfig)).toBe(
        false,
      );
    });
  });
});
