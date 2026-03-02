/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GENERATE_IMAGE_TOOL_NAME } from '@google/gemini-cli-core';
import type { SlashCommand, SlashCommandActionReturn } from './types.js';
import { CommandKind } from './types.js';

interface ParsedImageArgs {
  prompt: string;
  flags: Record<string, string | boolean>;
}

export function parseImageArgs(input: string): ParsedImageArgs {
  const flags: Record<string, string | boolean> = {};
  const parts = input.split(/\s+/);
  const promptParts: string[] = [];
  let i = 0;

  // Collect prompt text (everything before first --flag)
  while (i < parts.length && !parts[i].startsWith('--')) {
    promptParts.push(parts[i]);
    i++;
  }

  // Parse flags
  while (i < parts.length) {
    const part = parts[i];
    if (part.startsWith('--')) {
      const flagName = part.slice(2).split('=')[0];
      const inlineValue = part.includes('=') ? part.split('=')[1] : undefined;

      if (inlineValue !== undefined) {
        flags[flagName] = inlineValue;
      } else if (flagName === 'return') {
        flags[flagName] = true;
      } else if (i + 1 < parts.length && !parts[i + 1].startsWith('--')) {
        flags[flagName] = parts[i + 1];
        i++;
      }
    }
    i++;
  }

  return { prompt: promptParts.join(' '), flags };
}

export const imageCommand: SlashCommand = {
  name: 'image',
  altNames: ['img'],
  description: 'Generate or edit images using Nano Banana',
  kind: CommandKind.BUILT_IN,
  autoExecute: false,

  action: (_context, args): SlashCommandActionReturn | void => {
    if (!args.trim()) {
      return {
        type: 'message',
        messageType: 'error',
        content:
          'Usage: /image <prompt> [--ratio 16:9] [--size 2K] [--count 3] [--edit path/to/image.png]',
      };
    }

    const { prompt, flags } = parseImageArgs(args);

    if (!prompt) {
      return {
        type: 'message',
        messageType: 'error',
        content:
          'Error: No prompt provided. The prompt must come before any --flags.',
      };
    }

    const toolArgs: Record<string, unknown> = { prompt };
    if (flags['ratio']) toolArgs['aspect_ratio'] = flags['ratio'];
    if (flags['size']) toolArgs['size'] = flags['size'];
    if (flags['count'])
      toolArgs['count'] = parseInt(String(flags['count']), 10);
    if (flags['model']) toolArgs['model'] = flags['model'];
    if (flags['edit']) toolArgs['input_image'] = flags['edit'];
    if (flags['output']) toolArgs['output_path'] = flags['output'];
    if (flags['return']) toolArgs['return_to_context'] = true;

    return {
      type: 'tool',
      toolName: GENERATE_IMAGE_TOOL_NAME,
      toolArgs,
    };
  },

  completion: (_context, partialArg) => {
    const flagOptions = [
      '--ratio',
      '--size',
      '--count',
      '--model',
      '--edit',
      '--output',
      '--return',
    ];
    if (partialArg.startsWith('--')) {
      return flagOptions.filter((f) => f.startsWith(partialArg));
    }
    return [];
  },
};
