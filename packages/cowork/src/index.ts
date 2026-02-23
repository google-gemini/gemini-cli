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
 *   npx tsx packages/cowork/src/index.ts session export
 *   npx tsx packages/cowork/src/index.ts feedback list
 *   npx tsx packages/cowork/src/index.ts audit verify
 *
 * Usage (after build):
 *   cowork run "Refactor auth module"
 *   cowork run --dry-run "Fix the login bug"       ← preview without applying
 *   cowork run --dashboard "Add input validation"  ← open web dashboard
 *   cowork run --audit --codeowners "Fix login"    ← full Phase 5
 *   cowork init                                    ← interactive setup
 *   cowork review "Implement OAuth"                ← coder + reviewer debate
 *   cowork session export                          ← export session state
 *   cowork feedback list                           ← view few-shot dataset
 *   cowork audit verify                            ← verify audit log integrity
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
  // Phase 5
  audit: boolean;
  noRedact: boolean;
  pruneContext: boolean;
  codeowners: boolean;
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
            .option('audit', {
              type: 'boolean',
              describe: 'Write a tamper-proof SHA-256-chained audit log to .cowork/audit.ndjson',
              default: false,
            })
            .option('no-redact', {
              type: 'boolean',
              describe: 'Disable automatic secret/PII redaction (not recommended)',
              default: false,
            })
            .option('prune-context', {
              type: 'boolean',
              describe: 'Prune redundant blocks from the 2M-token context to reduce latency',
              default: false,
            })
            .option('codeowners', {
              type: 'boolean',
              describe: 'After modifying files, suggest reviewers from CODEOWNERS',
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
              '$0 run --audit --codeowners "Fix the login bug"',
              'Full Phase 5: audit log + reviewer suggestions',
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
            // Phase 5
            securityAudit: args.audit,
            redact: !args.noRedact,
            pruneContext: args.pruneContext,
            codeownersAware: args.codeowners,
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

      // ── session ──────────────────────────────────────────────────────────
      .command(
        'session <action>',
        'Export or import agent session state for team handoffs',
        (y) =>
          y
            .positional('action', {
              choices: ['export', 'import', 'info'] as const,
              describe: 'Action to perform on session state',
            })
            .option('file', {
              alias: 'f',
              type: 'string',
              describe: 'Session file path (.cowork-session)',
            })
            .option('root', {
              alias: 'r',
              type: 'string',
              describe: 'Project root directory',
              default: process.cwd(),
              normalize: true,
            }),
        async (args) => {
          const { SessionManager } = await import('./collaboration/session-manager.js');
          const mgr = new SessionManager(args.root as string);

          if (args.action === 'export') {
            const out = await mgr.export({}, {}, args.file as string | undefined);
            console.log(chalk.green(`\n✓ Session exported to: ${out}`));
          } else if (args.action === 'import') {
            if (!args.file) {
              console.error(chalk.red('Error: --file <path> is required for import'));
              process.exit(1);
            }
            const result = await mgr.import(args.file as string);
            console.log(mgr.formatSummary(result.session));
            if (result.warnings.length > 0) {
              result.warnings.forEach((w) => console.warn(chalk.yellow(`⚠ ${w}`)));
            }
          } else {
            console.log(chalk.cyan('cowork session <export|import|info> [--file <path>]'));
          }
        },
      )

      // ── feedback ─────────────────────────────────────────────────────────
      .command(
        'feedback <action>',
        'Manage the few-shot feedback dataset for agent self-improvement',
        (y) =>
          y
            .positional('action', {
              choices: ['list', 'add', 'stats', 'clear'] as const,
              describe: 'Action to perform',
            })
            .option('root', {
              alias: 'r',
              type: 'string',
              describe: 'Project root directory',
              default: process.cwd(),
              normalize: true,
            })
            .option('original', {
              type: 'string',
              describe: 'Original (wrong) output for feedback add',
            })
            .option('correction', {
              type: 'string',
              describe: 'Corrected output for feedback add',
            })
            .option('category', {
              type: 'string',
              describe: 'Feedback category (style|logic|security|test|docs)',
              default: 'style',
            }),
        async (args) => {
          const { FeedbackCollector } = await import('./feedback/collector.js');
          const fc = new FeedbackCollector(args.root as string);

          if (args.action === 'list') {
            const pairs = await fc.loadAll();
            if (pairs.length === 0) {
              console.log(chalk.dim('No feedback pairs recorded yet.'));
            } else {
              pairs.forEach((p, i) => {
                console.log(chalk.cyan(`\n[${i + 1}] ${p.id} — ${p.category}`));
                console.log(chalk.red('  ✗ ' + p.original.slice(0, 120)));
                console.log(chalk.green('  ✓ ' + p.correction.slice(0, 120)));
              });
            }
          } else if (args.action === 'add') {
            if (!args.original || !args.correction) {
              console.error(chalk.red('Error: --original and --correction are required'));
              process.exit(1);
            }
            const pair = await fc.record({
              original: args.original as string,
              correction: args.correction as string,
              category: (args.category as string) as never,
            });
            console.log(chalk.green(`\n✓ Feedback recorded: ${pair.id}`));
          } else if (args.action === 'stats') {
            const s = await fc.stats();
            console.log(chalk.cyan('\nFeedback dataset stats:'));
            console.log(`  Total pairs : ${s.total}`);
            console.log(`  Accepted    : ${s.accepted}`);
            console.log(`  Rejected    : ${s.rejected}`);
          } else if (args.action === 'clear') {
            const { rm } = await import('node:fs/promises');
            await rm(`${args.root}/.cowork/feedback.jsonl`, { force: true });
            console.log(chalk.yellow('✓ Feedback dataset cleared.'));
          }
        },
      )

      // ── audit ─────────────────────────────────────────────────────────────
      .command(
        'audit <action>',
        'Audit log management (tamper-evident record of all agent actions)',
        (y) =>
          y
            .positional('action', {
              choices: ['verify', 'export', 'summary'] as const,
              describe: 'Action to perform',
            })
            .option('root', {
              alias: 'r',
              type: 'string',
              describe: 'Project root directory',
              default: process.cwd(),
              normalize: true,
            })
            .option('out', {
              type: 'string',
              describe: 'Output file path for export action',
            }),
        async (args) => {
          const { AuditLog } = await import('./security/audit-log.js');
          const log = new AuditLog(args.root as string, 'cli-verify');

          if (args.action === 'verify') {
            console.log(chalk.cyan('Verifying audit log integrity…'));
            const result = await log.verify();
            if (result.valid) {
              console.log(chalk.green(`\n✓ Audit log is intact. ${result.entries} entries verified.`));
            } else {
              console.error(chalk.red(`\n✗ Audit log TAMPERED at entry #${result.firstInvalidAt}`));
              console.error(chalk.red(`  ${result.error}`));
              process.exit(2);
            }
          } else if (args.action === 'export') {
            const entries = await log.export();
            const json = JSON.stringify(entries, null, 2);
            if (args.out) {
              const { writeFile } = await import('node:fs/promises');
              await writeFile(args.out as string, json, 'utf8');
              console.log(chalk.green(`✓ Exported ${entries.length} entries to ${args.out}`));
            } else {
              console.log(json);
            }
          } else if (args.action === 'summary') {
            const summary = await log.sessionSummary();
            console.log(summary);
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
            '--dashboard to open the web UI · --audit for SOC2 compliance',
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

// ── Phase 5: Optimizer ───────────────────────────────────────────────────────
export { ContextPruner, ModelTier } from './agent/optimizer.js';
export type {
  ContextBlock,
  ModelId,
  ModelTierDecision,
  PruneResult,
} from './agent/optimizer.js';

// ── Phase 5: Security ────────────────────────────────────────────────────────
export { Redactor } from './security/redactor.js';
export type {
  RedactResult,
  SecretCategory,
  SecretFinding,
  SecretPattern,
} from './security/redactor.js';

export { AuditLog } from './security/audit-log.js';
export type {
  AuditAction,
  AuditEntry,
  VerifyResult,
} from './security/audit-log.js';

// ── Phase 5: Feedback ────────────────────────────────────────────────────────
export { FeedbackCollector } from './feedback/collector.js';
export type {
  FeedbackCategory,
  FeedbackPair,
  FewShotExample,
} from './feedback/collector.js';

// ── Phase 5: Collaboration ───────────────────────────────────────────────────
export { SessionManager } from './collaboration/session-manager.js';
export type {
  CoworkSession,
  ImportResult,
  SessionMetadata,
  SessionPayload,
} from './collaboration/session-manager.js';

export { CodeownersParser, ReviewerSuggester } from './collaboration/codeowners.js';
export type {
  CodeOwnerRule,
  FileOwnership,
  ReviewerRecommendation,
} from './collaboration/codeowners.js';

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
