/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Content } from '@google/genai';
import type { GeminiClient } from '../core/client.js';
import { getResponseText } from './partUtils.js';
import { debugLogger } from './debugLogger.js';
import type { Config } from '../config/config.js';
import { LlmRole } from '../telemetry/llmRole.js';

const COMMAND_SUMMARY_PROMPT = `Summarize what the following shell command does in a single short sentence (max 10 words). Focus on WHAT it does, not HOW. Use plain language a non-technical person could understand. Do not include the command itself in the summary. Do not use backticks or code formatting.

Examples:
- "cat foo.txt | head -n 5" → "Read first 5 lines of foo.txt"
- "find . -name '*.ts' -exec grep -l 'import' {} +" → "Find TypeScript files containing imports"
- "git log --oneline -10" → "Show last 10 commits"
- "npm install && npm run build" → "Install dependencies and build project"
- "sed -i 's/foo/bar/g' file.ts utils.ts" → "Rename foo to bar in file.ts and utils.ts"
- "mkdir -p src/components && touch src/components/index.ts" → "Create components directory with index file"
- "docker compose up -d" → "Start Docker services in background"
- "curl -s https://api.example.com/health" → "Check API health endpoint"

Command: "{command}"
Summary:`;

/**
 * Summarizes a shell command into a human-readable description using Flash Lite.
 *
 * @param config The application config.
 * @param command The raw shell command to summarize.
 * @param geminiClient The Gemini client for API calls.
 * @param signal Abort signal for cancellation.
 * @returns A human-readable summary of what the command does.
 */
export async function summarizeCommand(
  config: Config,
  command: string,
  geminiClient: GeminiClient,
  signal: AbortSignal,
): Promise<string> {
  if (!command || command.trim().length === 0) {
    return command;
  }

  const prompt = COMMAND_SUMMARY_PROMPT.replace('{command}', command);
  const contents: Content[] = [{ role: 'user', parts: [{ text: prompt }] }];

  try {
    const response = await geminiClient.generateContent(
      { model: 'command-summarizer' },
      contents,
      signal,
      LlmRole.UTILITY_SUMMARIZER,
    );
    const summary = getResponseText(response)?.trim();
    if (summary && summary.length > 0 && summary.length < 200) {
      return summary;
    }
    return command;
  } catch (error) {
    debugLogger.warn('Failed to summarize command.', error);
    return command;
  }
}
