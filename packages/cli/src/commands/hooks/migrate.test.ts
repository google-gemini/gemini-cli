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
  type Mock,
  type MockInstance,
} from 'vitest';
import * as fs from 'node:fs';
import { loadSettings, SettingScope } from '../../config/settings.js';
import { debugLogger } from '@google/gemini-cli-core';
import { handleMigrateFromClaude } from './migrate.js';

vi.mock('node:fs');
vi.mock('../utils.js', () => ({
  exitCli: vi.fn(),
}));

vi.mock('../../config/settings.js', async () => {
  const actual = await vi.importActual('../../config/settings.js');
  return {
    ...actual,
    loadSettings: vi.fn(),
  };
});

const mockedLoadSettings = loadSettings as Mock;
const mockedFs = vi.mocked(fs);

describe('migrate command', () => {
  let mockSetValue: Mock;
  let debugLoggerLogSpy: MockInstance;
  let debugLoggerErrorSpy: MockInstance;
  let originalCwd: () => string;

  beforeEach(() => {
    vi.resetAllMocks();

    mockSetValue = vi.fn();
    debugLoggerLogSpy = vi
      .spyOn(debugLogger, 'log')
      .mockImplementation(() => {});
    debugLoggerErrorSpy = vi
      .spyOn(debugLogger, 'error')
      .mockImplementation(() => {});

    // Mock process.cwd()
    originalCwd = process.cwd;
    process.cwd = vi.fn(() => '/test/project');

    mockedLoadSettings.mockReturnValue({
      merged: {
        hooks: {},
      },
      setValue: mockSetValue,
      workspace: { path: '/test/project/.gemini' },
    });
  });

  afterEach(() => {
    process.cwd = originalCwd;
    vi.restoreAllMocks();
  });

  it('should log error when no Claude settings files exist', async () => {
    mockedFs.existsSync.mockReturnValue(false);

    await handleMigrateFromClaude();

    expect(debugLoggerErrorSpy).toHaveBeenCalledWith(
      'No Claude Code settings found in .claude directory. Expected settings.json or settings.local.json',
    );
    expect(mockSetValue).not.toHaveBeenCalled();
  });

  it('should migrate hooks from settings.json when it exists', async () => {
    const claudeSettings = {
      hooks: {
        PreToolUse: [
          {
            matcher: 'Edit',
            hooks: [
              {
                type: 'command',
                command: 'echo "Before Edit"',
                timeout: 30,
              },
            ],
          },
        ],
      },
    };

    mockedFs.existsSync.mockImplementation((path) =>
      path.toString().endsWith('settings.json'),
    );

    mockedFs.readFileSync.mockReturnValue(JSON.stringify(claudeSettings));

    await handleMigrateFromClaude();

    expect(mockSetValue).toHaveBeenCalledWith(
      SettingScope.Workspace,
      'hooks',
      expect.objectContaining({
        BeforeTool: expect.arrayContaining([
          expect.objectContaining({
            matcher: 'replace',
            hooks: expect.arrayContaining([
              expect.objectContaining({
                command: 'echo "Before Edit"',
                type: 'command',
                timeout: 30,
              }),
            ]),
          }),
        ]),
      }),
    );

    expect(debugLoggerLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('Found Claude Code settings'),
    );
    expect(debugLoggerLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('Migrating 1 hook event'),
    );
    expect(debugLoggerLogSpy).toHaveBeenCalledWith(
      '✓ Hooks successfully migrated to .gemini/settings.json',
    );
  });

  it('should prefer settings.local.json over settings.json', async () => {
    const localSettings = {
      hooks: {
        SessionStart: [
          {
            hooks: [
              {
                type: 'command',
                command: 'echo "Local session start"',
              },
            ],
          },
        ],
      },
    };

    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.readFileSync.mockReturnValue(JSON.stringify(localSettings));

    await handleMigrateFromClaude();

    expect(mockedFs.readFileSync).toHaveBeenCalledWith(
      expect.stringContaining('settings.local.json'),
      'utf-8',
    );
    expect(mockSetValue).toHaveBeenCalledWith(
      SettingScope.Workspace,
      'hooks',
      expect.objectContaining({
        SessionStart: expect.any(Array),
      }),
    );
  });

  it('should migrate all supported event types', async () => {
    const claudeSettings = {
      hooks: {
        PreToolUse: [{ hooks: [{ type: 'command', command: 'echo 1' }] }],
        PostToolUse: [{ hooks: [{ type: 'command', command: 'echo 2' }] }],
        UserPromptSubmit: [{ hooks: [{ type: 'command', command: 'echo 3' }] }],
        Stop: [{ hooks: [{ type: 'command', command: 'echo 4' }] }],
        SubAgentStop: [{ hooks: [{ type: 'command', command: 'echo 5' }] }],
        SessionStart: [{ hooks: [{ type: 'command', command: 'echo 6' }] }],
        SessionEnd: [{ hooks: [{ type: 'command', command: 'echo 7' }] }],
        PreCompact: [{ hooks: [{ type: 'command', command: 'echo 8' }] }],
        Notification: [{ hooks: [{ type: 'command', command: 'echo 9' }] }],
      },
    };

    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.readFileSync.mockReturnValue(JSON.stringify(claudeSettings));

    await handleMigrateFromClaude();

    const migratedHooks = mockSetValue.mock.calls[0][2];

    expect(migratedHooks).toHaveProperty('BeforeTool');
    expect(migratedHooks).toHaveProperty('AfterTool');
    expect(migratedHooks).toHaveProperty('BeforeAgent');
    expect(migratedHooks).toHaveProperty('AfterAgent');
    expect(migratedHooks).toHaveProperty('SessionStart');
    expect(migratedHooks).toHaveProperty('SessionEnd');
    expect(migratedHooks).toHaveProperty('PreCompress');
    expect(migratedHooks).toHaveProperty('Notification');
  });

  it('should transform tool names in matchers', async () => {
    const claudeSettings = {
      hooks: {
        PreToolUse: [
          {
            matcher: 'Edit|Bash|Read|Write|Glob|Grep',
            hooks: [{ type: 'command', command: 'echo "test"' }],
          },
        ],
      },
    };

    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.readFileSync.mockReturnValue(JSON.stringify(claudeSettings));

    await handleMigrateFromClaude();

    const migratedHooks = mockSetValue.mock.calls[0][2];
    expect(migratedHooks.BeforeTool[0].matcher).toBe(
      'replace|run_shell_command|read_file|write_file|glob|grep',
    );
  });

  it('should replace $CLAUDE_PROJECT_DIR with $GEMINI_PROJECT_DIR', async () => {
    const claudeSettings = {
      hooks: {
        PreToolUse: [
          {
            hooks: [
              {
                type: 'command',
                command: 'cd $CLAUDE_PROJECT_DIR && ls',
              },
            ],
          },
        ],
      },
    };

    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.readFileSync.mockReturnValue(JSON.stringify(claudeSettings));

    await handleMigrateFromClaude();

    const migratedHooks = mockSetValue.mock.calls[0][2];
    expect(migratedHooks.BeforeTool[0].hooks[0].command).toBe(
      'cd $GEMINI_PROJECT_DIR && ls',
    );
  });

  it('should preserve sequential flag', async () => {
    const claudeSettings = {
      hooks: {
        PreToolUse: [
          {
            sequential: true,
            hooks: [{ type: 'command', command: 'echo "test"' }],
          },
        ],
      },
    };

    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.readFileSync.mockReturnValue(JSON.stringify(claudeSettings));

    await handleMigrateFromClaude();

    const migratedHooks = mockSetValue.mock.calls[0][2];
    expect(migratedHooks.BeforeTool[0].sequential).toBe(true);
  });

  it('should preserve timeout values', async () => {
    const claudeSettings = {
      hooks: {
        PreToolUse: [
          {
            hooks: [
              {
                type: 'command',
                command: 'echo "test"',
                timeout: 60,
              },
            ],
          },
        ],
      },
    };

    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.readFileSync.mockReturnValue(JSON.stringify(claudeSettings));

    await handleMigrateFromClaude();

    const migratedHooks = mockSetValue.mock.calls[0][2];
    expect(migratedHooks.BeforeTool[0].hooks[0].timeout).toBe(60);
  });

  it('should merge with existing Gemini hooks', async () => {
    const claudeSettings = {
      hooks: {
        PreToolUse: [
          {
            hooks: [{ type: 'command', command: 'echo "claude"' }],
          },
        ],
      },
    };

    mockedLoadSettings.mockReturnValue({
      merged: {
        hooks: {
          AfterTool: [
            {
              hooks: [{ type: 'command', command: 'echo "existing"' }],
            },
          ],
        },
      },
      setValue: mockSetValue,
      workspace: { path: '/test/project/.gemini' },
    });

    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.readFileSync.mockReturnValue(JSON.stringify(claudeSettings));

    await handleMigrateFromClaude();

    const migratedHooks = mockSetValue.mock.calls[0][2];
    expect(migratedHooks).toHaveProperty('BeforeTool');
    expect(migratedHooks).toHaveProperty('AfterTool');
    expect(migratedHooks.AfterTool[0].hooks[0].command).toBe('echo "existing"');
    expect(migratedHooks.BeforeTool[0].hooks[0].command).toBe('echo "claude"');
  });

  it('should handle JSON with comments', async () => {
    const claudeSettingsWithComments = `{
      // This is a comment
      "hooks": {
        /* Block comment */
        "PreToolUse": [
          {
            "hooks": [
              {
                "type": "command",
                "command": "echo test" // Inline comment
              }
            ]
          }
        ]
      }
    }`;

    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.readFileSync.mockReturnValue(claudeSettingsWithComments);

    await handleMigrateFromClaude();

    expect(mockSetValue).toHaveBeenCalledWith(
      SettingScope.Workspace,
      'hooks',
      expect.objectContaining({
        BeforeTool: expect.any(Array),
      }),
    );
  });

  it('should handle malformed JSON gracefully', async () => {
    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.readFileSync.mockReturnValue('{ invalid json }');

    await handleMigrateFromClaude();

    expect(debugLoggerErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Error reading'),
    );
    expect(mockSetValue).not.toHaveBeenCalled();
  });

  it('should log info when no hooks are found in Claude settings', async () => {
    const claudeSettings = {
      someOtherSetting: 'value',
    };

    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.readFileSync.mockReturnValue(JSON.stringify(claudeSettings));

    await handleMigrateFromClaude();

    expect(debugLoggerLogSpy).toHaveBeenCalledWith(
      'No hooks found in Claude Code settings to migrate.',
    );
    expect(mockSetValue).not.toHaveBeenCalled();
  });

  it('should handle setValue errors gracefully', async () => {
    const claudeSettings = {
      hooks: {
        PreToolUse: [
          {
            hooks: [{ type: 'command', command: 'echo "test"' }],
          },
        ],
      },
    };

    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.readFileSync.mockReturnValue(JSON.stringify(claudeSettings));
    mockSetValue.mockImplementation(() => {
      throw new Error('Failed to save');
    });

    await handleMigrateFromClaude();

    expect(debugLoggerErrorSpy).toHaveBeenCalledWith(
      'Error saving migrated hooks: Failed to save',
    );
  });

  it('should handle hooks with matcher but no command', async () => {
    const claudeSettings = {
      hooks: {
        PreToolUse: [
          {
            matcher: 'Edit',
            hooks: [
              {
                type: 'command',
              },
            ],
          },
        ],
      },
    };

    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.readFileSync.mockReturnValue(JSON.stringify(claudeSettings));

    await handleMigrateFromClaude();

    const migratedHooks = mockSetValue.mock.calls[0][2];
    expect(migratedHooks.BeforeTool[0].matcher).toBe('replace');
    expect(migratedHooks.BeforeTool[0].hooks[0].type).toBe('command');
  });

  it('should handle empty hooks array', async () => {
    const claudeSettings = {
      hooks: {
        PreToolUse: [
          {
            hooks: [],
          },
        ],
      },
    };

    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.readFileSync.mockReturnValue(JSON.stringify(claudeSettings));

    await handleMigrateFromClaude();

    const migratedHooks = mockSetValue.mock.calls[0][2];
    expect(migratedHooks.BeforeTool[0].hooks).toEqual([]);
  });

  it('should handle non-array event config gracefully', async () => {
    const claudeSettings = {
      hooks: {
        PreToolUse: 'not an array',
        PostToolUse: [
          {
            hooks: [{ type: 'command', command: 'echo "test"' }],
          },
        ],
      },
    };

    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.readFileSync.mockReturnValue(JSON.stringify(claudeSettings));

    await handleMigrateFromClaude();

    const migratedHooks = mockSetValue.mock.calls[0][2];
    expect(migratedHooks).not.toHaveProperty('BeforeTool');
    expect(migratedHooks).toHaveProperty('AfterTool');
  });

  it('should display migration instructions after successful migration', async () => {
    const claudeSettings = {
      hooks: {
        PreToolUse: [
          {
            hooks: [{ type: 'command', command: 'echo "test"' }],
          },
        ],
      },
    };

    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.readFileSync.mockReturnValue(JSON.stringify(claudeSettings));

    await handleMigrateFromClaude();

    expect(debugLoggerLogSpy).toHaveBeenCalledWith(
      '✓ Hooks successfully migrated to .gemini/settings.json',
    );
    expect(debugLoggerLogSpy).toHaveBeenCalledWith(
      '\nMigration complete! Please review the migrated hooks in .gemini/settings.json',
    );
    expect(debugLoggerLogSpy).toHaveBeenCalledWith(
      'Note: Set hooks.enabled to true in your settings to enable the hook system.',
    );
  });
});
