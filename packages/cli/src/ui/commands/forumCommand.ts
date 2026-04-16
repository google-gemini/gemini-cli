/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, type SlashCommand } from './types.js';
import {
  loadForumPresets,
  type ForumPreset,
  type ForumSessionOptions,
} from '@google/gemini-cli-core';
import { MessageType } from '../types.js';

function parseStartArgs(args: string): {
  presetName?: string;
  options: ForumSessionOptions;
  error?: string;
} {
  const tokens = args.trim().split(/\s+/).filter(Boolean);
  const presetParts: string[] = [];
  let includeMainConversationContext = true;

  for (const token of tokens) {
    if (token === '--incognito') {
      includeMainConversationContext = false;
      continue;
    }
    if (token.startsWith('--')) {
      return {
        options: { includeMainConversationContext },
        error: `Unknown option: ${token}`,
      };
    }
    presetParts.push(token);
  }

  return {
    presetName: presetParts.join(' ').trim() || undefined,
    options: { includeMainConversationContext },
  };
}

const listCommand: SlashCommand = {
  name: 'list',
  description: 'List available forum presets',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context) => {
    const config = context.services.agentContext?.config;
    if (!config) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Config not loaded.',
      };
    }

    const presets = await loadForumPresets(config);
    if (presets.length === 0) {
      return {
        type: 'message',
        messageType: 'info',
        content:
          'No forum presets found in ~/.gemini/forums or .gemini/forums.',
      };
    }

    context.ui.addItem({
      type: MessageType.INFO,
      text: formatPresetList(presets),
    });
    return;
  },
};

const DEFAULT_MAX_ROUNDS = 3;
const DEFAULT_MIN_DISCUSSION_ROUNDS = 2;

function homeRelative(filePath: string): string {
  const home = process.env['HOME'] ?? process.env['USERPROFILE'] ?? '';
  if (home && filePath.startsWith(home)) {
    return `~${filePath.slice(home.length)}`;
  }
  return filePath;
}

interface MemberRow {
  label: string;
  agent: string;
  model: string;
  temperature: string;
  thinking: string;
  turns: string;
  time: string;
  role: string;
}

function describeMember(member: ForumPreset['members'][number]): MemberRow {
  const label = member.label ?? member.memberId;
  const agent = member.agentName;
  const model = member.modelConfig?.model ?? 'inherit';

  const generation = member.modelConfig?.generateContentConfig;
  const temperature =
    generation?.temperature !== undefined
      ? `temp=${generation.temperature}`
      : '';
  const thinkingLevel = generation?.thinkingConfig
    ? (generation.thinkingConfig as { thinkingLevel?: string }).thinkingLevel
    : undefined;
  const thinking = thinkingLevel ? `thinking=${thinkingLevel}` : '';

  const maxTurns = member.runConfig?.maxTurns;
  const turns = maxTurns !== undefined ? `turns=${maxTurns}` : '';
  const maxTime = member.runConfig?.maxTimeMinutes;
  const time = maxTime !== undefined ? `${maxTime}m` : '';

  const role = member.role === 'synthesizer' ? 'synth' : 'discuss';

  return { label, agent, model, temperature, thinking, turns, time, role };
}

function formatPresetList(presets: ForumPreset[]): string {
  const lines: string[] = [`**Forum presets (${presets.length})**`, ''];

  presets.forEach((preset, index) => {
    if (index > 0) {
      lines.push('');
    }

    const scope = preset.source?.scope ?? 'user';
    const source = preset.source?.path
      ? homeRelative(preset.source.path)
      : '(unknown source)';
    lines.push(`**${preset.name}**  ·  ${scope}  ·  \`${source}\``);

    if (preset.description) {
      lines.push(`  ${preset.description}`);
    }

    const rounds = preset.maxRounds ?? DEFAULT_MAX_ROUNDS;
    const minRounds =
      preset.minDiscussionRounds ?? DEFAULT_MIN_DISCUSSION_ROUNDS;
    lines.push(
      `  rounds ${rounds} (min ${minRounds})  ·  ${preset.members.length} members`,
    );

    const rows = preset.members.map(describeMember);
    const labelWidth = Math.max(...rows.map((row) => row.label.length));
    const agentWidth = Math.max(...rows.map((row) => row.agent.length));
    const modelWidth = Math.max(...rows.map((row) => row.model.length));

    for (const row of rows) {
      const fields: string[] = [
        row.label.padEnd(labelWidth),
        row.role.padEnd(7),
        row.agent.padEnd(agentWidth),
        `\`${row.model}\``.padEnd(modelWidth + 2),
      ];
      const extras = [row.temperature, row.thinking, row.turns, row.time]
        .filter(Boolean)
        .join('  ');
      lines.push(`  • ${fields.join('  ·  ')}  ·  ${extras}`.trimEnd());
    }
  });

  return lines.join('\n');
}

const startCommand: SlashCommand = {
  name: 'start',
  description: 'Enter forum mode with a preset',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context, args) => {
    const { presetName, options, error } = parseStartArgs(args);
    if (error) {
      return {
        type: 'message',
        messageType: 'error',
        content: `${error}\nUsage: /forum start [--incognito] <preset-name>`,
      };
    }
    if (!presetName) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Usage: /forum start [--incognito] <preset-name>',
      };
    }

    await context.ui.startForumMode(presetName, options);
    return;
  },
};

const stopCommand: SlashCommand = {
  name: 'stop',
  description: 'Leave forum mode',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  isSafeConcurrent: true,
  action: async (context) => {
    const session = context.ui.getForumSession();
    if (!session) {
      return {
        type: 'message',
        messageType: 'info',
        content: 'Forum mode is not active.',
      };
    }

    await context.ui.stopForumMode('Forum stopped.');
    return;
  },
};

export const forumCommand: SlashCommand = {
  name: 'forum',
  description: 'Start or stop a multi-agent forum discussion',
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  isSafeConcurrent: true,
  subCommands: [listCommand, startCommand, stopCommand],
};
