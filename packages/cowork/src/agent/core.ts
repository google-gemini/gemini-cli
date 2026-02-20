/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 *
 * Core agentic loop for Gemini Cowork — Phase 2 (Multimodal + Long Context).
 *
 * ReAct (Reasoning + Acting) cycle
 * ─────────────────────────────────
 *
 *   ┌──────────┐    ┌─────────┐    ┌─────────────┐
 *   │  [Think] │───▶│  [Act]  │───▶│  [Observe]  │
 *   │ Analyse  │    │ Execute │    │ Capture I/O │
 *   │ state &  │    │ tool    │    │ update      │
 *   │ plan     │    │ call    │    │ memory      │
 *   └──────────┘    └─────────┘    └──────┬──────┘
 *        ▲                                │
 *        └────────────────────────────────┘
 *                   (next iteration)
 *
 * Phase 2 additions
 * ─────────────────
 *   • ProjectIndexer  : feeds the full codebase into Gemini's 2M context window.
 *   • Vision          : `screenshot_and_analyze` for UI / CSS debugging.
 *   • Google Search   : grounded web lookup for docs / library updates.
 *   • LogMonitor      : streams live process output to the agent.
 *   • Dynamic routing : Think() inspects the goal for UI / search / monitoring
 *                       keywords and selects the appropriate tool automatically.
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
import { executeScreenshotAndAnalyze } from '../tools/vision.js';
import { executeSearch } from '../tools/search.js';
import { executeLogMonitor } from '../tools/log-monitor.js';
import { ProjectIndexer } from './context-manager.js';
import {
  ReadFileInputSchema,
  ScreenshotAnalyzeInputSchema,
  SearchInputSchema,
  ShellRunInputSchema,
  LogMonitorInputSchema,
  WriteFileInputSchema,
  type ReadFileInput,
  type ScreenshotAnalyzeInput,
  type SearchInput,
  type ShellRunInput,
  type LogMonitorInput,
  type WriteFileInput,
} from '../tools/definitions.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single step recorded in the agent's history. */
export interface AgentStep {
  phase: 'think' | 'act' | 'observe';
  content: string;
  timestamp: Date;
}

/**
 * The agent's working memory.
 *
 * Kept as a plain serialisable object so it can be persisted to disk or
 * transmitted over the wire in future phases.
 */
export interface AgentMemory {
  goal: string;
  projectRoot: string;
  /** Parsed package.json, or null when not present. */
  packageJson: Record<string, unknown> | null;
  /** Top-level entries (node_modules and dotfiles excluded). */
  fileTree: string[];
  /** Ordered log of every Think / Act / Observe step. */
  history: AgentStep[];
  /**
   * Compact context document built by ProjectIndexer.
   * Ready for injection into a Gemini system prompt.
   * Null until scanEnvironment() completes.
   */
  contextSummary: string | null;
  /**
   * True when the current goal involves UI, CSS, layout, or visual debugging.
   * Set by Think() on first detection; triggers vision tool routing.
   */
  visionEnabled: boolean;
}

/** Discriminated union of every tool call the agent can emit. */
export type ToolCall =
  | { tool: 'read_file'; input: ReadFileInput }
  | { tool: 'write_file'; input: WriteFileInput }
  | { tool: 'shell_run'; input: ShellRunInput }
  | { tool: 'screenshot_and_analyze'; input: ScreenshotAnalyzeInput }
  | { tool: 'search'; input: SearchInput }
  | { tool: 'log_monitor'; input: LogMonitorInput };

// ---------------------------------------------------------------------------
// Visual helpers
// ---------------------------------------------------------------------------

const PHASE_LABEL: Record<AgentStep['phase'], string> = {
  think: chalk.blue.bold('[Think]   '),
  act: chalk.green.bold('[Act]     '),
  observe: chalk.magenta.bold('[Observe] '),
};

const BANNER = [
  chalk.cyan('╔══════════════════════════════════════════════════╗'),
  chalk.cyan('║   Gemini Cowork  ─  Agentic Loop  v0.2           ║'),
  chalk.cyan('║   Multimodal · 2M Context · Live Search          ║'),
  chalk.cyan('╚══════════════════════════════════════════════════╝'),
].join('\n');

// ---------------------------------------------------------------------------
// Goal-classification helpers
// ---------------------------------------------------------------------------

/** Patterns that indicate a goal requiring the vision tool. */
const UI_KEYWORDS =
  /\b(ui|css|layout|style|visual|render|screenshot|design|component|front.?end|tailwind|sass|responsive|animation)\b/i;

/** Patterns that indicate a goal requiring web search. */
const SEARCH_KEYWORDS =
  /\b(find|look.?up|search|latest|version|docs?|documentation|release|changelog|npm|package)\b/i;

/** Patterns that indicate a goal requiring log monitoring. */
const MONITOR_KEYWORDS =
  /\b(monitor|watch|stream|log|dev.?server|start\s+server|run|tail|output)\b/i;

// ---------------------------------------------------------------------------
// Coworker class
// ---------------------------------------------------------------------------

/**
 * `Coworker` orchestrates the ReAct loop with multimodal capabilities.
 *
 * ```ts
 * const agent = new Coworker(process.cwd());
 * await agent.runLoop('Fix the broken hero section CSS and verify visually');
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
      contextSummary: null,
      visionEnabled: false,
    };
  }

  // -------------------------------------------------------------------------
  // Internal utilities
  // -------------------------------------------------------------------------

  private record(phase: AgentStep['phase'], content: string): void {
    this.memory.history.push({ phase, content, timestamp: new Date() });
    console.log(`\n${PHASE_LABEL[phase]}${content}`);
  }

  /**
   * Build a compact reasoning context block from the agent's current memory.
   * Includes a preview of the ProjectIndexer output when available.
   */
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

    const lines = [
      `Project  : ${name} v${version}`,
      `Root     : ${this.memory.projectRoot}`,
      `Files    : ${this.memory.fileTree.join(', ')}`,
      `Scripts  : ${scripts}`,
      `Deps     : ${deps}`,
      `Goal     : ${this.memory.goal}`,
      `Vision   : ${this.memory.visionEnabled ? chalk.green('enabled') : chalk.dim('disabled')}`,
    ];

    if (this.memory.contextSummary) {
      const preview = this.memory.contextSummary.slice(0, 280).replace(/\n/g, ' ');
      lines.push(`Context  : ${preview}…`);
    }

    return lines.join('\n          ');
  }

  // -------------------------------------------------------------------------
  // Environment awareness
  // -------------------------------------------------------------------------

  /**
   * Scan the project root before the first ReAct iteration:
   *
   *   1. Parse package.json.
   *   2. List the top-level directory (fast).
   *   3. Run ProjectIndexer to build the 2M-context document (may be slow for
   *      large repos but completes before the first Think step).
   */
  private async scanEnvironment(): Promise<void> {
    const basicSpinner: Ora = ora({
      text: chalk.dim('Scanning project environment…'),
      color: 'cyan',
    }).start();

    try {
      // ── package.json ──────────────────────────────────────────────────────
      try {
        const raw = await readFile(
          join(this.memory.projectRoot, 'package.json'),
          'utf-8',
        );
        this.memory.packageJson = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        this.memory.packageJson = null;
      }

      // ── Top-level directory listing ───────────────────────────────────────
      const entries = await readdir(this.memory.projectRoot, {
        withFileTypes: true,
      });
      this.memory.fileTree = entries
        .filter((e) => !e.name.startsWith('.') && e.name !== 'node_modules')
        .map((e) => (e.isDirectory() ? `${e.name}/` : e.name));

      basicSpinner.succeed(chalk.dim('Project environment scanned.'));
    } catch (err) {
      basicSpinner.fail(chalk.red('Failed to scan environment.'));
      throw err;
    }

    // ── ProjectIndexer — long-context document ────────────────────────────
    const indexSpinner: Ora = ora({
      text: chalk.dim('Indexing codebase for 2M-token context window…'),
      color: 'cyan',
    }).start();

    try {
      const ctx = await new ProjectIndexer(this.memory.projectRoot).index();
      this.memory.contextSummary = ctx.document;
      indexSpinner.succeed(
        chalk.dim(
          `Codebase indexed: ${ctx.files.filter((f) => !f.skipped).length} files · ` +
            `~${ctx.totalTokens.toLocaleString()} tokens`,
        ),
      );
    } catch {
      indexSpinner.warn(chalk.yellow('Codebase indexing skipped (non-fatal).'));
    }
  }

  // -------------------------------------------------------------------------
  // [Think] — Reasoning phase
  // -------------------------------------------------------------------------

  /**
   * Decide the next action given the current memory state.
   *
   * Phase 2 behaviour:
   *   • Classifies the goal using keyword regexes to enable vision / search /
   *     log-monitoring modes automatically (dynamic tool switching).
   *   • Includes the ProjectIndexer context summary in every reasoning step
   *     so the agent has codebase-wide awareness.
   *
   * Returns `null` to signal that the loop should terminate.
   *
   * TODO (Phase 3): Replace the heuristic planner below with a live Gemini
   *   model call via `@google/gemini-cli-core`'s `GeminiClient`, passing
   *   `this.memory.contextSummary` as the system prompt, the history as
   *   conversation turns, and receiving a structured `ToolCall` back from
   *   the model's function-calling response.
   */
  private async think(iteration: number): Promise<ToolCall | null> {
    const spinner: Ora = ora({
      text: chalk.blue.dim('Reasoning about next action…'),
      color: 'blue',
    }).start();

    await new Promise<void>((r) => setTimeout(r, 200)); // model latency placeholder
    spinner.stop();

    const context = this.buildContext();
    const lastObservation =
      [...this.memory.history]
        .reverse()
        .find((s) => s.phase === 'observe')?.content ?? 'No prior observations.';

    this.record(
      'think',
      `Iteration ${iteration}\n          ${context}\n          Last obs : ${lastObservation.slice(0, 150)}`,
    );

    // ── Dynamic tool switching — classify goal on first iteration ──────────

    if (!this.memory.visionEnabled && UI_KEYWORDS.test(this.memory.goal)) {
      this.memory.visionEnabled = true;
      this.record(
        'think',
        chalk.blue(
          'UI/visual keywords detected → vision mode enabled. ' +
            'A screenshot_and_analyze step will be inserted.',
        ),
      );
    }

    // ── Heuristic decision tree ────────────────────────────────────────────

    // Iteration 1: Always read package.json first to ground the agent.
    if (iteration === 1 && this.memory.packageJson !== null) {
      this.record('think', 'Strategy → read package.json to ground dependency understanding.');
      return {
        tool: 'read_file',
        input: ReadFileInputSchema.parse({
          path: join(this.memory.projectRoot, 'package.json'),
        }),
      };
    }

    // Iteration 2a: Search goal → use Google Search grounding.
    if (iteration === 2 && SEARCH_KEYWORDS.test(this.memory.goal)) {
      this.record('think', `Strategy → goal requires web lookup. Running search: "${this.memory.goal}"`);
      return {
        tool: 'search',
        input: SearchInputSchema.parse({
          query: this.memory.goal,
          numResults: 5,
        }),
      };
    }

    // Iteration 2b: Monitoring goal → start a log stream.
    if (iteration === 2 && MONITOR_KEYWORDS.test(this.memory.goal)) {
      const scripts = this.memory.packageJson?.['scripts'] as
        | Record<string, string>
        | undefined;
      const command = scripts?.['dev']
        ? 'npm run dev'
        : scripts?.['start']
          ? 'npm start'
          : 'npm run dev';
      this.record('think', `Strategy → goal involves monitoring. Starting: "${command}"`);
      return {
        tool: 'log_monitor',
        input: LogMonitorInputSchema.parse({
          command,
          cwd: this.memory.projectRoot,
          timeoutMs: 8_000,
          stopPattern: 'compiled|ready|listening|error|failed',
        }),
      };
    }

    // Iteration 2c: Vision goal → take a desktop screenshot for analysis.
    if (iteration === 2 && this.memory.visionEnabled) {
      this.record(
        'think',
        'Strategy → vision mode active. Capturing desktop screenshot for UI analysis.',
      );
      return {
        tool: 'screenshot_and_analyze',
        input: ScreenshotAnalyzeInputSchema.parse({
          source: { type: 'desktop' },
          prompt:
            `Analyse this screenshot in the context of: "${this.memory.goal}". ` +
            'Identify any UI, CSS, layout, or rendering issues. Be specific and actionable.',
          model: 'gemini-2.0-flash',
        }),
      };
    }

    // Iteration 2d: Default — write a structured analysis summary to disk.
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
          `_Generated by Gemini Cowork v0.2 on ${new Date().toISOString()}_\n`
        : '# Project Analysis\n\nNo package.json found.\n';

      this.record('think', 'Strategy → write analysis summary to .cowork/analysis.md.');
      return {
        tool: 'write_file',
        input: WriteFileInputSchema.parse({
          path: join(this.memory.projectRoot, '.cowork', 'analysis.md'),
          content: summary,
        }),
      };
    }

    // Loop complete.
    this.record('think', 'Goal analysis complete. No further actions required.');
    return null;
  }

  // -------------------------------------------------------------------------
  // [Act] — Execution phase
  // -------------------------------------------------------------------------

  /**
   * Execute the tool call selected by Think.
   *
   * Routing:
   *   read_file / write_file     → executor.ts (synchronous file I/O)
   *   shell_run                  → executor.ts (human-in-the-loop confirmation)
   *   screenshot_and_analyze     → vision.ts   (Puppeteer + Gemini Vision)
   *   search                     → search.ts   (Gemini grounding)
   *   log_monitor                → log-monitor.ts (streaming process output)
   */
  private async act(toolCall: ToolCall): Promise<ToolResult> {
    this.record(
      'act',
      `Tool: ${chalk.bold(toolCall.tool)}  Input: ${JSON.stringify(toolCall.input)}`,
    );

    // Suppress spinner for tools that interact with the user or write directly
    // to stdout (shell_run human prompt, log_monitor live output, URL capture).
    const suppressSpinner =
      toolCall.tool === 'shell_run' ||
      toolCall.tool === 'log_monitor' ||
      (toolCall.tool === 'screenshot_and_analyze' &&
        toolCall.input.source.type === 'url');

    const spinner: Ora | null = suppressSpinner
      ? null
      : ora({
          text: chalk.green.dim(`Executing ${toolCall.tool}…`),
          color: 'green',
        }).start();

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
          result = await executeShellRun(toolCall.input);
          break;
        case 'screenshot_and_analyze':
          result = await executeScreenshotAndAnalyze(toolCall.input);
          break;
        case 'search':
          result = await executeSearch(toolCall.input);
          break;
        case 'log_monitor':
          result = await executeLogMonitor(toolCall.input);
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
   * Summarise the tool result and append it to history.
   * Keeps the terminal preview concise; full output is always in history.
   */
  private observe(result: ToolResult): void {
    const MAX_PREVIEW = 400;
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
   * Run the ReAct loop until the agent signals completion or `maxIterations`
   * is reached.
   *
   * @param goal  Natural-language description of the task to accomplish.
   */
  async runLoop(goal: string): Promise<void> {
    this.memory.goal = goal;

    console.log(`\n${BANNER}\n`);
    console.log(chalk.white(`Goal: ${chalk.bold(goal)}\n`));

    await this.scanEnvironment();

    for (let i = 1; i <= this.maxIterations; i++) {
      console.log(chalk.dim(`\n${'─'.repeat(52)} iteration ${i}`));

      const toolCall = await this.think(i);
      if (toolCall === null) break;

      const result = await this.act(toolCall);
      this.observe(result);
    }

    console.log(
      `\n${chalk.cyan.bold('✓ Agentic loop complete.')}  ` +
        chalk.dim(`${this.memory.history.length} steps recorded.\n`),
    );
  }

  /** Expose memory snapshot for inspection / testing. */
  getMemory(): Readonly<AgentMemory> {
    return this.memory;
  }
}
