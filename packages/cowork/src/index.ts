#!/usr/bin/env node
/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 *
 * Gemini Cowork — CLI entry point.
 *
 * Usage (development, no build required):
 *   npx tsx packages/cowork/src/index.ts run "Audit my dependencies"
 *   npx tsx packages/cowork/src/index.ts run --root /some/project "Add unit tests"
 *
 * Usage (after build):
 *   cowork run "Refactor auth module"
 *   cowork run --root ./my-app --max-iterations 5 "Fix the login bug"
 *   cowork --help
 *   cowork run --help
 *
 * The file is also importable as a library:
 *   import { Coworker } from '@google/gemini-cowork';
 */

import { fileURLToPath } from 'node:url';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import chalk from 'chalk';
import { Coworker } from './agent/core.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RunArgs {
  goal: string;
  root: string;
  maxIterations: number;
  trace: boolean;
  memory: boolean;
}

// ---------------------------------------------------------------------------
// CLI definition
// ---------------------------------------------------------------------------

/**
 * Build the yargs CLI instance.
 * Kept as a factory so it can be called from tests without side-effects.
 */
function buildCli(argv: string[]) {
  return (
    yargs(argv)
      .scriptName('cowork')
      .usage(
        chalk.cyan.bold('Gemini Cowork') +
          ' — AI agentic coding tool\n\n' +
          'Usage: $0 <command> [options]',
      )

      // ── run ─────────────────────────────────────────────────────────────
      .command<RunArgs>(
        'run [goal]',
        'Start the ReAct agentic loop with a given goal',
        (y) =>
          y
            .positional('goal', {
              type: 'string',
              describe: 'Natural-language task for the agent to accomplish',
              default:
                'Understand the project structure and summarise its dependencies.',
            })
            .option('root', {
              alias: 'r',
              type: 'string',
              describe: 'Project root directory (defaults to cwd)',
              default: process.cwd(),
              normalize: true, // resolve ~, .., etc.
            })
            .option('max-iterations', {
              alias: 'n',
              type: 'number',
              describe: 'Maximum number of ReAct loop iterations',
              default: 10,
            })
            .option('trace', {
              alias: 't',
              type: 'boolean',
              describe:
                'Record every Think/Act/Observe step to .cowork/traces/ as JSON + Markdown',
              default: false,
            })
            .option('memory', {
              alias: 'm',
              type: 'boolean',
              describe:
                'Load persistent vector memory from .cowork/memory.json and inject ' +
                'relevant past context into every Think step',
              default: false,
            })
            .example(
              '$0 run "Add unit tests for the auth module"',
              'Run with an explicit goal',
            )
            .example(
              '$0 run --root ./my-app --max-iterations 5 "Fix the login bug"',
              'Target a different project with a step cap',
            ),
        async (args) => {
          const agent = new Coworker({
            projectRoot: args.root,
            maxIterations: args.maxIterations,
            trace: args.trace,
            memory: args.memory,
          });
          try {
            await agent.runLoop(args.goal);
          } catch (err) {
            process.stderr.write(
              chalk.red(
                `\nFatal: ${err instanceof Error ? err.message : String(err)}\n`,
              ),
            );
            process.exit(1);
          }
        },
      )

      // ── global options ───────────────────────────────────────────────────
      .option('version', {
        alias: 'v',
        description: 'Show version number',
      })
      .help('help')
      .alias('help', 'h')
      .strict()
      .wrap(Math.min(100, (process.stdout.columns ?? 100)))
      // Show help when no command is supplied.
      .demandCommand(1, chalk.yellow('Please specify a command. Try: cowork run --help'))
      .epilog(
        chalk.dim(
          'Docs: https://github.com/google-gemini/gemini-cli\n' +
            'Use --trace to save a full session post-mortem to .cowork/traces/',
        ),
      )
  );
}

// ---------------------------------------------------------------------------
// Entry point guard — run CLI only when executed directly, not when imported
// ---------------------------------------------------------------------------

// True when executed directly (`node dist/index.js` / `tsx src/index.ts`).
// False when imported as a library, so re-exports work without triggering the CLI.
const isMain = process.argv[1] === fileURLToPath(import.meta.url);

if (isMain) {
  await buildCli(hideBin(process.argv)).parseAsync();
}

// ---------------------------------------------------------------------------
// Library re-exports
// Public surface: consumers can import everything they need from this package.
// ---------------------------------------------------------------------------

// ── Agent ───────────────────────────────────────────────────────────────────
export { Coworker } from './agent/core.js';
export type { AgentMemory, AgentStep, CoworkerOptions, ToolCall } from './agent/core.js';

export { ProjectIndexer } from './agent/context-manager.js';
export type { FileEntry, ProjectContext } from './agent/context-manager.js';

// ── Phase 3: Telemetry ───────────────────────────────────────────────────────
export { Tracer } from './agent/tracer.js';
export type { TraceEvent, TracePhase, TraceSession } from './agent/tracer.js';

// ── Phase 3: Self-Healer ─────────────────────────────────────────────────────
export { SelfHealer } from './agent/self-healer.js';
export type {
  FileChange,
  HealAttempt,
  HealResult,
  ParsedError,
} from './agent/self-healer.js';

// ── Phase 3: Memory ──────────────────────────────────────────────────────────
export { MemoryRetriever, MemoryStore } from './memory/vector-store.js';
export type {
  MemoryCategory,
  MemoryEntry,
  MemorySearchResult,
} from './memory/vector-store.js';

// ── Phase 3: MCP ─────────────────────────────────────────────────────────────
export { MCPManager } from './mcp/client.js';
export type {
  MCPCallResult,
  MCPServerConfig,
  MCPSSETransport,
  MCPStdioTransport,
  MCPTool,
} from './mcp/client.js';

// ── Tool definitions (Zod schemas + registry) ───────────────────────────────
export { TOOL_DEFINITIONS } from './tools/definitions.js';
export type {
  AutoTestInput,
  LogMonitorInput,
  MCPCallInput,
  ReadFileInput,
  ScreenshotAnalyzeInput,
  SearchInput,
  ShellRunInput,
  ToolDefinition,
  ToolName,
  WriteFileInput,
} from './tools/definitions.js';

// ── Tool executors ───────────────────────────────────────────────────────────
export {
  executeReadFile,
  executeShellRun,
  executeWriteFile,
  promptShellConfirmation,
} from './tools/executor.js';
export type { ToolResult } from './tools/executor.js';

export { executeScreenshotAndAnalyze } from './tools/vision.js';
export { executeSearch } from './tools/search.js';
export { executeLogMonitor } from './tools/log-monitor.js';

// ── CLI builder (for testing / programmatic use) ────────────────────────────
export { buildCli };
