/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SSHToolParams } from './ssh.js';
import { SSHTool } from './ssh.js';
import type { Config } from '../config/config.js';
import { createMockMessageBus } from '../test-utils/mock-message-bus.js';

// Mock ssh2
vi.mock('ssh2', () => ({
  Client: vi.fn().mockImplementation(() => {
    const handlers: Record<string, Array<(...args: unknown[]) => void>> = {};
    return {
      on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
        if (!handlers[event]) {
          handlers[event] = [];
        }
        handlers[event].push(handler);
        return { on: vi.fn() };
      }),
      connect: vi.fn(),
      exec: vi.fn(),
      end: vi.fn(),
      _handlers: handlers,
      _emit: (event: string, ...args: unknown[]) => {
        if (handlers[event]) {
          for (const handler of handlers[event]) {
            handler(...args);
          }
        }
      },
    };
  }),
}));

vi.mock('../config/config.js');

describe('SSHTool', () => {
  let tool: SSHTool;

  beforeEach(() => {
    const mockConfigInstance = {
      getTargetDir: () => '/tmp/test',
      getWorkingDir: () => '/tmp/test',
      isPathAllowed: () => false,
      validatePathAccess: () => null,
    } as unknown as Config;
    tool = new SSHTool(mockConfigInstance, createMockMessageBus());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('build', () => {
    it('should return an invocation for valid params', () => {
      const params: SSHToolParams = {
        host: 'example.com',
        username: 'admin',
        command: 'uptime',
      };
      const invocation = tool.build(params);
      expect(invocation).toBeDefined();
      expect(invocation.params).toEqual(params);
    });

    it('should throw an error for empty host', () => {
      const params: SSHToolParams = {
        host: '',
        username: 'admin',
        command: 'uptime',
      };
      expect(() => tool.build(params)).toThrow('SSH host cannot be empty.');
    });

    it('should throw an error for empty username', () => {
      const params: SSHToolParams = {
        host: 'example.com',
        username: '',
        command: 'uptime',
      };
      expect(() => tool.build(params)).toThrow('SSH username cannot be empty.');
    });

    it('should throw an error for empty command', () => {
      const params: SSHToolParams = {
        host: 'example.com',
        username: 'admin',
        command: '',
      };
      expect(() => tool.build(params)).toThrow('SSH command cannot be empty.');
    });

    it('should throw an error for invalid port', () => {
      const params: SSHToolParams = {
        host: 'example.com',
        username: 'admin',
        command: 'uptime',
        port: 99999,
      };
      expect(() => tool.build(params)).toThrow(
        'SSH port must be between 1 and 65535.',
      );
    });

    it('should accept valid port', () => {
      const params: SSHToolParams = {
        host: 'example.com',
        username: 'admin',
        command: 'uptime',
        port: 2222,
      };
      const invocation = tool.build(params);
      expect(invocation).toBeDefined();
    });
  });

  describe('getDescription', () => {
    it('should return a description with host and command', () => {
      const params: SSHToolParams = {
        host: 'r1.lab.local',
        username: 'cisco',
        command: 'show ip bgp summary',
      };
      const invocation = tool.build(params);
      expect(invocation.getDescription()).toBe(
        'show ip bgp summary [on cisco@r1.lab.local:22]',
      );
    });

    it('should include custom port in description', () => {
      const params: SSHToolParams = {
        host: 'r1.lab.local',
        username: 'cisco',
        command: 'uptime',
        port: 2222,
      };
      const invocation = tool.build(params);
      expect(invocation.getDescription()).toBe(
        'uptime [on cisco@r1.lab.local:2222]',
      );
    });

    it('should include description field if provided', () => {
      const params: SSHToolParams = {
        host: 'r1.lab.local',
        username: 'cisco',
        command: 'show ip bgp summary',
        description: 'Check BGP neighbors',
      };
      const invocation = tool.build(params);
      expect(invocation.getDescription()).toBe(
        'show ip bgp summary [on cisco@r1.lab.local:22] (Check BGP neighbors)',
      );
    });
  });

  describe('execute', () => {
    it('should return cancelled message if aborted before start', async () => {
      const params: SSHToolParams = {
        host: 'example.com',
        username: 'admin',
        command: 'uptime',
      };
      const invocation = tool.build(params);
      const controller = new AbortController();
      controller.abort();
      const result = await invocation.execute(controller.signal);
      expect(result.llmContent).toBe(
        'SSH command was cancelled before it could start.',
      );
    });

    it('should reject private key paths outside allowed directories', async () => {
      const params: SSHToolParams = {
        host: 'example.com',
        username: 'admin',
        command: 'uptime',
        private_key_path: '/etc/passwd',
      };
      const invocation = tool.build(params);
      const controller = new AbortController();
      const result = await invocation.execute(controller.signal);
      expect(result.llmContent).toContain('outside of the allowed directories');
      expect(result.error).toBeDefined();
      expect(result.error?.type).toBe('ssh_connection_error');
    });
  });

  describe('schema', () => {
    it('should return a valid schema', () => {
      const schema = tool.getSchema();
      expect(schema).toBeDefined();
      expect(schema.name).toBe('ssh_command');
      expect(schema.parametersJsonSchema).toBeDefined();
      const jsonSchema = schema.parametersJsonSchema as { required?: string[] };
      expect(jsonSchema.required).toContain('host');
      expect(jsonSchema.required).toContain('username');
      expect(jsonSchema.required).toContain('command');
    });
  });
});
