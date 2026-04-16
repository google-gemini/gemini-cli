/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { forumCommand } from './forumCommand.js';
import type { CommandContext, SlashCommand } from './types.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { loadForumPresets, type ForumPreset } from '@google/gemini-cli-core';
import { MessageType } from '../types.js';

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    loadForumPresets: vi.fn(),
  };
});

function getSubCommand(name: string): SlashCommand {
  const command = forumCommand.subCommands?.find((c) => c.name === name);
  if (!command?.action) {
    throw new Error(`Missing /forum ${name} action.`);
  }
  return command;
}

describe('forumCommand', () => {
  let mockContext: CommandContext;

  beforeEach(() => {
    mockContext = createMockCommandContext({
      services: {
        agentContext: {
          config: {},
        },
      },
    } as unknown as CommandContext);

    vi.mocked(loadForumPresets).mockResolvedValue([]);
  });

  it('starts forum mode with main conversation context by default', async () => {
    const startCommand = forumCommand.subCommands?.find(
      (command) => command.name === 'start',
    );
    if (!startCommand?.action) {
      throw new Error('Missing /forum start action.');
    }

    await startCommand.action(mockContext, 'design-forum');

    expect(mockContext.ui.startForumMode).toHaveBeenCalledWith('design-forum', {
      includeMainConversationContext: true,
    });
  });

  it('starts forum mode in incognito mode when requested', async () => {
    const startCommand = forumCommand.subCommands?.find(
      (command) => command.name === 'start',
    );
    if (!startCommand?.action) {
      throw new Error('Missing /forum start action.');
    }

    await startCommand.action(mockContext, '--incognito design-forum');

    expect(mockContext.ui.startForumMode).toHaveBeenCalledWith('design-forum', {
      includeMainConversationContext: false,
    });
  });

  it('returns an error for unknown options', async () => {
    const startCommand = forumCommand.subCommands?.find(
      (command) => command.name === 'start',
    );
    if (!startCommand?.action) {
      throw new Error('Missing /forum start action.');
    }

    const result = await startCommand.action(
      mockContext,
      '--unknown design-forum',
    );

    expect(result).toEqual({
      type: 'message',
      messageType: 'error',
      content:
        'Unknown option: --unknown\nUsage: /forum start [--incognito] <preset-name>',
    });
  });

  describe('/forum list', () => {
    it('returns the no-presets info when nothing is loaded', async () => {
      const listCommand = getSubCommand('list');

      const result = await listCommand.action!(mockContext, '');

      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content:
          'No forum presets found in ~/.gemini/forums or .gemini/forums.',
      });
    });

    it('renders a rich block per preset with member configs', async () => {
      vi.mocked(loadForumPresets).mockResolvedValue([
        {
          name: 'review',
          description: 'Code review forum',
          maxRounds: 5,
          minDiscussionRounds: 3,
          source: { path: '/tmp/forums/review.json', scope: 'user' },
          members: [
            {
              memberId: 'descartes',
              agentName: 'generalist',
              label: 'Descartes (Correctness)',
              role: 'discussant',
              modelConfig: {
                model: 'gemini-3.1-pro-preview',
                generateContentConfig: {
                  temperature: 0.1,
                  thinkingConfig: { thinkingLevel: 'HIGH' },
                },
              },
              runConfig: { maxTurns: 30, maxTimeMinutes: 15 },
            },
            {
              memberId: 'lead',
              agentName: 'generalist',
              label: 'Hegel (Lead)',
              role: 'synthesizer',
              modelConfig: { model: 'gemini-3.1-pro-preview' },
            },
            {
              memberId: 'pm',
              agentName: 'generalist',
              role: 'discussant',
              // No modelConfig -> reported as "inherit".
            },
          ],
        } as ForumPreset,
      ]);

      const listCommand = getSubCommand('list');
      await listCommand.action!(mockContext, '');

      expect(mockContext.ui.addItem).toHaveBeenCalledTimes(1);
      const arg = vi.mocked(mockContext.ui.addItem).mock.calls[0][0];
      expect(arg.type).toBe(MessageType.INFO);
      const text = (arg as { text: string }).text;

      // Heading and preset name.
      expect(text).toContain('Forum presets (1)');
      expect(text).toContain('**review**');
      expect(text).toContain('user');
      expect(text).toContain('Code review forum');
      // Rounds line.
      expect(text).toContain('rounds 5 (min 3)');
      expect(text).toContain('3 members');
      // Members.
      expect(text).toContain('Descartes (Correctness)');
      expect(text).toContain('synth');
      expect(text).toContain('discuss');
      expect(text).toContain('generalist');
      // Model strings appear in inline code spans.
      expect(text).toContain('`gemini-3.1-pro-preview`');
      expect(text).toContain('`inherit`');
      // Per-member technical metadata.
      expect(text).toContain('temp=0.1');
      expect(text).toContain('thinking=HIGH');
      expect(text).toContain('turns=30');
      expect(text).toContain('15m');
      // Member without an explicit label falls back to memberId.
      expect(text).toContain('pm');
    });

    it('renders the source path home-relative when under HOME', async () => {
      const home = process.env['HOME'] ?? process.env['USERPROFILE'] ?? '';
      const sourcePath = `${home}/.gemini/forums/design.json`;
      vi.mocked(loadForumPresets).mockResolvedValue([
        {
          name: 'design',
          source: { path: sourcePath, scope: 'user' },
          members: [
            {
              memberId: 'pm',
              agentName: 'generalist',
              label: 'PM',
            },
          ],
        } as ForumPreset,
      ]);

      const listCommand = getSubCommand('list');
      await listCommand.action!(mockContext, '');

      const arg = vi.mocked(mockContext.ui.addItem).mock.calls[0][0];
      const text = (arg as { text: string }).text;
      expect(text).toContain('~/.gemini/forums/design.json');
      expect(text).not.toContain(home);
    });
  });
});
