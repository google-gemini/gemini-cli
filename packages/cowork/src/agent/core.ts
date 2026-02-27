/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 *
 * Core agentic loop for Gemini Cowork — Phase 5 (Self-Optimization · Security · Collaboration).
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
 * Phase 2 additions  — multimodal, long context, live search, log monitor
 * Phase 3 additions  — MCP, persistent memory, self-healing, telemetry
 * Phase 4 additions  — config, sandbox, multi-agent, dashboard, dry-run
 * Phase 5 additions
 * ─────────────────
 *   • Redactor        : scrubs secrets / PII before any text is sent to the LLM.
 *   • AuditLog        : SHA-256-chained tamper-proof record of every action.
 *   • ContextPruner   : removes redundant blocks from the 2M-token context.
 *   • ModelTier       : auto-selects Flash vs Pro by task complexity.
 *   • FeedbackCollector: records correction pairs for few-shot improvement.
 *   • ReviewerSuggester: post-edit CODEOWNERS-aware reviewer recommendations.
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
import { Tracer } from './tracer.js';
import { MemoryStore, MemoryRetriever } from '../memory/vector-store.js';
import { MCPManager } from '../mcp/client.js';
import type { MCPServerConfig } from '../mcp/client.js';
import { SelfHealer } from './self-healer.js';
import { dryRunWriteFile, dryRunShellRun } from '../tools/dry-run.js';
import type { DashboardServer } from '../dashboard/server.js';
import { Redactor } from '../security/redactor.js';
import { AuditLog } from '../security/audit-log.js';
import { ContextPruner, ModelTier } from './optimizer.js';
import { FeedbackCollector } from '../feedback/collector.js';
import {
  CodeownersParser,
  ReviewerSuggester,
} from '../collaboration/codeowners.js';
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
  type MCPCallInput,
  type AutoTestInput,
} from '../tools/definitions.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Construction options for `Coworker`.
 *
 * All Phase 3 integrations (MCP servers, memory, trace mode) are opt-in via
 * this object so the Phase 1 / Phase 2 usage pattern is fully backwards-compatible.
 */
export interface CoworkerOptions {
  /** Absolute path to the project to work on. Defaults to `process.cwd()`. */
  projectRoot?: string;
  /** Maximum number of ReAct loop iterations. Defaults to 10. */
  maxIterations?: number;
  /**
   * When `true`, every Think / Act / Observe step is recorded to
   * `.cowork/traces/<sessionId>.json` and `.md`.
   */
  trace?: boolean;
  /**
   * When `true`, a persistent vector memory store is loaded from
   * `.cowork/memory.json` and relevant past context is injected into
   * every Think step.
   */
  memory?: boolean;
  /**
   * MCP server configurations.  Each server is connected at startup and its
   * tools become available via the `mcp_call` tool.
   */
  mcpServers?: MCPServerConfig[];
  /**
   * When `true`, write_file and shell_run calls are intercepted and shown as
   * diffs / command previews without being applied to disk.
   */
  dryRun?: boolean;
  /**
   * An already-started `DashboardServer` instance.  When provided, every
   * Think / Act / Observe event is streamed to the web dashboard in real time.
   */
  dashboard?: DashboardServer;

  // ── Phase 5 ────────────────────────────────────────────────────────────────
  /**
   * When `true` (default), API keys, JWTs, emails and other secrets are
   * automatically redacted from all text before it is used in prompts or logs.
   */
  redact?: boolean;
  /**
   * When `true`, every file write, shell command, and MCP call is appended to
   * a SHA-256-chained audit log at `.cowork/audit.ndjson`.
   */
  securityAudit?: boolean;
  /**
   * When `true`, the ProjectIndexer context document is pruned before
   * injection into the Think step to reduce token consumption.
   */
  pruneContext?: boolean;
  /**
   * Path to the feedback JSONL dataset used for few-shot prompting.
   * Defaults to `<projectRoot>/.cowork/feedback.jsonl`.
   */
  feedbackPath?: string;
  /**
   * When `true`, the agent checks CODEOWNERS after writing files and logs
   * reviewer recommendations in the Observe step.
   */
  codeownersAware?: boolean;
}

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
  | { tool: 'log_monitor'; input: LogMonitorInput }
  | { tool: 'mcp_call'; input: MCPCallInput }
  | { tool: 'auto_test'; input: AutoTestInput };

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
  chalk.cyan('║   Gemini Cowork  ─  Agentic Loop  v0.5           ║'),
  chalk.cyan('║   Security · Self-Optimize · Team Collab          ║'),
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
 * // Phase 1 / 2 usage — fully backwards-compatible:
 * const agent = new Coworker(process.cwd());
 * await agent.runLoop('Fix the broken hero section CSS and verify visually');
 *
 * // Phase 3 usage — with MCP, memory, and trace mode:
 * const agent = new Coworker({
 *   projectRoot: process.cwd(),
 *   trace: true,
 *   memory: true,
 *   mcpServers: [{ id: 'github', name: 'GitHub MCP',
 *     transport: { type: 'stdio', command: 'npx',
 *       args: ['-y', '@modelcontextprotocol/server-github'] } }],
 * });
 * await agent.runLoop('Create a GitHub issue for the login bug');
 * ```
 */
export class Coworker {
  private readonly memory: AgentMemory;
  private readonly maxIterations: number;

  // Phase 3 — optional subsystems
  private readonly tracer: Tracer | null;
  private readonly memoryStore: MemoryStore | null;
  private readonly memoryRetriever: MemoryRetriever | null;
  private readonly mcp: MCPManager | null;
  private readonly mcpServers: MCPServerConfig[];
  // Phase 4 — dry-run + dashboard
  private readonly dryRun: boolean;
  private readonly dashboard: DashboardServer | null;
  // Phase 5 — security, optimization, collaboration
  private readonly redactor: Redactor | null;
  private readonly auditLog: AuditLog | null;
  private readonly pruner: ContextPruner | null;
  private readonly modelTier: ModelTier;
  private readonly feedbackCollector: FeedbackCollector | null;
  private readonly codeownersAware: boolean;
  private readonly writtenFiles: string[] = [];

  /** Backwards-compatible overload: `new Coworker(root?, maxIterations?)`. */
  constructor(projectRoot?: string, maxIterations?: number);
  /** Phase 3 options overload: `new Coworker({ projectRoot, trace, memory, mcpServers })`. */
  constructor(opts?: CoworkerOptions);
  constructor(
    rootOrOpts: string | CoworkerOptions | undefined = process.cwd(),
    maxIterationsArg = 10,
  ) {
    let projectRoot: string;
    let maxIterations: number;
    let trace = false;
    let useMemory = false;
    let mcpServers: MCPServerConfig[] = [];
    let dryRun = false;
    let dashboard: DashboardServer | null = null;
    let redact = true;
    let securityAudit = false;
    let pruneContext = false;
    let feedbackPath: string | undefined;
    let codeownersAware = false;

    if (typeof rootOrOpts === 'string' || rootOrOpts === undefined) {
      projectRoot = rootOrOpts ?? process.cwd();
      maxIterations = maxIterationsArg;
    } else {
      projectRoot = rootOrOpts.projectRoot ?? process.cwd();
      maxIterations = rootOrOpts.maxIterations ?? 10;
      trace = rootOrOpts.trace ?? false;
      useMemory = rootOrOpts.memory ?? false;
      mcpServers = rootOrOpts.mcpServers ?? [];
      dryRun = rootOrOpts.dryRun ?? false;
      dashboard = rootOrOpts.dashboard ?? null;
      redact = rootOrOpts.redact ?? true;
      securityAudit = rootOrOpts.securityAudit ?? false;
      pruneContext = rootOrOpts.pruneContext ?? false;
      feedbackPath = rootOrOpts.feedbackPath;
      codeownersAware = rootOrOpts.codeownersAware ?? false;
    }

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

    // ── Tracer ───────────────────────────────────────────────────────────────
    this.tracer = trace ? new Tracer(projectRoot) : null;

    // ── Persistent memory ────────────────────────────────────────────────────
    if (useMemory) {
      this.memoryStore = new MemoryStore(join(projectRoot, '.cowork', 'memory.json'));
      this.memoryRetriever = new MemoryRetriever(this.memoryStore);
    } else {
      this.memoryStore = null;
      this.memoryRetriever = null;
    }

    // ── MCP ──────────────────────────────────────────────────────────────────
    // Servers are connected in runLoop (async) because addServer() is async.
    this.mcp = mcpServers.length > 0 ? new MCPManager() : null;
    this.mcpServers = mcpServers;

    // ── Phase 4 ──────────────────────────────────────────────────────────────
    this.dryRun = dryRun;
    this.dashboard = dashboard;

    // ── Phase 5 ──────────────────────────────────────────────────────────────
    this.redactor = redact ? new Redactor() : null;
    this.pruner = pruneContext ? new ContextPruner() : null;
    this.modelTier = new ModelTier();
    this.codeownersAware = codeownersAware;

    if (securityAudit) {
      const sessionId = `cowork-${Date.now().toString(36)}`;
      this.auditLog = new AuditLog(
        join(projectRoot, '.cowork', 'audit.ndjson'),
        sessionId,
      );
    } else {
      this.auditLog = null;
    }

    if (feedbackPath || useMemory) {
      const path = feedbackPath ?? join(projectRoot, '.cowork', 'feedback.jsonl');
      this.feedbackCollector = new FeedbackCollector(path);
    } else {
      this.feedbackCollector = null;
    }
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

    const mcpTools = this.mcp?.listAllTools() ?? [];
    const mcpStr =
      mcpTools.length > 0
        ? `${mcpTools.length} tools (${mcpTools.map((t) => t.qualifiedName).slice(0, 3).join(', ')}${mcpTools.length > 3 ? '…' : ''})`
        : chalk.dim('none');

    const lines = [
      `Project  : ${name} v${version}`,
      `Root     : ${this.memory.projectRoot}`,
      `Files    : ${this.memory.fileTree.join(', ')}`,
      `Scripts  : ${scripts}`,
      `Deps     : ${deps}`,
      `Goal     : ${this.memory.goal}`,
      `Vision   : ${this.memory.visionEnabled ? chalk.green('enabled') : chalk.dim('disabled')}`,
      `MCP      : ${mcpStr}`,
      `Memory   : ${this.memoryRetriever ? chalk.green('enabled') : chalk.dim('disabled')}`,
      `Trace    : ${this.tracer ? chalk.green('enabled') : chalk.dim('disabled')}`,
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
      const summary = `Codebase indexed: ${ctx.files.filter((f) => !f.skipped).length} files · ~${ctx.totalTokens.toLocaleString()} tokens`;
      indexSpinner.succeed(chalk.dim(summary));
      this.tracer?.record({ phase: 'env_scan', content: summary });
    } catch {
      indexSpinner.warn(chalk.yellow('Codebase indexing skipped (non-fatal).'));
      this.tracer?.record({ phase: 'env_scan', content: 'Codebase indexing skipped.' });
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
   * Phase 3 additions:
   *   • Injects relevant past memories from MemoryRetriever into the reasoning
   *     context so the agent can learn across sessions.
   *   • Records the reasoning step to the Tracer.
   *
   * Returns `null` to signal that the loop should terminate.
   */
  private async think(iteration: number): Promise<ToolCall | null> {
    const spinner: Ora = ora({
      text: chalk.blue.dim('Reasoning about next action…'),
      color: 'blue',
    }).start();

    await new Promise<void>((r) => setTimeout(r, 200)); // model latency placeholder
    spinner.stop();

    // ── Phase 5: model tier decision ──────────────────────────────────────────
    const tierDecision = this.modelTier.select(null, this.memory.goal);
    if (tierDecision.complexityScore >= 0.55) {
      this.tracer?.record({
        phase: 'think',
        content: `ModelTier: ${tierDecision.model} — ${tierDecision.reason}`,
      });
    }

    // ── Phase 5: context pruning ───────────────────────────────────────────
    if (this.pruner && this.memory.contextSummary && iteration === 1) {
      const pruneResult = this.pruner.prune(
        this.memory.contextSummary,
        this.memory.goal,
      );
      if (pruneResult.savedTokens > 1_000) {
        this.memory.contextSummary = pruneResult.text;
        this.tracer?.record({
          phase: 'think',
          content: `ContextPruner: removed ${pruneResult.removedBlocks} blocks, saved ~${pruneResult.savedTokens.toLocaleString()} tokens`,
        });
      }
    }

    // ── Phase 3: retrieve relevant past memories ───────────────────────────
    let memoryContext = '';
    if (this.memoryRetriever) {
      try {
        memoryContext = await this.memoryRetriever.retrieve(this.memory.goal, 3);
      } catch {
        // non-fatal — continue without memory context
      }
    }

    // ── Phase 5: few-shot examples from past corrections ──────────────────
    let fewShotContext = '';
    if (this.feedbackCollector) {
      try {
        const examples = await this.feedbackCollector.buildFewShotExamples(
          this.memory.goal,
          3,
        );
        fewShotContext = this.feedbackCollector.formatAsSystemPrompt(examples);
      } catch {
        // non-fatal
      }
    }

    const context = this.buildContext();
    const lastObservation =
      [...this.memory.history]
        .reverse()
        .find((s) => s.phase === 'observe')?.content ?? 'No prior observations.';

    const thinkContent =
      `Iteration ${iteration}\n          ${context}\n          Last obs : ${lastObservation.slice(0, 150)}` +
      (memoryContext ? `\n\n${memoryContext}` : '') +
      (fewShotContext ? `\n\n${fewShotContext}` : '');

    this.record('think', thinkContent);
    this.tracer?.record({ phase: 'think', iteration, content: thinkContent });
    this.dashboard?.emit({ type: 'think', iteration, content: thinkContent });

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
   *   mcp_call                   → mcp/client.ts (MCPManager.callTool)
   *   auto_test                  → self-healer.ts (Fix-Test-Repeat loop)
   */
  private async act(toolCall: ToolCall): Promise<ToolResult> {
    const actContent = `Tool: ${chalk.bold(toolCall.tool)}  Input: ${JSON.stringify(toolCall.input)}`;
    this.record('act', actContent);

    const t0 = Date.now();

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
          // Dry-run: show diff instead of writing.
          result = this.dryRun
            ? await dryRunWriteFile(toolCall.input.path, toolCall.input.content)
            : await executeWriteFile(toolCall.input);
          // Phase 5: track for CODEOWNERS analysis + audit log.
          if (!this.dryRun) {
            this.writtenFiles.push(toolCall.input.path);
            await this.auditLog?.record({
              action: 'write_file',
              path: toolCall.input.path,
              detail: `${toolCall.input.content.length} bytes written`,
            });
          }
          break;
        case 'shell_run':
          // Dry-run: show command preview instead of running.
          result = this.dryRun
            ? dryRunShellRun(toolCall.input.command, toolCall.input.cwd)
            : await executeShellRun(toolCall.input);
          // Phase 5: audit log.
          if (!this.dryRun) {
            await this.auditLog?.record({
              action: 'shell_run',
              command: toolCall.input.command,
              detail: toolCall.input.cwd,
            });
          }
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
        case 'mcp_call': {
          await this.auditLog?.record({
            action: 'mcp_call',
            mcpTool: toolCall.input.qualifiedName,
            detail: JSON.stringify(toolCall.input.args ?? {}),
          });
          if (!this.mcp) {
            result = { output: '', error: 'No MCP servers are configured.' };
          } else {
            const mcpResult = await this.mcp.callTool(
              toolCall.input.qualifiedName,
              toolCall.input.args ?? {},
            );
            const text = mcpResult.content
              .map((c) =>
                typeof c === 'object' && c !== null && 'text' in c
                  ? String((c as { text: unknown }).text)
                  : JSON.stringify(c),
              )
              .join('\n');
            result = {
              output: text,
              ...(mcpResult.isError ? { error: 'MCP tool reported an error.' } : {}),
            };
          }
          break;
        }
        case 'auto_test': {
          const healer = new SelfHealer(
            this.memory.projectRoot,
            toolCall.input.maxRetries ?? 3,
          );
          const healResult = await healer.heal({
            packageJson: this.memory.packageJson,
            testFilter: toolCall.input.testFilter,
            onAttempt: (attempt, passed, errors) => {
              const msg = passed
                ? `✓ Tests passed on attempt ${attempt}`
                : `✗ Attempt ${attempt}: ${errors.length} error(s)`;
              console.log(chalk.dim(`  [SelfHealer] ${msg}`));
              this.tracer?.record({
                phase: 'self_heal',
                content: msg,
                output: { attempt, passed, errorCount: errors.length },
              });
            },
          });
          result = {
            output: healResult.success
              ? `All tests pass after ${healResult.totalAttempts} attempt(s).`
              : `Tests still failing after ${healResult.totalAttempts} attempt(s).\n${healResult.finalOutput.slice(0, 600)}`,
            ...(healResult.success ? {} : { error: 'auto_test: tests did not pass.' }),
          };
          break;
        }
      }

      const durationMs = Date.now() - t0;
      spinner?.succeed(chalk.green.dim(`${toolCall.tool} complete.`));

      this.tracer?.record({
        phase: toolCall.tool === 'mcp_call' ? 'mcp_call' : 'act',
        tool: toolCall.tool,
        content: actContent,
        input: toolCall.input,
        output: result.output.slice(0, 1000),
        durationMs,
      });
      this.dashboard?.emit({
        type: 'act',
        tool: toolCall.tool,
        content: actContent,
      });

      return result;
    } catch (err) {
      spinner?.fail(chalk.red(`${toolCall.tool} failed.`));
      this.tracer?.record({
        phase: 'act',
        tool: toolCall.tool,
        content: `ERROR in ${toolCall.tool}: ${err instanceof Error ? err.message : String(err)}`,
        input: toolCall.input,
        durationMs: Date.now() - t0,
      });
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

    // Phase 5: redact sensitive values from tool output before logging.
    const safeOutput = this.redactor
      ? this.redactor.redact(result.output).text
      : result.output;

    const preview =
      safeOutput.length > MAX_PREVIEW
        ? `${safeOutput.slice(0, MAX_PREVIEW)}… (${safeOutput.length} chars total)`
        : safeOutput || '(empty)';

    const observation = result.error
      ? `ERROR: ${result.error}\nOUTPUT: ${preview}`
      : `OUTPUT: ${preview}`;

    this.record('observe', observation);
    this.tracer?.record({ phase: 'observe', content: observation, output: preview });
    this.dashboard?.emit({ type: 'observe', content: observation });
  }

  /**
   * Phase 5: After writing files, check CODEOWNERS and surface reviewer
   * recommendations in the agent's observation log.
   */
  private async observeCodeowners(): Promise<void> {
    if (!this.codeownersAware || this.writtenFiles.length === 0) return;

    try {
      const parser = new CodeownersParser();
      const rules = await parser.loadFromProject(this.memory.projectRoot);
      if (rules.length === 0) return;

      const suggester = new ReviewerSuggester(rules);
      const recs = suggester.analyze(this.writtenFiles, this.memory.projectRoot);
      const formatted = suggester.format(recs);

      this.record('observe', `CODEOWNERS:\n${formatted}`);
      this.tracer?.record({ phase: 'observe', content: `CODEOWNERS reviewer suggestions:\n${formatted}` });
    } catch {
      // non-fatal
    }
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Run the ReAct loop until the agent signals completion or `maxIterations`
   * is reached.
   *
   * Phase 3 additions:
   *   • Connects any configured MCP servers before the first iteration.
   *   • Loads the persistent memory store (if enabled) before the first Think.
   *   • Wraps the entire session in a Tracer (if enabled), writing JSON + Markdown
   *     artefacts on completion.
   *
   * @param goal  Natural-language description of the task to accomplish.
   */
  async runLoop(goal: string): Promise<void> {
    this.memory.goal = goal;

    console.log(`\n${BANNER}\n`);
    console.log(chalk.white(`Goal: ${chalk.bold(goal)}\n`));

    // ── Phase 3 + 4: start trace / dashboard session ──────────────────────────
    this.tracer?.startSession(goal);
    this.tracer?.record({ phase: 'session_start', content: `Goal: ${goal}` });
    this.dashboard?.emit({ type: 'session_start', content: `Goal: ${goal}` });

    // ── Phase 5: audit session start ─────────────────────────────────────────
    await this.auditLog?.record({
      action: 'session_start',
      detail: `Goal: ${goal.slice(0, 200)}`,
    });

    // ── Phase 3: connect MCP servers ─────────────────────────────────────────
    if (this.mcp && this.mcpServers.length > 0) {
      const mcpSpinner = ora({
        text: chalk.dim(`Connecting ${this.mcpServers.length} MCP server(s)…`),
        color: 'cyan',
      }).start();
      const results = await Promise.allSettled(
        this.mcpServers.map((cfg) => this.mcp!.addServer(cfg)),
      );
      const connected = results.filter((r) => r.status === 'fulfilled').length;
      mcpSpinner.succeed(
        chalk.dim(`MCP: ${connected}/${this.mcpServers.length} server(s) connected.`),
      );
    }

    // ── Phase 3: load persistent memory ──────────────────────────────────────
    if (this.memoryStore) {
      try {
        await this.memoryStore.load();
      } catch {
        // non-fatal
      }
    }

    await this.scanEnvironment();

    let outcome: 'success' | 'error' | 'max_iterations' = 'success';

    try {
      for (let i = 1; i <= this.maxIterations; i++) {
        console.log(chalk.dim(`\n${'─'.repeat(52)} iteration ${i}`));

        const toolCall = await this.think(i);
        if (toolCall === null) break;

        const result = await this.act(toolCall);
        this.observe(result);

        if (i === this.maxIterations) {
          outcome = 'max_iterations';
        }
      }
    } catch (err) {
      outcome = 'error';
      this.tracer?.record({
        phase: 'observe',
        content: `Fatal error: ${err instanceof Error ? err.message : String(err)}`,
      });
      throw err;
    } finally {
      // ── Phase 3: end trace session ─────────────────────────────────────────
      if (this.tracer?.active) {
        try {
          const tracePath = await this.tracer.endSession(outcome);
          console.log(chalk.dim(`\nTrace saved → ${tracePath}`));
        } catch {
          // non-fatal
        }
      }

      // ── Phase 4: dashboard session end ────────────────────────────────────
      this.dashboard?.emit({ type: 'session_end', content: `Outcome: ${outcome}` });

      // ── Phase 5: CODEOWNERS reviewer suggestions ──────────────────────────
      await this.observeCodeowners();

      // ── Phase 5: audit session end ────────────────────────────────────────
      await this.auditLog?.record({
        action: 'session_end',
        detail: `outcome=${outcome} steps=${this.memory.history.length} filesWritten=${this.writtenFiles.length}`,
      });

      // ── Phase 3: disconnect MCP servers ──────────────────────────────────
      await this.mcp?.dispose().catch(() => undefined);
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
