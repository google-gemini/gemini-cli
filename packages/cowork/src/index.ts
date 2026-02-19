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
            .example(
              '$0 run "Add unit tests for the auth module"',
              'Run with an explicit goal',
            )
            .example(
              '$0 run --root ./my-app --max-iterations 5 "Fix the login bug"',
              'Target a different project with a step cap',
            ),
        async (args) => {
          const agent = new Coworker(args.root, args.maxIterations);
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
            'Phase 2 will connect this loop to a live Gemini model.',
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

// Expose the CLI builder for testing / programmatic use.
export { buildCli };
