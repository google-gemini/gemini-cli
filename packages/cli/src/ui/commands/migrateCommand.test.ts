/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { migrateCommand } from './migrateCommand.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import * as fs from 'node:fs/promises';
import { SettingScope } from '../../config/settings.js';

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    MessageType: {
      INFO: 'info',
      ERROR: 'error',
      WARNING: 'warning',
      USER: 'user',
    },
  };
});

vi.mock('node:fs/promises', () => ({
  access: vi.fn(),
  copyFile: vi.fn(),
  readFile: vi.fn(),
  readdir: vi.fn(),
  mkdir: vi.fn(),
  writeFile: vi.fn(),
}));

describe('migrateCommand', () => {
  let mockContext: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockContext = createMockCommandContext({
      services: {
        config: {
          getMcpClientManager: vi.fn().mockReturnValue({
            restart: vi.fn().mockResolvedValue(undefined),
          }),
          getSkillManager: vi.fn().mockReturnValue({
            getAllSkills: vi.fn().mockReturnValue([]),
          }),
        },
        settings: {
          merged: { mcpServers: {}, hooks: {} },
          setValue: vi.fn(),
        },
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const getSubCommand = (name: string) => {
    return migrateCommand.subCommands?.find((cmd) => cmd.name === name);
  };

  describe('/migrate claude', () => {
    it('should migrate CLAUDE.md to GEMINI.md', async () => {
      const claudeSubCommand = getSubCommand('claude');
      if (!claudeSubCommand?.action) throw new Error('Action not found');

      vi.mocked(fs.access)
        .mockImplementation((path: any) => {
          if (path.includes('CLAUDE.md')) return Promise.resolve();
          if (path.includes('GEMINI.md')) return Promise.reject(new Error('ENOENT'));
          return Promise.reject(new Error('ENOENT'));
        });

      vi.mocked(fs.readFile).mockResolvedValue('Claude instructions');

      const result = (await claudeSubCommand.action(mockContext, '')) as any;

      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('GEMINI.md'),
        'Claude instructions',
      );
      expect(result.type).toBe('message');
      if (result.type === 'message') {
        expect(result.content).toContain('Migrated CLAUDE.md into GEMINI.md');
        expect(result.content).toContain('Quick Tip');
      }
    });

    it('should skip CLAUDE.md migration if GEMINI.md already exists', async () => {
      const claudeSubCommand = getSubCommand('claude');
      if (!claudeSubCommand?.action) throw new Error('Action not found');

      vi.mocked(fs.access)
        .mockImplementation((path: any) => {
          if (path.includes('CLAUDE.md')) return Promise.resolve();
          if (path.includes('GEMINI.md')) return Promise.resolve();
          return Promise.reject(new Error('ENOENT'));
        });

      vi.mocked(fs.readFile).mockResolvedValue('Claude instructions');

      const result = (await claudeSubCommand.action(mockContext, '')) as any;

      expect(fs.writeFile).not.toHaveBeenCalledWith(expect.stringContaining('GEMINI.md'), expect.anything());
      if (result.type === 'message') {
        expect(result.content).toContain('GEMINI.md already exists, skipping');
      }
    });

    it('should migrate MCP servers from .claude.json', async () => {
      const claudeSubCommand = getSubCommand('claude');
      if (!claudeSubCommand?.action) throw new Error('Action not found');

      const claudeJson = {
        mcpServers: {
          'test-server': {
            command: 'node',
            args: ['server.js'],
          },
        },
      };

      vi.mocked(fs.access).mockImplementation(() => Promise.reject(new Error('ENOENT')));
      vi.mocked(fs.readFile).mockImplementation((path: any) => {
        if (path.includes('.claude.json')) return Promise.resolve(JSON.stringify(claudeJson));
        return Promise.reject(new Error('ENOENT'));
      });

      const result = (await claudeSubCommand.action(mockContext, '')) as any;

      expect(mockContext.services.settings.setValue).toHaveBeenCalledWith(
        SettingScope.User,
        'mcpServers',
        expect.objectContaining({
          'test-server': claudeJson.mcpServers['test-server'],
        }),
      );
      if (result.type === 'message') {
        expect(result.content).toContain('Connected 1 MCP Server(s) (test-server)');
      }
      expect(mockContext.services.config.getMcpClientManager().restart).toHaveBeenCalled();
    });

    it('should not overwrite existing MCP servers', async () => {
      const claudeSubCommand = getSubCommand('claude');
      if (!claudeSubCommand?.action) throw new Error('Action not found');

      mockContext.services.settings.merged.mcpServers = {
        'test-server': { command: 'existing' },
      };

      const claudeJson = {
        mcpServers: {
          'test-server': { command: 'new' },
          'another-server': { command: 'another' },
        },
      };

      vi.mocked(fs.access).mockImplementation(() => Promise.reject(new Error('ENOENT')));
      vi.mocked(fs.readFile).mockImplementation((path: any) => {
        if (path.includes('.claude.json')) return Promise.resolve(JSON.stringify(claudeJson));
        return Promise.reject(new Error('ENOENT'));
      });

      const result = (await claudeSubCommand.action(mockContext, '')) as any;

      expect(mockContext.services.settings.setValue).toHaveBeenCalledWith(
        SettingScope.User,
        'mcpServers',
        expect.objectContaining({
          'test-server': { command: 'existing' },
          'another-server': { command: 'another' },
        }),
      );
      if (result.type === 'message') {
        expect(result.content).toContain('Connected 1 MCP Server(s) (another-server)');
      }
    });

    it('should migrate custom commands from .claude/commands/', async () => {
      const claudeSubCommand = getSubCommand('claude');
      if (!claudeSubCommand?.action) throw new Error('Action not found');

      vi.mocked(fs.access).mockImplementation(() => {
        const error: any = new Error('ENOENT');
        error.code = 'ENOENT';
        return Promise.reject(error);
      });
      vi.mocked(fs.readdir).mockImplementation((path: any) => {
        if (path.includes('commands')) return Promise.resolve(['test.md'] as any);
        return Promise.resolve([] as any);
      });
      vi.mocked(fs.readFile).mockImplementation((path: any) => {
        if (path.includes('test.md')) return Promise.resolve('Run $ARGUMENTS');
        return Promise.reject(new Error('ENOENT'));
      });

      const result = (await claudeSubCommand.action(mockContext, '')) as any;

      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('test.toml'),
        expect.stringContaining('prompt = """\nRun {{args}}\n"""'),
      );
      expect(result.content).toContain('Ported 1 custom slash command(s)');
    });

    it('should migrate skills from .claude/skills/', async () => {
      const claudeSubCommand = getSubCommand('claude');
      if (!claudeSubCommand?.action) throw new Error('Action not found');

      vi.mocked(fs.access).mockImplementation((path: any) => {
        if (path.includes('GEMINI.md')) return Promise.resolve();
        return Promise.reject(new Error('ENOENT'));
      });
      vi.mocked(fs.readdir).mockImplementation((path: any) => {
        if (path.includes('skills')) {
          return Promise.resolve([{ name: 'test-skill', isDirectory: () => true, isFile: () => false }] as any);
        }
        return Promise.resolve([] as any);
      });
      vi.mocked(fs.readFile).mockImplementation((path: any) => {
        if (path.includes('SKILL.md')) return Promise.resolve('Skill body');
        if (path.includes('GEMINI.md')) return Promise.resolve('Current Gemini content');
        return Promise.reject(new Error('ENOENT'));
      });

      const result = (await claudeSubCommand.action(mockContext, '')) as any;

      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('test-skill/SKILL.md'),
        expect.stringContaining('name: test-skill'),
      );
      expect(result.content).toContain('Ported 1 skill(s) to .gemini/skills/');
      expect(result.content).toContain('Added modular @imports');
    });

    it('should migrate hooks from .claude/settings.json with tool mapping', async () => {
      const claudeSubCommand = getSubCommand('claude');
      if (!claudeSubCommand?.action) throw new Error('Action not found');

      const claudeSettings = {
        hooks: {
          PostToolUse: [
            {
              matcher: 'Edit',
              hooks: [{ command: 'ls $CLAUDE_PROJECT_DIR' }],
            },
          ],
        },
      };

      vi.mocked(fs.access).mockImplementation(() => {
        const error: any = new Error('ENOENT');
        error.code = 'ENOENT';
        return Promise.reject(error);
      });
      vi.mocked(fs.readdir).mockResolvedValue([] as any);
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(claudeSettings));

      const result = (await claudeSubCommand.action(mockContext, '')) as any;

      expect(mockContext.services.settings.setValue).toHaveBeenCalledWith(
        SettingScope.Workspace,
        'hooks',
        expect.objectContaining({
          AfterTool: expect.arrayContaining([
            expect.objectContaining({
              matcher: 'replace',
              hooks: [expect.objectContaining({ command: 'ls $GEMINI_PROJECT_DIR' })],
            }),
          ]),
        }),
      );
      expect(result.content).toContain('Migrated 1 automated hook(s)');
    });

    it('should update bash scripts with --output-format json', async () => {
      const claudeSubCommand = getSubCommand('claude');
      if (!claudeSubCommand?.action) throw new Error('Action not found');

      vi.mocked(fs.access).mockImplementation(() => {
        const error: any = new Error('ENOENT');
        error.code = 'ENOENT';
        return Promise.reject(error);
      });
      vi.mocked(fs.readdir).mockResolvedValue(['ralph.sh'] as any);
      vi.mocked(fs.readFile).mockResolvedValue('claude "fix bug"');

      const result = (await claudeSubCommand.action(mockContext, '')) as any;

      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('ralph.sh'),
        'gemini --output-format json "fix bug"',
      );
      expect(result.content).toContain('Updated 1 script(s)');
    });

    it('should generate suggested policy from .claude/settings.local.json', async () => {
      const claudeSubCommand = getSubCommand('claude');
      if (!claudeSubCommand?.action) throw new Error('Action not found');

      const localSettings = {
        approvedCommands: ['npm test', 'git status'],
      };

      vi.mocked(fs.access).mockImplementation(() => {
        const error: any = new Error('ENOENT');
        error.code = 'ENOENT';
        return Promise.reject(error);
      });
      vi.mocked(fs.readdir).mockResolvedValue([] as any);
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(localSettings));

      const result = (await claudeSubCommand.action(mockContext, '')) as any;

      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('suggested_policy.toml'),
        expect.stringContaining('commandPrefix = "npm test"'),
      );
      expect(result.content).toContain('Generated suggested policy');
    });

    it('should return error if no artifacts found', async () => {
      const claudeSubCommand = getSubCommand('claude');
      if (!claudeSubCommand?.action) throw new Error('Action not found');

      vi.mocked(fs.access).mockImplementation(() => {
        const error: any = new Error('ENOENT');
        error.code = 'ENOENT';
        return Promise.reject(error);
      });
      vi.mocked(fs.readdir).mockImplementation(() => {
        const error: any = new Error('ENOENT');
        error.code = 'ENOENT';
        return Promise.reject(error);
      });
      vi.mocked(fs.readFile).mockImplementation(() => {
        const error: any = new Error('ENOENT');
        error.code = 'ENOENT';
        return Promise.reject(error);
      });

      const result = (await claudeSubCommand.action(mockContext, '')) as any;

      if (result.type === 'message') {
        expect(result.content).toContain('No Claude Code artifacts found');
      }
    });
  });
});
