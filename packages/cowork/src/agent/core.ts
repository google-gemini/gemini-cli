/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 *
 * Core agentic loop for Gemini Cowork.
 *
 * Architecture — ReAct (Reasoning + Acting) cycle:
 *
 *   ┌──────────┐    ┌─────────┐    ┌─────────────┐
 *   │  [Think] │───▶│  [Act]  │───▶│  [Observe]  │
 *   │ Analyse  │    │ Execute │    │ Capture I/O │
 *   │ state &  │    │ tool    │    │ update      │
 *   │ plan     │    │ call    │    │ memory      │
 *   └──────────┘    └─────────┘    └──────┬──────┘
 *        ▲                                │
 *        └────────────────────────────────┘
 *                  (next iteration)
 *
 * In Phase 1 the Think step uses heuristic reasoning.
 * It is deliberately structured so the heuristic can be swapped for a
 * live Gemini model call (via @google/gemini-cli-core) in Phase 2 without
 * changing the Act / Observe contract.
 */

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import chalk from 'chalk';
import ora from 'ora';
import type { Ora } from 'ora';
import {
  executeReadFile,
  executeShellRun,
  executeWriteFile,
  type ToolResult,
} from '../tools/executor.js';
import {
  ReadFileInputSchema,
  ShellRunInputSchema,
  WriteFileInputSchema,
  type ReadFileInput,
  type ShellRunInput,
  type WriteFileInput,
} from '../tools/definitions.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single step in the agent's reasoning history. */
export interface AgentStep {
  phase: 'think' | 'act' | 'observe';
  content: string;
  timestamp: Date;
}

/**
 * The agent's working memory.
 * This is intentionally kept as a plain object so it can be serialised to
 * disk / sent over the wire in later phases.
 */
export interface AgentMemory {
  goal: string;
  projectRoot: string;
  /** Parsed package.json, or null if not found. */
  packageJson: Record<string, unknown> | null;
  /** Top-level file/directory names (node_modules and dotfiles excluded). */
  fileTree: string[];
  /** Ordered history of all Think / Act / Observe steps. */
  history: AgentStep[];
}

/** A discriminated union of every tool call the agent can emit. */
export type ToolCall =
  | { tool: 'read_file'; input: ReadFileInput }
  | { tool: 'write_file'; input: WriteFileInput }
  | { tool: 'shell_run'; input: ShellRunInput };

// ---------------------------------------------------------------------------
// Visual helpers
// ---------------------------------------------------------------------------

const PHASE_LABEL: Record<AgentStep['phase'], string> = {
  think: chalk.blue.bold('[Think]   '),
  act: chalk.green.bold('[Act]     '),
  observe: chalk.magenta.bold('[Observe] '),
};

const BANNER = [
  chalk.cyan('╔══════════════════════════════════════════════╗'),
  chalk.cyan('║       Gemini Cowork  —  Agentic Loop  v0.1  ║'),
  chalk.cyan('╚══════════════════════════════════════════════╝'),
].join('\n');

// ---------------------------------------------------------------------------
// Coworker class
// ---------------------------------------------------------------------------

/**
 * `Coworker` orchestrates the ReAct loop.
 *
 * ```ts
 * const agent = new Coworker(process.cwd());
 * await agent.runLoop('Audit dependencies and suggest upgrades');
 * ```
 */
export class Coworker {
  private readonly memory: AgentMemory;
  private readonly maxIterations: number;

  constructor(projectRoot: string = process.cwd(), maxIterations = 10) {
    this.maxIterations = maxIterations;
    this.memory = {
      goal: '',
      projectRoot,
      packageJson: null,
      fileTree: [],
      history: [],
    };
  }

  // -------------------------------------------------------------------------
  // Internal utilities
  // -------------------------------------------------------------------------

  /** Append a step to history and pretty-print it. */
  private record(phase: AgentStep['phase'], content: string): void {
    this.memory.history.push({ phase, content, timestamp: new Date() });
    console.log(`\n${PHASE_LABEL[phase]}${content}`);
  }

  /** Build a compact context string the Think step can reason over. */
  private buildContext(): string {
    const pkg = this.memory.packageJson;
    const name = (pkg?.['name'] as string | undefined) ?? 'unknown';
    const version = (pkg?.['version'] as string | undefined) ?? 'unknown';
    const scripts = pkg?.['scripts']
      ? Object.keys(pkg['scripts'] as Record<string, string>).join(', ')
      : 'none';
    const deps = pkg?.['dependencies']
      ? Object.keys(pkg['dependencies'] as Record<string, string>).join(', ')
      : 'none';

    return [
      `Project : ${name} v${version}`,
      `Root    : ${this.memory.projectRoot}`,
      `Files   : ${this.memory.fileTree.join(', ')}`,
      `Scripts : ${scripts}`,
      `Deps    : ${deps}`,
      `Goal    : ${this.memory.goal}`,
    ].join('\n          ');
  }

  // -------------------------------------------------------------------------
  // Environment awareness — runs once at startup
  // -------------------------------------------------------------------------

  /**
   * Scan the project root: read package.json + top-level directory listing.
   * Results are stored in `this.memory` so the Think step can reference them.
   */
  private async scanEnvironment(): Promise<void> {
    const spinner: Ora = ora({
      text: chalk.dim('Scanning project environment…'),
      color: 'cyan',
    }).start();

    try {
      // 1. Parse package.json if present.
      try {
        const raw = await readFile(
          join(this.memory.projectRoot, 'package.json'),
          'utf-8',
        );
        this.memory.packageJson = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        this.memory.packageJson = null;
      }

      // 2. List top-level entries, excluding hidden files and node_modules.
      const entries = await readdir(this.memory.projectRoot, {
        withFileTypes: true,
      });
      this.memory.fileTree = entries
        .filter(
          (e) => !e.name.startsWith('.') && e.name !== 'node_modules',
        )
        .map((e) => (e.isDirectory() ? `${e.name}/` : e.name));

      spinner.succeed(chalk.dim('Environment ready.'));
    } catch (err) {
      spinner.fail(chalk.red('Failed to scan environment.'));
      throw err;
    }
  }

  // -------------------------------------------------------------------------
  // [Think] — Reasoning phase
  // -------------------------------------------------------------------------

  /**
   * Decide what to do next based on the current memory state.
   *
   * Phase 1: heuristic planner.
   * Phase 2 (TODO): replace heuristic with a Gemini model call via
   *   `@google/gemini-cli-core` `GeminiClient`, passing the current memory
   *   as context and receiving a structured `ToolCall` back.
   *
   * Returns `null` to signal that the loop should terminate.
   */
  private async think(iteration: number): Promise<ToolCall | null> {
    const spinner: Ora = ora({
      text: chalk.blue.dim('Reasoning about next action…'),
      color: 'blue',
    }).start();

    // Simulate a brief reasoning delay (will be replaced by real model latency).
    await new Promise<void>((r) => setTimeout(r, 200));
    spinner.stop();

    const context = this.buildContext();
    const lastObservation =
      [...this.memory.history].reverse().find((s) => s.phase === 'observe')
        ?.content ?? 'No prior observations.';

    this.record(
      'think',
      `Iteration ${iteration}\n          ${context}\n          Last obs : ${lastObservation.slice(0, 120)}`,
    );

    // ------------------------------------------------------------------
    // Heuristic decision tree
    // ------------------------------------------------------------------

    // Iteration 1: always ground the agent by reading package.json.
    if (iteration === 1 && this.memory.packageJson !== null) {
      this.record(
        'think',
        'Strategy → read package.json to ground dependency understanding.',
      );
      return {
        tool: 'read_file',
        input: ReadFileInputSchema.parse({
          path: join(this.memory.projectRoot, 'package.json'),
        }),
      };
    }

    // Iteration 2: if we have a goal containing "test", run the test suite.
    if (
      iteration === 2 &&
      this.memory.goal.toLowerCase().includes('test') &&
      this.memory.packageJson?.['scripts'] &&
      'test' in (this.memory.packageJson['scripts'] as Record<string, string>)
    ) {
      this.record('think', 'Strategy → goal mentions "test"; will run npm test.');
      return {
        tool: 'shell_run',
        input: ShellRunInputSchema.parse({
          command: 'npm test --if-present',
          cwd: this.memory.projectRoot,
        }),
      };
    }

    // Iteration 2 fallback: write a brief analysis summary.
    if (iteration === 2) {
      const pkg = this.memory.packageJson;
      const summary = pkg
        ? `# Project Analysis\n\n` +
          `**Name**: ${String(pkg['name'] ?? 'unknown')}\n` +
          `**Version**: ${String(pkg['version'] ?? 'unknown')}\n` +
          `**Type**: ${String(pkg['type'] ?? 'commonjs')}\n\n` +
          `**Dependencies** (${Object.keys((pkg['dependencies'] as Record<string, string> | undefined) ?? {}).length}):\n` +
          Object.entries(
            (pkg['dependencies'] as Record<string, string> | undefined) ?? {},
          )
            .map(([k, v]) => `- ${k}: ${v}`)
            .join('\n') +
          '\n\n' +
          `_Generated by Gemini Cowork on ${new Date().toISOString()}_\n`
        : '# Project Analysis\n\nNo package.json found.\n';

      this.record(
        'think',
        'Strategy → write analysis summary to .cowork/analysis.md.',
      );
      return {
        tool: 'write_file',
        input: WriteFileInputSchema.parse({
          path: join(this.memory.projectRoot, '.cowork', 'analysis.md'),
          content: summary,
        }),
      };
    }

    // No further autonomous actions — signal loop termination.
    this.record('think', 'Goal satisfied. No further actions required.');
    return null;
  }

  // -------------------------------------------------------------------------
  // [Act] — Execution phase
  // -------------------------------------------------------------------------

  /**
   * Execute the tool call chosen by the Think step.
   * Wraps execution with visual feedback (ora spinner) appropriate for each
   * tool type. The `shell_run` spinner is stopped before the human-in-the-loop
   * confirmation prompt so the user can read and respond to it.
   */
  private async act(toolCall: ToolCall): Promise<ToolResult> {
    this.record(
      'act',
      `Tool: ${chalk.bold(toolCall.tool)}  Input: ${JSON.stringify(toolCall.input)}`,
    );

    let spinner: Ora | null = null;

    if (toolCall.tool !== 'shell_run') {
      spinner = ora({
        text: chalk.green.dim(`Executing ${toolCall.tool}…`),
        color: 'green',
      }).start();
    }

    try {
      let result: ToolResult;

      switch (toolCall.tool) {
        case 'read_file':
          result = await executeReadFile(toolCall.input);
          break;
        case 'write_file':
          result = await executeWriteFile(toolCall.input);
          break;
        case 'shell_run':
          // Human-in-the-loop prompt happens inside executeShellRun.
          result = await executeShellRun(toolCall.input);
          break;
      }

      spinner?.succeed(chalk.green.dim(`${toolCall.tool} complete.`));
      return result;
    } catch (err) {
      spinner?.fail(chalk.red(`${toolCall.tool} failed.`));
      throw err;
    }
  }

  // -------------------------------------------------------------------------
  // [Observe] — Observation phase
  // -------------------------------------------------------------------------

  /**
   * Summarise the tool result and record it in memory.
   * Keeps the observation concise: the full output is available in history
   * but only a preview is logged to the terminal.
   */
  private observe(result: ToolResult): void {
    const MAX_PREVIEW = 300;
    const preview =
      result.output.length > MAX_PREVIEW
        ? `${result.output.slice(0, MAX_PREVIEW)}… (${result.output.length} chars total)`
        : result.output || '(empty)';

    const observation = result.error
      ? `ERROR: ${result.error}\nOUTPUT: ${preview}`
      : `OUTPUT: ${preview}`;

    this.record('observe', observation);
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Run the ReAct loop until the agent decides it is done or `maxIterations`
   * is reached.
   *
   * @param goal  Natural-language description of the task to accomplish.
   */
  async runLoop(goal: string): Promise<void> {
    this.memory.goal = goal;

    console.log(`\n${BANNER}\n`);
    console.log(chalk.white(`Goal: ${chalk.bold(goal)}\n`));

    // ── Environment awareness ──────────────────────────────────────────────
    await this.scanEnvironment();

    // ── ReAct loop ─────────────────────────────────────────────────────────
    for (let i = 1; i <= this.maxIterations; i++) {
      console.log(chalk.dim(`\n${'─'.repeat(56)} iteration ${i}`));

      // [Think]
      const toolCall = await this.think(i);
      if (toolCall === null) break;

      // [Act]
      const result = await this.act(toolCall);

      // [Observe]
      this.observe(result);
    }

    console.log(
      `\n${chalk.cyan.bold('✓ Agentic loop complete.')}  ` +
        chalk.dim(`${this.memory.history.length} steps recorded.\n`),
    );
  }

  /** Expose memory for inspection / testing. */
  getMemory(): Readonly<AgentMemory> {
    return this.memory;
  }
}
