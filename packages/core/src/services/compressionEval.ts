/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Compression evaluation utilities for measuring token savings,
 * compression quality, and regression detection across different
 * compression strategies and session lengths.
 *
 * This module provides:
 * - Synthetic conversation generators with realistic tool output patterns
 * - Metrics collection for compression outcomes
 * - Comparison utilities for A/B testing compression strategies
 *
 * Related issues: #23905, #23912
 */

import type { Content, Part } from '@google/genai';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Metrics collected from a single compression run. */
export interface CompressionMetrics {
  /** Number of tokens before compression (estimated from history). */
  tokensBefore: number;
  /** Number of tokens after compression (estimated from history). */
  tokensAfter: number;
  /** Compression ratio (tokensAfter / tokensBefore). Lower is better. */
  compressionRatio: number;
  /** Wall-clock time for compression in milliseconds. */
  latencyMs: number;
  /** The compression status code returned by the service. */
  status: string;
  /** Number of history entries before compression. */
  historyLengthBefore: number;
  /** Number of history entries after compression. */
  historyLengthAfter: number;
}

/** A single test scenario for compression evaluation. */
export interface CompressionEvalScenario {
  /** Human-readable name for this scenario. */
  name: string;
  /** The conversation history to compress. */
  history: Content[];
  /** Total token count of the history. */
  totalTokens: number;
  /** Number of user turns in the conversation. */
  turnCount: number;
  /** Breakdown of token usage by content type. */
  tokenBreakdown: {
    systemPrompt: number;
    userMessages: number;
    assistantMessages: number;
    toolOutputs: number;
  };
}

/** Result of comparing two compression strategies. */
export interface CompressionComparison {
  /** Name of the scenario. */
  scenarioName: string;
  /** Metrics from the baseline strategy. */
  baseline: CompressionMetrics;
  /** Metrics from the experimental strategy. */
  experimental: CompressionMetrics;
  /** Relative improvement in compression ratio. Positive = better. */
  ratioImprovement: number;
  /** Relative change in latency. Negative = faster. */
  latencyChange: number;
}

// ---------------------------------------------------------------------------
// Synthetic conversation generators
// ---------------------------------------------------------------------------

/**
 * Creates a realistic multi-turn agent conversation with tool calls.
 *
 * The generated conversation follows patterns observed in real coding
 * agent sessions: early turns involve file reading and exploration,
 * middle turns involve editing and testing, and later turns involve
 * debugging and iteration.
 */
export function createAgentConversation(
  turnCount: number,
  options: {
    /** Average token count per tool output. Default: 500. */
    avgToolOutputTokens?: number;
    /** Whether to include a system prompt. Default: true. */
    includeSystemPrompt?: boolean;
    /** Fraction of turns that include tool calls. Default: 0.7. */
    toolCallFraction?: number;
  } = {},
): CompressionEvalScenario {
  const {
    avgToolOutputTokens = 500,
    includeSystemPrompt = true,
    toolCallFraction = 0.7,
  } = options;

  const history: Content[] = [];
  const breakdown = {
    systemPrompt: 0,
    userMessages: 0,
    assistantMessages: 0,
    toolOutputs: 0,
  };

  // System prompt
  if (includeSystemPrompt) {
    const systemText = generateSystemPrompt();
    const systemTokens = estimateTokens(systemText);
    history.push({ role: 'user', parts: [{ text: systemText }] });
    history.push({
      role: 'model',
      parts: [{ text: 'I understand the project context. How can I help?' }],
    });
    breakdown.systemPrompt += systemTokens;
    breakdown.assistantMessages += 15;
  }

  for (let turn = 0; turn < turnCount; turn++) {
    // User message
    const userText = generateUserMessage(turn, turnCount);
    const userTokens = estimateTokens(userText);
    history.push({ role: 'user', parts: [{ text: userText }] });
    breakdown.userMessages += userTokens;

    // Assistant response (possibly with tool calls)
    // Deterministic tool usage based on turn index (not random).
    // This ensures scenarios are reproducible across runs.
    const useTool =
      toolCallFraction >= 1.0 ||
      (toolCallFraction > 0 &&
        Math.floor((turn + 1) * toolCallFraction) >
          Math.floor(turn * toolCallFraction));

    if (useTool) {
      const toolName = pickToolForTurn(turn, turnCount);
      const assistantText = generateAssistantThinking(toolName);
      const assistantTokens = estimateTokens(assistantText);

      // Model message with function call
      history.push({
        role: 'model',
        parts: [
          { text: assistantText },
          {
            functionCall: {
              name: toolName,
              args: generateToolArgs(toolName, turn),
            },
          },
        ],
      });
      breakdown.assistantMessages += assistantTokens + 20;

      // Tool output (function response)
      const toolOutput = generateToolOutput(
        toolName,
        turn,
        avgToolOutputTokens,
      );
      const toolTokens = estimateTokens(toolOutput);

      history.push({
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: toolName,
              response: { output: toolOutput },
            },
          },
        ],
      });
      breakdown.toolOutputs += toolTokens;

      // Model follow-up after tool result
      const followUp = generateFollowUp(toolName, turn);
      const followUpTokens = estimateTokens(followUp);
      history.push({ role: 'model', parts: [{ text: followUp }] });
      breakdown.assistantMessages += followUpTokens;
    } else {
      // Pure text response (no tool call)
      const responseText = generatePureResponse(turn);
      const responseTokens = estimateTokens(responseText);
      history.push({ role: 'model', parts: [{ text: responseText }] });
      breakdown.assistantMessages += responseTokens;
    }
  }

  // Recompute totalTokens using the same estimator that collectMetrics uses,
  // so scenario.totalTokens and eval metrics are always on the same scale.
  const computedTotalTokens = estimateHistoryTokens(history);

  return {
    name: `agent-${turnCount}turns-${avgToolOutputTokens}avg`,
    history,
    totalTokens: computedTotalTokens,
    turnCount,
    tokenBreakdown: breakdown,
  };
}

/**
 * Creates a set of standard evaluation scenarios covering different
 * session lengths and tool output patterns.
 */
export function createStandardScenarios(): CompressionEvalScenario[] {
  return [
    // Short session - should not trigger compression
    createAgentConversation(5, { avgToolOutputTokens: 200 }),

    // Medium session - typical coding workflow
    createAgentConversation(15, { avgToolOutputTokens: 500 }),

    // Long session - heavy tool usage
    createAgentConversation(30, { avgToolOutputTokens: 800 }),

    // Very long session - stress test
    createAgentConversation(50, { avgToolOutputTokens: 500 }),

    // Large tool outputs - grep/read heavy
    createAgentConversation(20, { avgToolOutputTokens: 2000 }),

    // Minimal tool usage - mostly chat
    createAgentConversation(20, {
      avgToolOutputTokens: 300,
      toolCallFraction: 0.3,
    }),
  ];
}

// ---------------------------------------------------------------------------
// Metrics collection
// ---------------------------------------------------------------------------

/**
 * Collects compression metrics by running a compression function
 * on the given history and measuring the outcome.
 *
 * Both before and after token counts are computed using the same
 * estimator (estimateHistoryTokens) to ensure the compression
 * ratio is meaningful and not affected by measurement drift.
 */
export async function collectMetrics(
  history: Content[],
  compressFn: (
    history: Content[],
  ) => Promise<{ newHistory: Content[] | null; status: string }>,
): Promise<CompressionMetrics> {
  // Use the same estimator for both sides of the comparison.
  const tokensBefore = estimateHistoryTokens(history);

  const start = performance.now();
  const result = await compressFn(history);
  const latencyMs = performance.now() - start;

  const newHistory = result.newHistory ?? history;
  const tokensAfter = estimateHistoryTokens(newHistory);

  return {
    tokensBefore,
    tokensAfter,
    compressionRatio: tokensBefore > 0 ? tokensAfter / tokensBefore : 1,
    latencyMs,
    status: result.status,
    historyLengthBefore: history.length,
    historyLengthAfter: newHistory.length,
  };
}

/**
 * Compares two compression strategies on the same scenario.
 */
export function compareStrategies(
  scenarioName: string,
  baseline: CompressionMetrics,
  experimental: CompressionMetrics,
): CompressionComparison {
  return {
    scenarioName,
    baseline,
    experimental,
    ratioImprovement: baseline.compressionRatio - experimental.compressionRatio,
    latencyChange: experimental.latencyMs - baseline.latencyMs,
  };
}

/**
 * Formats comparison results as a readable table string.
 */
export function formatComparisonReport(
  comparisons: CompressionComparison[],
): string {
  const lines: string[] = [];
  lines.push('Compression Evaluation Report', '='.repeat(80), '');

  for (const c of comparisons) {
    lines.push(`Scenario: ${c.scenarioName}`);
    lines.push('-'.repeat(60));
    lines.push(
      `  Baseline:     ${c.baseline.tokensBefore} -> ${c.baseline.tokensAfter} tokens ` +
        `(ratio: ${c.baseline.compressionRatio.toFixed(3)}, ` +
        `${c.baseline.latencyMs.toFixed(0)}ms)`,
    );
    lines.push(
      `  Experimental: ${c.experimental.tokensBefore} -> ${c.experimental.tokensAfter} tokens ` +
        `(ratio: ${c.experimental.compressionRatio.toFixed(3)}, ` +
        `${c.experimental.latencyMs.toFixed(0)}ms)`,
    );
    lines.push(
      `  Improvement:  ratio ${c.ratioImprovement > 0 ? '+' : ''}${(c.ratioImprovement * 100).toFixed(1)}%, ` +
        `latency ${c.latencyChange > 0 ? '+' : ''}${c.latencyChange.toFixed(0)}ms`,
    );
    lines.push('');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Content analysis utilities
// ---------------------------------------------------------------------------

/**
 * Analyzes a conversation history and returns a breakdown of token
 * usage by content type (useful for understanding what compression
 * should target).
 */
export function analyzeHistory(history: Content[]): {
  totalTokens: number;
  totalEntries: number;
  breakdown: {
    systemPrompt: { tokens: number; entries: number };
    userText: { tokens: number; entries: number };
    assistantText: { tokens: number; entries: number };
    toolCalls: { tokens: number; entries: number };
    toolOutputs: { tokens: number; entries: number };
  };
  toolOutputsByAge: Array<{
    turnIndex: number;
    toolName: string;
    tokens: number;
  }>;
} {
  let totalTokens = 0;
  const breakdown = {
    systemPrompt: { tokens: 0, entries: 0 },
    userText: { tokens: 0, entries: 0 },
    assistantText: { tokens: 0, entries: 0 },
    toolCalls: { tokens: 0, entries: 0 },
    toolOutputs: { tokens: 0, entries: 0 },
  };
  const toolOutputsByAge: Array<{
    turnIndex: number;
    toolName: string;
    tokens: number;
  }> = [];

  let userTurnIndex = 0;

  // Structural marker for system prompt identification.
  const SYSTEM_PROMPT_MARKER = '<session_context>';

  for (let i = 0; i < history.length; i++) {
    const entry = history[i];
    const entryTokens = estimateContentTokens(entry);
    totalTokens += entryTokens;

    if (entry.role === 'user') {
      const hasFunctionResponse = entry.parts?.some(
        (p) => !!p.functionResponse,
      );
      const hasText = entry.parts?.some((p) => !!p.text);
      const isSystemPrompt = entry.parts?.some((p) =>
        p.text?.includes(SYSTEM_PROMPT_MARKER),
      );

      if (hasFunctionResponse) {
        breakdown.toolOutputs.tokens += entryTokens;
        breakdown.toolOutputs.entries++;

        for (const part of entry.parts ?? []) {
          if (part.functionResponse) {
            toolOutputsByAge.push({
              turnIndex: userTurnIndex,
              toolName: part.functionResponse.name ?? 'unknown',
              tokens: estimatePartTokens(part),
            });
          }
        }
      } else if (hasText) {
        // Identify system prompt by structural marker, not size heuristic.
        if (isSystemPrompt) {
          breakdown.systemPrompt.tokens += entryTokens;
          breakdown.systemPrompt.entries++;
        } else {
          breakdown.userText.tokens += entryTokens;
          breakdown.userText.entries++;
          userTurnIndex++;
        }
      }
    } else if (entry.role === 'model') {
      const hasFunctionCall = entry.parts?.some((p) => !!p.functionCall);
      if (hasFunctionCall) {
        breakdown.toolCalls.tokens += entryTokens;
        breakdown.toolCalls.entries++;
      } else {
        breakdown.assistantText.tokens += entryTokens;
        breakdown.assistantText.entries++;
      }
    }
  }

  return {
    totalTokens,
    totalEntries: history.length,
    breakdown,
    toolOutputsByAge,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function estimateTokens(text: string): number {
  // Rough estimate: 1 token per 4 characters
  return Math.ceil(text.length / 4);
}

function estimatePartTokens(part: Part): number {
  if (part.text) return estimateTokens(part.text);
  if (part.functionCall) {
    return estimateTokens(JSON.stringify(part.functionCall));
  }
  if (part.functionResponse) {
    return estimateTokens(JSON.stringify(part.functionResponse));
  }
  return 0;
}

function estimateContentTokens(content: Content): number {
  return (content.parts ?? []).reduce(
    (sum, part) => sum + estimatePartTokens(part),
    0,
  );
}

function estimateHistoryTokens(history: Content[]): number {
  return history.reduce(
    (sum, content) => sum + estimateContentTokens(content),
    0,
  );
}

function generateSystemPrompt(): string {
  return [
    '<session_context>',
    'This is Gemini CLI, an AI-powered coding assistant.',
    "Today's date is 2026-04-01.",
    'My operating system is: linux',
    '',
    'Workspace directories:',
    '  /home/user/project/',
    '',
    'Directory structure:',
    '  src/',
    '    auth.ts (245 lines)',
    '    database.ts (512 lines)',
    '    api.ts (189 lines)',
    '    utils.ts (78 lines)',
    '  tests/',
    '    auth.test.ts (156 lines)',
    '    database.test.ts (203 lines)',
    '  package.json',
    '  tsconfig.json',
    '</session_context>',
  ].join('\n');
}

function generateUserMessage(turn: number, totalTurns: number): string {
  const phase = turn / totalTurns;
  if (phase < 0.2) {
    const msgs = [
      'Can you look at the auth module and help me understand the login flow?',
      'What does the database connection setup look like?',
      'Show me the API endpoint definitions.',
    ];
    return msgs[turn % msgs.length];
  } else if (phase < 0.5) {
    const msgs = [
      'I need to add token refresh logic to the auth module.',
      'Can you update the database query to use prepared statements?',
      'Add input validation to the API endpoints.',
    ];
    return msgs[turn % msgs.length];
  } else if (phase < 0.8) {
    const msgs = [
      'The tests are failing after the change. Can you check?',
      "I'm getting a type error on line 45. Can you fix it?",
      'Run the tests again and see if they pass now.',
    ];
    return msgs[turn % msgs.length];
  } else {
    const msgs = [
      'Let me review all the changes we made.',
      'Can you write a summary of what we changed?',
      'Run the full test suite one more time.',
    ];
    return msgs[turn % msgs.length];
  }
}

function pickToolForTurn(turn: number, totalTurns: number): string {
  const phase = turn / totalTurns;
  if (phase < 0.2) {
    return ['read_file', 'grep', 'glob'][turn % 3];
  } else if (phase < 0.5) {
    return ['read_file', 'edit', 'write_file'][turn % 3];
  } else if (phase < 0.8) {
    return ['run_shell_command', 'read_file', 'edit'][turn % 3];
  } else {
    return ['run_shell_command', 'grep', 'read_file'][turn % 3];
  }
}

function generateToolArgs(
  toolName: string,
  turn: number,
): Record<string, unknown> {
  switch (toolName) {
    case 'read_file':
      return {
        path: ['src/auth.ts', 'src/database.ts', 'src/api.ts'][turn % 3],
      };
    case 'grep':
      return {
        pattern: ['TODO', 'FIXME', 'async function'][turn % 3],
        path: 'src/',
      };
    case 'glob':
      return { pattern: '**/*.ts' };
    case 'edit':
      return {
        path: ['src/auth.ts', 'src/database.ts'][turn % 2],
        old_string: 'old code',
        new_string: 'new code',
      };
    case 'write_file':
      return { path: 'src/utils.ts', content: 'new file content' };
    case 'run_shell_command':
      return {
        command: ['npm test', 'npm run build', 'npm run lint'][turn % 3],
      };
    default:
      return {};
  }
}

function generateToolOutput(
  toolName: string,
  turn: number,
  avgTokens: number,
): string {
  // Generate output that looks realistic for each tool type
  const targetChars = avgTokens * 4;

  switch (toolName) {
    case 'read_file':
      return generateFakeFileContent(targetChars);
    case 'grep':
      return generateFakeGrepOutput(targetChars);
    case 'glob':
      return generateFakeGlobOutput(targetChars);
    case 'run_shell_command':
      return generateFakeShellOutput(turn, targetChars);
    case 'edit':
      return `Successfully edited src/auth.ts. Changed 5 lines.`;
    case 'write_file':
      return `Successfully wrote to src/utils.ts.`;
    default:
      return 'x'.repeat(targetChars);
  }
}

function generateFakeFileContent(targetChars: number): string {
  const lines: string[] = [
    'import { Request, Response } from "express";',
    'import { verify, sign } from "jsonwebtoken";',
    'import { db } from "./database";',
    '',
    'const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";',
    'const TOKEN_EXPIRY = "24h";',
    '',
    'export async function login(req: Request, res: Response) {',
    '  const { username, password } = req.body;',
    '  const user = await db.users.findOne({ username });',
    '  if (!user || !await user.verifyPassword(password)) {',
    '    return res.status(401).json({ error: "Invalid credentials" });',
    '  }',
    '  const token = sign({ userId: user.id }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });',
    '  return res.json({ token });',
    '}',
    '',
    'export async function refreshToken(req: Request, res: Response) {',
    '  // TODO: implement token refresh logic',
    '  return res.status(501).json({ error: "Not implemented" });',
    '}',
  ];

  let content = lines.join('\n');
  while (content.length < targetChars) {
    content += '\n' + lines.join('\n');
  }
  return content.slice(0, targetChars);
}

function generateFakeGrepOutput(targetChars: number): string {
  const matches: string[] = [];
  const files = [
    'src/auth.ts',
    'src/database.ts',
    'src/api.ts',
    'src/utils.ts',
    'tests/auth.test.ts',
  ];

  for (let i = 0; matches.join('\n').length < targetChars; i++) {
    const file = files[i % files.length];
    const line = 10 + i * 7;
    matches.push(`${file}:${line}:  // TODO: implement error handling`);
  }

  return matches.join('\n').slice(0, targetChars);
}

function generateFakeGlobOutput(targetChars: number): string {
  const files: string[] = [];
  const dirs = ['src', 'tests', 'lib', 'config'];
  const names = ['auth', 'database', 'api', 'utils', 'helpers', 'types'];

  for (let i = 0; files.join('\n').length < targetChars; i++) {
    const dir = dirs[i % dirs.length];
    const name = names[i % names.length];
    files.push(`${dir}/${name}.ts`);
  }

  return files.join('\n').slice(0, targetChars);
}

function generateFakeShellOutput(turn: number, targetChars: number): string {
  // Alternate between passing and failing test output
  if (turn % 3 === 0) {
    // Failing tests
    const lines = [
      '> npm test',
      '',
      'FAIL tests/auth.test.ts',
      '  login()',
      '    ✓ should return 200 for valid credentials (45ms)',
      '    ✗ should return 401 for invalid credentials (12ms)',
      '      Expected: 401',
      '      Received: 500',
      '    ✗ should handle missing password field (8ms)',
      '      Expected: 400',
      '      Received: undefined',
      '',
      'PASS tests/database.test.ts',
      '  database',
      '    ✓ should connect successfully (120ms)',
      '    ✓ should handle connection errors (15ms)',
      '',
      'Test Suites: 1 failed, 1 passed, 2 total',
      'Tests:       2 failed, 3 passed, 5 total',
      'Time:        3.456s',
    ];

    let content = lines.join('\n');
    while (content.length < targetChars) {
      content += '\n' + lines.join('\n');
    }
    return content.slice(0, targetChars);
  } else {
    // Passing tests
    const lines = [
      '> npm test',
      '',
      'PASS tests/auth.test.ts',
      '  login()',
      '    ✓ should return 200 for valid credentials (42ms)',
      '    ✓ should return 401 for invalid credentials (11ms)',
      '    ✓ should handle missing password field (7ms)',
      '',
      'PASS tests/database.test.ts',
      '  database',
      '    ✓ should connect successfully (115ms)',
      '    ✓ should handle connection errors (14ms)',
      '',
      'Test Suites: 2 passed, 2 total',
      'Tests:       5 passed, 5 total',
      'Time:        2.891s',
    ];

    let content = lines.join('\n');
    while (content.length < targetChars) {
      content += '\n' + lines.join('\n');
    }
    return content.slice(0, targetChars);
  }
}

function generateAssistantThinking(toolName: string): string {
  switch (toolName) {
    case 'read_file':
      return 'Let me read the file to understand the current implementation.';
    case 'grep':
      return "I'll search for relevant patterns in the codebase.";
    case 'glob':
      return 'Let me find all TypeScript files in the project.';
    case 'edit':
      return "I'll make the necessary changes to the file.";
    case 'write_file':
      return "I'll create the new file with the required content.";
    case 'run_shell_command':
      return 'Let me run the tests to check the current state.';
    default:
      return 'Let me use a tool to help with this.';
  }
}

function generateFollowUp(toolName: string, turn: number): string {
  switch (toolName) {
    case 'read_file':
      return "I've read the file. The current implementation uses JWT tokens with a 24-hour expiry. I can see a TODO for the refresh logic. Let me know if you'd like me to implement it.";
    case 'grep':
      return 'I found several matches. There are multiple TODO comments across the codebase, mainly in the auth and database modules.';
    case 'glob':
      return "I've found all the TypeScript files. The project has a clean structure with source files in `src/` and tests in `tests/`.";
    case 'edit':
      return "I've made the edit. The changes should fix the issue we discussed.";
    case 'write_file':
      return "I've created the new file. Let me know if you'd like to make any changes.";
    case 'run_shell_command':
      if (turn % 3 === 0) {
        return "The tests are failing. There are 2 failures in the auth test suite. The main issue is that the error handling isn't returning the correct status codes. Let me fix that.";
      }
      return 'All tests are passing. The changes look good.';
    default:
      return "Done. Let me know what you'd like to do next.";
  }
}

function generatePureResponse(turn: number): string {
  const responses = [
    "Based on what we've seen so far, I think the best approach is to refactor the token handling into a separate service. This will make it easier to test and maintain.",
    'Looking at the code structure, I recommend adding input validation middleware that runs before the route handlers. This ensures all endpoints are protected consistently.',
    "The error handling pattern in this codebase is inconsistent. Some functions throw, others return error objects. Let's standardize on a single approach.",
  ];
  return responses[turn % responses.length];
}
