/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { FatalInputError } from '@google/gemini-cli-core';
import { handleSlashCommand } from './nonInteractiveCliCommands.js';
import { CommandService } from './services/CommandService.js';
import { CommandKind, type SlashCommand } from './ui/commands/types.js';
import type { Config } from '@google/gemini-cli-core';
import type { LoadedSettings } from './config/settings.js';

vi.mock('./services/CommandService.js', () => ({
  CommandService: {
    create: vi.fn(),
  },
}));
vi.mock('./ui/noninteractive/nonInteractiveUi.js', () => ({
  createNonInteractiveUI: vi.fn().mockReturnValue({}),
}));

function mockCommands(commands: SlashCommand[]) {
  vi.mocked(CommandService.create).mockResolvedValue({
    getCommands: () => commands,
    getConflicts: () => [],
  } as unknown as CommandService);
}

describe('handleSlashCommand (non-interactive)', () => {
  let mockConfig: Config;
  let mockSettings: LoadedSettings;
  let abortController: AbortController;

  beforeEach(() => {
    vi.clearAllMocks();
    abortController = new AbortController();
    // The loaders passed to CommandService.create are still constructed even
    // though create() is mocked, so the config must expose the methods each
    // loader touches in its constructor.
    mockConfig = {
      getSessionId: vi.fn().mockReturnValue('session-id'),
      storage: {},
      getFolderTrust: vi.fn().mockReturnValue(false),
      isTrustedFolder: vi.fn().mockReturnValue(true),
      getProjectRoot: vi.fn().mockReturnValue('/project'),
      getExtensions: vi.fn().mockReturnValue([]),
      isSkillsSupportEnabled: vi.fn().mockReturnValue(false),
      getSkillManager: vi.fn().mockReturnValue(null),
      getPromptRegistry: vi.fn().mockReturnValue(undefined),
    } as unknown as Config;
    mockSettings = {} as unknown as LoadedSettings;
  });

  it('returns undefined for input that is not a slash command', async () => {
    mockCommands([]);
    const result = await handleSlashCommand(
      'just a prompt',
      abortController,
      mockConfig,
      mockSettings,
    );
    expect(result).toBeUndefined();
  });

  it('returns the content for a submit_prompt action', async () => {
    mockCommands([
      {
        name: 'foo',
        description: 'foo',
        kind: CommandKind.BUILT_IN,
        action: async () => ({
          type: 'submit_prompt',
          content: 'hello model',
        }),
      },
    ]);

    const result = await handleSlashCommand(
      '/foo',
      abortController,
      mockConfig,
      mockSettings,
    );
    expect(result).toBe('hello model');
  });

  it('forwards postSubmitPrompt for a tool action (skill activation)', async () => {
    mockCommands([
      {
        name: 'my-skill',
        description: 'Activate the my-skill skill',
        kind: CommandKind.SKILL,
        autoExecute: true,
        action: async () => ({
          type: 'tool',
          toolName: 'activate_skill',
          toolArgs: { name: 'my-skill' },
          postSubmitPrompt: 'Use the skill my-skill',
        }),
      },
    ]);

    const result = await handleSlashCommand(
      '/my-skill',
      abortController,
      mockConfig,
      mockSettings,
    );
    expect(result).toBe('Use the skill my-skill');
  });

  it('throws for a tool action without a postSubmitPrompt', async () => {
    mockCommands([
      {
        name: 'bare-tool',
        description: 'bare',
        kind: CommandKind.SKILL,
        action: async () => ({
          type: 'tool',
          toolName: 'activate_skill',
          toolArgs: { name: 'bare' },
        }),
      },
    ]);

    await expect(
      handleSlashCommand(
        '/bare-tool',
        abortController,
        mockConfig,
        mockSettings,
      ),
    ).rejects.toThrow(FatalInputError);
  });

  it('throws for a confirm_shell_commands action', async () => {
    mockCommands([
      {
        name: 'needs-confirm',
        description: 'confirm',
        kind: CommandKind.BUILT_IN,
        action: async () => ({
          type: 'confirm_shell_commands',
          commandsToConfirm: ['rm -rf /'],
        }),
      },
    ] as unknown as SlashCommand[]);

    await expect(
      handleSlashCommand(
        '/needs-confirm',
        abortController,
        mockConfig,
        mockSettings,
      ),
    ).rejects.toThrow(FatalInputError);
  });
});
