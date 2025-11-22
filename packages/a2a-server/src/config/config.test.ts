/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import { mergeMcpServers, setTargetDir, loadEnvironment } from './config.js';
import type { Settings } from './settings.js';
import type { Extension } from './extension.js';
import { CoderAgentEvent } from '../types.js';

// Mock modules
vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    existsSync: vi.fn(),
  };
});

vi.mock('dotenv', () => ({
  default: {
    config: vi.fn(),
  },
  config: vi.fn(),
}));

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return {
    ...actual,
    default: {
      ...actual,
      homedir: vi.fn(() => '/home/testuser'),
    },
    homedir: vi.fn(() => '/home/testuser'),
  };
});

describe('config utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('mergeMcpServers', () => {
    it('should merge MCP servers from settings and extensions', () => {
      const settings: Settings = {
        mcpServers: {
          server1: { command: 'cmd1', args: ['arg1'] },
          server2: { command: 'cmd2', args: ['arg2'] },
        },
      };

      const extensions: Extension[] = [
        {
          name: 'ext1',
          version: '1.0.0',
          config: {
            mcpServers: {
              server3: { command: 'cmd3', args: ['arg3'] },
            },
          },
          contextFiles: [],
        },
      ];

      const result = mergeMcpServers(settings, extensions);

      expect(result).toEqual({
        server1: { command: 'cmd1', args: ['arg1'] },
        server2: { command: 'cmd2', args: ['arg2'] },
        server3: { command: 'cmd3', args: ['arg3'] },
      });
    });

    it('should prioritize settings over extension servers with same key', () => {
      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {});

      const settings: Settings = {
        mcpServers: {
          server1: { command: 'cmd1', args: ['arg1'] },
        },
      };

      const extensions: Extension[] = [
        {
          name: 'ext1',
          version: '1.0.0',
          config: {
            mcpServers: {
              server1: { command: 'cmd-override', args: ['arg-override'] },
            },
          },
          contextFiles: [],
        },
      ];

      const result = mergeMcpServers(settings, extensions);

      expect(result.server1).toEqual({ command: 'cmd1', args: ['arg1'] });
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Skipping extension MCP config'),
      );

      consoleWarnSpy.mockRestore();
    });

    it('should handle empty settings mcpServers', () => {
      const settings: Settings = {};
      const extensions: Extension[] = [
        {
          name: 'ext1',
          version: '1.0.0',
          config: {
            mcpServers: {
              server1: { command: 'cmd1', args: ['arg1'] },
            },
          },
          contextFiles: [],
        },
      ];

      const result = mergeMcpServers(settings, extensions);

      expect(result).toEqual({
        server1: { command: 'cmd1', args: ['arg1'] },
      });
    });

    it('should handle empty extensions array', () => {
      const settings: Settings = {
        mcpServers: {
          server1: { command: 'cmd1', args: ['arg1'] },
        },
      };

      const result = mergeMcpServers(settings, []);

      expect(result).toEqual({
        server1: { command: 'cmd1', args: ['arg1'] },
      });
    });

    it('should handle multiple extensions with different servers', () => {
      const settings: Settings = {
        mcpServers: {
          server1: { command: 'cmd1', args: ['arg1'] },
        },
      };

      const extensions: Extension[] = [
        {
          name: 'ext1',
          version: '1.0.0',
          config: {
            mcpServers: {
              server2: { command: 'cmd2', args: ['arg2'] },
            },
          },
          contextFiles: [],
        },
        {
          name: 'ext2',
          version: '1.0.0',
          config: {
            mcpServers: {
              server3: { command: 'cmd3', args: ['arg3'] },
            },
          },
          contextFiles: [],
        },
      ];

      const result = mergeMcpServers(settings, extensions);

      expect(result).toEqual({
        server1: { command: 'cmd1', args: ['arg1'] },
        server2: { command: 'cmd2', args: ['arg2'] },
        server3: { command: 'cmd3', args: ['arg3'] },
      });
    });
  });

  describe('setTargetDir', () => {
    let originalCwd: string;
    let chdirSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      originalCwd = process.cwd();
      chdirSpy = vi.spyOn(process, 'chdir').mockImplementation(() => {});
    });

    afterEach(() => {
      chdirSpy.mockRestore();
      delete process.env['CODER_AGENT_WORKSPACE_PATH'];
    });

    it('should return current directory when no settings provided', () => {
      const result = setTargetDir(undefined);
      expect(result).toBe(originalCwd);
      expect(chdirSpy).not.toHaveBeenCalled();
    });

    it('should use CODER_AGENT_WORKSPACE_PATH env var if set', () => {
      process.env['CODER_AGENT_WORKSPACE_PATH'] = '/workspace/test';
      const result = setTargetDir(undefined);

      expect(chdirSpy).toHaveBeenCalledWith(path.resolve('/workspace/test'));
      expect(result).toBe(path.resolve('/workspace/test'));
    });

    it('should use workspacePath from agent settings', () => {
      const agentSettings = {
        kind: CoderAgentEvent.StateAgentSettingsEvent,
        workspacePath: '/custom/workspace',
      };

      const result = setTargetDir(agentSettings);

      expect(chdirSpy).toHaveBeenCalledWith(path.resolve('/custom/workspace'));
      expect(result).toBe(path.resolve('/custom/workspace'));
    });

    it('should prioritize env var over agent settings', () => {
      process.env['CODER_AGENT_WORKSPACE_PATH'] = '/env/workspace';
      const agentSettings = {
        kind: CoderAgentEvent.StateAgentSettingsEvent,
        workspacePath: '/settings/workspace',
      };

      const result = setTargetDir(agentSettings);

      expect(chdirSpy).toHaveBeenCalledWith(path.resolve('/env/workspace'));
      expect(result).toBe(path.resolve('/env/workspace'));
    });

    it('should handle chdir errors gracefully', async () => {
      const { logger } = await import('../utils/logger.js');
      chdirSpy.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      process.env['CODER_AGENT_WORKSPACE_PATH'] = '/invalid/path';
      const result = setTargetDir(undefined);

      expect(result).toBe(originalCwd);
      expect(vi.mocked(logger.error)).toHaveBeenCalledWith(
        expect.stringContaining('Error resolving workspace path'),
      );
    });

    it('should return original cwd when agent settings has wrong kind', () => {
      const agentSettings = {
        kind: 'other-event-kind' as unknown,
        workspacePath: '/custom/workspace',
      };

      const result = setTargetDir(agentSettings);

      expect(result).toBe(originalCwd);
      expect(chdirSpy).not.toHaveBeenCalled();
    });
  });

  describe('loadEnvironment', () => {
    let existsSyncSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(async () => {
      const fs = await import('node:fs');
      existsSyncSpy = vi.spyOn(fs, 'existsSync');
    });

    afterEach(() => {
      existsSyncSpy.mockRestore();
    });

    it('should load .env file from .gemini directory if exists', async () => {
      const dotenv = await import('dotenv');
      existsSyncSpy.mockImplementation(
        (path: unknown) =>
          String(path).includes('.gemini/.env') &&
          !String(path).includes(process.env.HOME || '/home/testuser'),
      );

      loadEnvironment();

      expect(vi.mocked(dotenv.config)).toHaveBeenCalledWith({
        path: expect.stringContaining('.gemini/.env'),
        override: true,
      });
    });

    it('should load .env file from current directory if .gemini/.env not found', async () => {
      const dotenv = await import('dotenv');
      existsSyncSpy.mockImplementation(
        (path: unknown) =>
          String(path).endsWith('.env') && !String(path).includes('.gemini'),
      );

      loadEnvironment();

      expect(vi.mocked(dotenv.config)).toHaveBeenCalledWith({
        path: expect.stringContaining('.env'),
        override: true,
      });
    });

    it('should not load .env if no file exists', async () => {
      const dotenv = await import('dotenv');
      existsSyncSpy.mockReturnValue(false);

      loadEnvironment();

      expect(vi.mocked(dotenv.config)).not.toHaveBeenCalled();
    });
  });
});
