/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ToolResult } from '../tools/tools.js';
import type { GeminiClient } from '../core/client.js';
import type { Summarizer } from './summarizer.js';
import { debugLogger } from './debugLogger.js';
import type { Config } from '../config/config.js';

const SQUEEZ_SYSTEM_PROMPT =
  'You prune verbose tool output for a coding agent. ' +
  'Given a focused extraction query and one tool output, return only the ' +
  'smallest verbatim evidence block(s) the agent should read next. ' +
  'Return the kept text inside <relevant_lines> tags. ' +
  'Do not rewrite, summarize, or invent lines.';

interface SqueezConfig {
  serverUrl: string;
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
}

/**
 * Extract relevant lines from tool output by calling a Squeeze server.
 *
 * Squeeze is a fine-tuned 2B model that prunes verbose tool output
 * (pytest, grep, git log, npm build, kubectl, etc.) down to only the
 * relevant lines given a task description. Unlike LLM summarization,
 * it preserves the original text verbatim — no rewriting.
 *
 * @see https://github.com/KRLabsOrg/squeez
 */
async function callSqueezServer(
  squeezConfig: SqueezConfig,
  task: string,
  toolOutput: string,
  abortSignal: AbortSignal,
): Promise<string | null> {
  const { serverUrl, apiKey, model = 'default', timeoutMs = 30000 } = squeezConfig;

  // Truncate task to match squeez behavior
  const truncatedTask = task.length > 3000 ? task.slice(0, 3000) + '...' : task;

  const userContent = truncatedTask
    ? `<query>\n${truncatedTask}\n</query>\n<tool_output>\n${toolOutput}\n</tool_output>`
    : `<tool_output>\n${toolOutput}\n</tool_output>`;

  const body = {
    model,
    messages: [
      { role: 'system', content: SQUEEZ_SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ],
    max_tokens: 1024,
    temperature: 0.1,
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const combinedSignal = abortSignal.aborted
    ? abortSignal
    : AbortSignal.any([abortSignal, controller.signal]);

  try {
    const response = await fetch(`${serverUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: combinedSignal,
    });

    if (!response.ok) {
      debugLogger.warn(
        `Squeeze server returned ${response.status}: ${await response.text()}`,
      );
      return null;
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = data.choices?.[0]?.message?.content?.trim();
    if (!raw) return null;

    // Parse <relevant_lines> XML tags — same as squeez Python client
    const match = raw.match(
      /<relevant_lines>\s*\n?(.*?)\n?\s*<\/relevant_lines>/s,
    );
    return match ? match[1].trim() : raw;
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      debugLogger.warn('Squeeze server request timed out or was aborted.');
    } else {
      debugLogger.warn('Failed to call Squeeze server.', error);
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Derive a task description from a tool result.
 * Uses the tool description or command string to guide extraction.
 */
function deriveTask(
  result: ToolResult,
  _config: Config,
): string {
  // The result may carry a description or command context.
  // For shell tools, the command itself is the best hint.
  if (result.data && typeof result.data['command'] === 'string') {
    return result.data['command'];
  }
  return '';
}

/**
 * Create a SqueezSummarizer for a specific tool.
 *
 * Usage in settings.json:
 * ```json
 * {
 *   "squeez": {
 *     "serverUrl": "http://localhost:8000/v1",
 *     "model": "KRLabsOrg/squeez-2b"
 *   },
 *   "summarizeToolOutput": {
 *     "run_shell_command": { "tokenBudget": 2000 }
 *   }
 * }
 * ```
 *
 * When squeez is configured and summarizeToolOutput is enabled for a tool,
 * Squeeze replaces the default LLM summarizer — it extracts only relevant
 * lines instead of rewriting the output. This preserves exact error messages,
 * line numbers, and stack traces while achieving ~92% compression.
 */
export function createSqueezSummarizer(
  squeezConfig: SqueezConfig,
): Summarizer {
  return async (
    config: Config,
    result: ToolResult,
    _geminiClient: GeminiClient,
    abortSignal: AbortSignal,
  ): Promise<string> => {
    const toolOutput =
      typeof result.llmContent === 'string'
        ? result.llmContent
        : JSON.stringify(result.llmContent);

    const task = deriveTask(result, config);

    const squeezed = await callSqueezServer(
      squeezConfig,
      task,
      toolOutput,
      abortSignal,
    );

    if (squeezed !== null) {
      return squeezed;
    }

    // Fallback: return original output if Squeeze failed
    debugLogger.warn(
      'Squeeze extraction failed, falling back to original tool output.',
    );
    return toolOutput;
  };
}

/**
 * Check if a Squeeze server is reachable.
 * Useful for health checks and auto-detection.
 */
export async function checkSqueezHealth(
  serverUrl: string,
  apiKey?: string,
  timeoutMs = 5000,
): Promise<boolean> {
  const headers: Record<string, string> = {};
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(`${serverUrl}/models`, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeout);
    return response.ok;
  } catch {
    return false;
  }
}
