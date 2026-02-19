#!/usr/bin/env node
/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 *
 * Gemini Cowork — entry point.
 *
 * Usage:
 *   # Development (tsx, no build required)
 *   npx tsx packages/cowork/src/index.ts "Your goal here"
 *
 *   # After building
 *   node packages/cowork/dist/index.js "Your goal here"
 *
 *   # Via npm workspace script
 *   npm run dev --workspace @google/gemini-cowork -- "Your goal here"
 */

import { Coworker } from './agent/core.js';

// ---------------------------------------------------------------------------
// Parse CLI arguments
// ---------------------------------------------------------------------------

const [, , ...rawArgs] = process.argv;

// Allow the goal to span multiple words without quoting.
const goal =
  rawArgs.join(' ').trim() ||
  'Understand the project structure and summarise its dependencies.';

// Optional: allow --root <path> to point at a different project.
let projectRoot = process.cwd();
const rootFlagIndex = rawArgs.indexOf('--root');
if (rootFlagIndex !== -1 && rawArgs[rootFlagIndex + 1]) {
  projectRoot = rawArgs[rootFlagIndex + 1];
}

// ---------------------------------------------------------------------------
// Run the agentic loop
// ---------------------------------------------------------------------------

const agent = new Coworker(projectRoot);

try {
  await agent.runLoop(goal);
} catch (err) {
  process.stderr.write(
    `\nFatal error: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exit(1);
}

// Re-export public surface so this package can also be used as a library.
export { Coworker } from './agent/core.js';
export type { AgentMemory, AgentStep, ToolCall } from './agent/core.js';
export { TOOL_DEFINITIONS } from './tools/definitions.js';
export type {
  ReadFileInput,
  ShellRunInput,
  ToolDefinition,
  ToolName,
  WriteFileInput,
} from './tools/definitions.js';
export {
  executeReadFile,
  executeShellRun,
  executeWriteFile,
  promptShellConfirmation,
} from './tools/executor.js';
export type { ToolResult } from './tools/executor.js';
