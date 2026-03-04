/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SlashCommand } from './types.js';
import { CommandKind } from './types.js';
import { MessageType } from '../types.js';
import { LlmRole } from '@google/gemini-cli-core';
import type { Content } from '@google/genai';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export const generateCommand: SlashCommand = {
  name: 'generate',
  description: 'Generate file content directly to a target path',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context, args = '') => {
    // Parse arguments
    // We expect: [instruction...] [filePath] [--overwrite] [--dry-run]
    const argsTrimmed = args.trim();
    if (!argsTrimmed) {
      context.ui.addItem(
        {
          type: MessageType.ERROR,
          text: 'Usage: /generate <instruction> <filePath> [--overwrite] [--dry-run]',
        },
        Date.now(),
      );
      return;
    }

    let instruction = '';
    let overwrite = false;
    let dryRun = false;

    // Use a basic regex or split to parse args. Actually, minimist or simple splitting is fine.
    // A simple parsing logic since instruction can have spaces and quotes.
    const parts = argsTrimmed.split(/\s+/);

    // Extract flags from the end
    while (parts.length > 0) {
      const last = parts[parts.length - 1];
      if (last === '--overwrite') {
        overwrite = true;
        parts.pop();
      } else if (last === '--dry-run') {
        dryRun = true;
        parts.pop();
      } else {
        break;
      }
    }

    if (parts.length < 2) {
      context.ui.addItem(
        {
          type: MessageType.ERROR,
          text: 'Usage: /generate <instruction> <filePath> [--overwrite] [--dry-run]',
        },
        Date.now(),
      );
      return;
    }

    // The last remaining part is the file path
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const rawFilePath = parts.pop() as string;

    // The rest is instruction
    instruction = parts.join(' ');

    const projectRoot =
      context.services.config?.getProjectRoot() || process.cwd();
    // Resolve absolute path and normalize to prevent directory traversal
    const resolvedPath = path.resolve(projectRoot, rawFilePath);

    // Minor sanity check: ensure it's still potentially within the project root for safety if needed,
    // though the user might intentionally use absolute paths inside their project. Let path.resolve handle it.

    if (!dryRun && !overwrite) {
      try {
        await fs.access(resolvedPath);
        // File exists and no overwrite
        context.ui.addItem(
          {
            type: MessageType.ERROR,
            text: `File ${rawFilePath} already exists. Use --overwrite to replace it.`,
          },
          Date.now(),
        );
        return;
      } catch {
        // File does not exist, which is fine
      }
    }

    const geminiClient = context.services.config?.getGeminiClient();
    if (!geminiClient) {
      context.ui.addItem(
        {
          type: MessageType.ERROR,
          text: 'Gemini client is not initialized.',
        },
        Date.now(),
      );
      return;
    }

    // Set a pending generic message
    context.ui.setPendingItem({
      type: MessageType.INFO,
      text: `Generating content for ${rawFilePath}...`,
    });

    try {
      const strictPrompt =
        'You are in file generation mode.\n' +
        'Output ONLY raw file contents.\n' +
        'Do NOT wrap output in markdown.\n' +
        'Do NOT include explanations.\n' +
        'Do NOT include backticks.\n' +
        'Do NOT describe the file.\n' +
        'Return only the file content exactly as it should be written.';

      const contents: Content[] = [
        {
          role: 'user',
          parts: [
            {
              text: `${strictPrompt}\n\nTask:\n${instruction}\n\nTarget File:\n${rawFilePath}`,
            },
          ],
        },
      ];

      const modelConfigKey = {
        model: context.services.config?.getActiveModel() || 'gemini-2.5-flash',
        isChatModel: false,
      };

      // Use generator since generateContent doesn't exist on geminiClient
      const contentGenerator = context.services.config?.getContentGenerator();
      if (!contentGenerator) {
        throw new Error('Content Generator is missing');
      }

      const response = await contentGenerator.generateContent(
        modelConfigKey,
        contents,
        undefined, // no abort signal for now, or could use AbortController
        // @ts-expect-error Ignore type error until LlmRole is updated
        LlmRole.UTILITY_FILE_GENERATOR || LlmRole.MAIN,
      );

      const responseText = response.text || '';
      let cleanText = responseText;

      // Clean up markdown block if model ignored the prompt and included one
      const mdBlockMatch = cleanText.match(/^```[\w-]*\n([\s\S]*)\n```$/);
      if (mdBlockMatch) {
        cleanText = mdBlockMatch[1];
      } else if (cleanText.startsWith('```')) {
        // Strip starting backticks
        cleanText = cleanText
          .replace(/^```[\w-]*\n?/, '')
          .replace(/\n?```$/, '');
      }

      context.ui.setPendingItem(null);

      if (dryRun) {
        context.ui.addItem(
          {
            type: MessageType.INFO,
            text: `[DRY RUN] Generated for ${rawFilePath}:\n\n${cleanText}`,
          },
          Date.now(),
        );
      } else {
        await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
        await fs.writeFile(resolvedPath, cleanText, 'utf-8');
        context.ui.addItem(
          {
            type: MessageType.INFO,
            text: `Created ${rawFilePath}`,
          },
          Date.now(),
        );
      }
    } catch (e) {
      context.ui.setPendingItem(null);
      context.ui.addItem(
        {
          type: MessageType.ERROR,
          text: `Failed to generate file: ${e instanceof Error ? e.message : String(e)}`,
        },
        Date.now(),
      );
    }
  },
};
