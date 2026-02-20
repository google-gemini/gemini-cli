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
 *   npx tsx packages/cowork/src/index.ts init
 *   npx tsx packages/cowork/src/index.ts review "Add unit tests"
 *
 * Usage (after build):
 *   cowork run "Refactor auth module"
 *   cowork run --dry-run "Fix the login bug"       ← preview without applying
 *   cowork run --dashboard "Add input validation"  ← open web dashboard
 *   cowork init                                    ← interactive setup
 *   cowork review "Implement OAuth"                ← coder + reviewer debate
 *   cowork --help
 *
 * The file is also importable as a library:
 *   import { Coworker } from '@google/gemini-cowork';
 */

import { fileURLToPath } from 'node:url';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import chalk from 'chalk';
import { Coworker } from './agent/core.js';
import { ConfigManager } from './config/manager.js';
import { Orchestrator } from './agent/orchestrator.js';
import { DashboardServer } from './dashboard/server.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RunArgs {
  goal: string;
  root: string;
  maxIterations: number;
  trace: boolean;
  memory: boolean;
  dryRun: boolean;
  dashboard: boolean;
}

interface ReviewArgs {
  goal: string;
  root: string;
  maxRounds: number;
  trace: boolean;
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
              normalize: true,
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
            .option('dry-run', {
              alias: 'd',
              type: 'boolean',
              describe:
                'Preview all file writes and shell commands as diffs without applying them',
              default: false,
            })
            .option('dashboard', {
              type: 'boolean',
              describe:
                'Start the local web dashboard on http://localhost:3141 and stream agent events',
              default: false,
            })
            .example(
              '$0 run "Add unit tests for the auth module"',
              'Run with an explicit goal',
            )
            .example(
              '$0 run --dry-run "Refactor the payment service"',
              'Preview changes without applying',
            )
            .example(
              '$0 run --dashboard --trace "Fix the login bug"',
              'Full telemetry + web dashboard',
            ),
        async (args) => {
          // ── Load config (merges .coworkrc + env vars) ────────────────────
          const cfg = await new ConfigManager(args.root).load();
          const dryRun = args.dryRun || cfg.dryRun;

          // ── Start dashboard server (optional) ───────────────────────────
          let dash: DashboardServer | null = null;
          if (args.dashboard) {
            dash = new DashboardServer();
            await dash.start();
            console.log(
              chalk.cyan(`\n[Dashboard] Running at ${dash.url}\n`),
            );
            // Open browser on macOS/Linux.
            const opener = process.platform === 'darwin' ? 'open' : 'xdg-open';
            const { spawnSync } = await import('node:child_process');
            spawnSync(opener, [dash.url], { stdio: 'ignore' });
          }

          if (dryRun) {
            console.log(
              chalk.yellow.bold(
                '\n[DRY RUN] No file writes or shell commands will be executed.\n',
              ),
            );
          }

          const agent = new Coworker({
            projectRoot: args.root,
            maxIterations: args.maxIterations ?? cfg.maxIterations,
            trace: args.trace || cfg.trace,
            memory: args.memory || cfg.memory,
            dryRun,
            dashboard: dash ?? undefined,
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
          } finally {
            await dash?.stop();
          }
        },
      )

      // ── init ─────────────────────────────────────────────────────────────
      .command(
        'init',
        'Interactive setup wizard — create or update .coworkrc',
        (y) =>
          y
            .option('root', {
              alias: 'r',
              type: 'string',
              describe: 'Project root for the .coworkrc file',
              default: process.cwd(),
              normalize: true,
            })
            .option('print', {
              type: 'boolean',
              describe: 'Print the resolved configuration without prompting',
              default: false,
            }),
        async (args) => {
          const mgr = new ConfigManager(args.root as string);
          if (args.print) {
            await mgr.print();
          } else {
            await mgr.runInitWizard();
          }
        },
      )

      // ── review ───────────────────────────────────────────────────────────
      .command<ReviewArgs>(
        'review [goal]',
        'Run a Coder + Reviewer debate to peer-review generated code',
        (y) =>
          y
            .positional('goal', {
              type: 'string',
              describe: 'Goal to implement and review',
              default: 'Implement the requested feature with full test coverage.',
            })
            .option('root', {
              alias: 'r',
              type: 'string',
              describe: 'Project root directory',
              default: process.cwd(),
              normalize: true,
            })
            .option('max-rounds', {
              type: 'number',
              describe: 'Maximum coder-reviewer debate rounds',
              default: 3,
            })
            .option('trace', {
              alias: 't',
              type: 'boolean',
              describe: 'Enable trace mode for both agents',
              default: false,
            })
            .example(
              '$0 review "Add OAuth login" --max-rounds 2',
              'Two-round coder-reviewer debate',
            ),
        async (args) => {
          const orch = new Orchestrator({
            maxRounds: args.maxRounds,
            coderOptions: {
              projectRoot: args.root,
              trace: args.trace,
            },
            reviewerOptions: {
              projectRoot: args.root,
            },
            verbose: true,
          });

          try {
            const result = await orch.orchestrate(args.goal);
            if (result.approved) {
              console.log(chalk.green(`\n✓ Proposal approved after ${result.rounds} round(s).`));
            } else {
              console.log(
                chalk.yellow(
                  `\n⚠ Not approved after ${result.rounds} round(s). Manual review recommended.`,
                ),
              );
            }
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
      .demandCommand(1, chalk.yellow('Please specify a command. Try: cowork run --help'))
      .epilog(
        chalk.dim(
          'Docs: https://github.com/google-gemini/gemini-cli\n' +
            'Use --trace to save a session post-mortem · --dry-run to preview · ' +
            '--dashboard to open the web UI',
        ),
      )
  );
}

// ---------------------------------------------------------------------------
// Entry point guard — run CLI only when executed directly, not when imported
// ---------------------------------------------------------------------------

const isMain = process.argv[1] === fileURLToPath(import.meta.url);

if (isMain) {
  await buildCli(hideBin(process.argv)).parseAsync();
}

// ---------------------------------------------------------------------------
// Library re-exports
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

// ── Phase 4: Config ──────────────────────────────────────────────────────────
export { ConfigManager } from './config/manager.js';
export type { CoworkConfig, SafetyPolicy } from './config/manager.js';

// ── Phase 4: Sandbox ─────────────────────────────────────────────────────────
export { SafetyPolicy as SafetyPolicyEngine, SandboxRunner, PolicyViolation } from './sandbox/policy.js';
export type { SandboxRunnerOptions, SandboxResult } from './sandbox/policy.js';

// ── Phase 4: Multi-Agent ─────────────────────────────────────────────────────
export { Orchestrator } from './agent/orchestrator.js';
export type {
  AgentRole,
  AgentMessage,
  FileProposal,
  Proposal,
  Review,
  ReviewComment,
  OrchestratorOptions,
  OrchestrationResult,
} from './agent/orchestrator.js';

// ── Phase 4: Dashboard ───────────────────────────────────────────────────────
export { DashboardServer } from './dashboard/server.js';
export type { DashboardEvent, DashboardEventType, TokenUsageStats } from './dashboard/server.js';

// ── Phase 4: Dry-run ─────────────────────────────────────────────────────────
export { dryRunWriteFile, dryRunShellRun, computeFileDiff, renderFileDiff } from './tools/dry-run.js';
export type { DiffLine, FileDiff } from './tools/dry-run.js';

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
