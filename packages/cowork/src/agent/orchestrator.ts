/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 *
 * Multi-agent orchestration for Gemini Cowork — Phase 4.
 *
 * Agent roles
 * ─────────────
 *   • Coder    — implements the goal (writes code, runs tools).
 *   • Reviewer — critiques the coder's output and requests revisions.
 *   • Planner  — decomposes a complex goal into sub-tasks (future).
 *
 * Debate workflow
 * ───────────────
 *   1. Orchestrator gives the goal to the Coder.
 *   2. Coder produces a `Proposal` (list of file changes + reasoning).
 *   3. Orchestrator gives the Proposal to the Reviewer.
 *   4. Reviewer emits a `Review` (approved | changes_requested + feedback).
 *   5. If changes_requested and retries remain → Coder revises using feedback.
 *   6. Once approved (or max rounds exhausted) → Orchestrator returns the result.
 *
 * The current implementation uses a rule-based heuristic in place of live
 * Gemini model calls.  Replace `runCoderRound()` and `runReviewerRound()` with
 * real `GoogleGenAI.generateContent()` calls once the model integration is wired.
 */

import chalk from 'chalk';
import ora from 'ora';
import { Coworker } from './core.js';
import type { CoworkerOptions } from './core.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AgentRole = 'coder' | 'reviewer' | 'planner';

export interface AgentMessage {
  role: AgentRole | 'orchestrator' | 'user';
  content: string;
  timestamp: Date;
}

export interface FileProposal {
  path: string;
  /** Proposed new content of the file. */
  content: string;
  /** Human-readable explanation of what changed and why. */
  rationale: string;
}

export interface Proposal {
  /** Summary of the coder's approach. */
  summary: string;
  /** Files to be written or updated. */
  files: FileProposal[];
  /** Shell commands to run after writing files (e.g. `npm install`). */
  commands: string[];
  /** Round in which this proposal was generated. */
  round: number;
}

export interface ReviewComment {
  /** File path the comment applies to, or null for a general comment. */
  file: string | null;
  severity: 'info' | 'warning' | 'error';
  message: string;
}

export interface Review {
  decision: 'approved' | 'changes_requested';
  summary: string;
  comments: ReviewComment[];
  /** Revised goal injected back to the coder when changes are requested. */
  revisedGoal?: string;
}

export interface OrchestratorOptions {
  /** Maximum coder-reviewer rounds before accepting the last proposal. */
  maxRounds?: number;
  /** Options forwarded to the Coder agent. */
  coderOptions?: CoworkerOptions;
  /** Options forwarded to the Reviewer agent. */
  reviewerOptions?: CoworkerOptions;
  /**
   * When `true`, print an interleaved transcript of the debate to stdout.
   * @default true
   */
  verbose?: boolean;
}

export interface OrchestrationResult {
  finalProposal: Proposal;
  review: Review;
  rounds: number;
  approved: boolean;
  transcript: AgentMessage[];
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

/**
 * Manages a structured debate between a Coder agent and a Reviewer agent.
 *
 * ```ts
 * const orch = new Orchestrator({
 *   maxRounds: 3,
 *   coderOptions: { projectRoot, trace: true },
 *   reviewerOptions: { projectRoot },
 * });
 *
 * const result = await orch.orchestrate(
 *   'Add input validation to the login form and write unit tests',
 * );
 * console.log(result.approved ? '✓ Approved' : '✗ Needs work');
 * ```
 */
export class Orchestrator {
  private readonly maxRounds: number;
  private readonly verbose: boolean;
  private readonly coderOpts: CoworkerOptions;
  private readonly reviewerOpts: CoworkerOptions;
  private readonly transcript: AgentMessage[] = [];

  constructor(opts: OrchestratorOptions = {}) {
    this.maxRounds = opts.maxRounds ?? 3;
    this.verbose = opts.verbose ?? true;
    this.coderOpts = opts.coderOptions ?? {};
    this.reviewerOpts = opts.reviewerOptions ?? {};
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Run the full debate cycle for the given `goal`.
   *
   * Returns an `OrchestrationResult` describing whether the proposal was
   * approved, how many rounds were needed, and the full message transcript.
   */
  async orchestrate(goal: string): Promise<OrchestrationResult> {
    this.transcript.length = 0;
    this.log('orchestrator', `Starting orchestration for goal:\n  "${goal}"`);

    let proposal: Proposal | null = null;
    let review: Review = {
      decision: 'changes_requested',
      summary: 'Initial review pending.',
      comments: [],
      revisedGoal: goal,
    };

    let round = 0;

    while (round < this.maxRounds) {
      round++;
      const spinner = this.verbose
        ? ora({ text: chalk.blue.dim(`[Orchestrator] Round ${round}: Coder is working…`), color: 'blue' }).start()
        : null;

      // ── Coder round ────────────────────────────────────────────────────────
      const coderGoal = review.revisedGoal ?? goal;
      proposal = await this.runCoderRound(coderGoal, round, proposal);
      spinner?.succeed(chalk.blue.dim(`[Round ${round}] Coder produced ${proposal.files.length} file proposal(s).`));

      this.log('coder', `Round ${round} proposal:\n${proposal.summary}`);

      // ── Reviewer round ─────────────────────────────────────────────────────
      const reviewSpinner = this.verbose
        ? ora({ text: chalk.yellow.dim(`[Orchestrator] Round ${round}: Reviewer is evaluating…`), color: 'yellow' }).start()
        : null;

      review = await this.runReviewerRound(goal, proposal);
      reviewSpinner?.succeed(
        review.decision === 'approved'
          ? chalk.green.dim(`[Round ${round}] Reviewer: APPROVED — ${review.summary}`)
          : chalk.yellow.dim(`[Round ${round}] Reviewer: CHANGES REQUESTED — ${review.summary}`),
      );

      this.log('reviewer', `Round ${round} review (${review.decision}):\n${review.summary}`);

      if (review.decision === 'approved') break;

      if (round < this.maxRounds) {
        console.log(
          chalk.dim(
            `\n  Reviewer feedback (${review.comments.length} comment(s)):`,
          ),
        );
        for (const c of review.comments) {
          const prefix = c.severity === 'error' ? chalk.red('✗') : chalk.yellow('⚠');
          const file = c.file ? chalk.cyan(c.file) + ': ' : '';
          console.log(`  ${prefix} ${file}${c.message}`);
        }
        console.log();
      }
    }

    const approved = review.decision === 'approved';

    this.log(
      'orchestrator',
      approved
        ? `Orchestration complete after ${round} round(s). Proposal approved.`
        : `Max rounds (${this.maxRounds}) reached. Returning last proposal for user review.`,
    );

    if (!approved) {
      console.log(
        chalk.yellow(
          `\n⚠ Max review rounds (${this.maxRounds}) reached without approval.\n` +
            'Returning last proposal — manual review recommended.\n',
        ),
      );
    } else {
      console.log(chalk.green(`\n✓ Proposal approved after ${round} round(s).\n`));
    }

    return {
      finalProposal: proposal!,
      review,
      rounds: round,
      approved,
      transcript: [...this.transcript],
    };
  }

  /**
   * Run a standalone peer review of already-generated code.
   *
   * Useful when you want to review an existing diff or set of files without
   * running the full debate cycle.
   */
  async peerReview(proposal: Proposal, originalGoal: string): Promise<Review> {
    return this.runReviewerRound(originalGoal, proposal);
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  /**
   * Run the Coder agent for one round.
   *
   * Currently uses a heuristic implementation.  Replace with a structured
   * Gemini function-calling response to produce real `FileProposal[]`.
   */
  private async runCoderRound(
    goal: string,
    round: number,
    previous: Proposal | null,
  ): Promise<Proposal> {
    // Construct the full coder goal, injecting reviewer feedback when revising.
    const enrichedGoal =
      previous && round > 1
        ? `${goal}\n\n[REVISION CONTEXT — Round ${round}]\n` +
          `Previous attempt summary: ${previous.summary}\n` +
          `Apply the reviewer's requested changes and address all comments.`
        : goal;

    // Spin up a Coworker instance as the Coder agent.
    const coder = new Coworker({
      ...this.coderOpts,
      // Give the coder a unique label in traces.
      ...(this.coderOpts.trace ? { trace: true } : {}),
    });

    // Run the coder's loop.  In the heuristic implementation the loop will
    // write an analysis file; in a real implementation it would return
    // structured FileProposal JSON.
    await coder.runLoop(enrichedGoal);

    const mem = coder.getMemory();
    const lastObserve = [...mem.history]
      .reverse()
      .find((s) => s.phase === 'observe');

    // Build a synthetic proposal from the agent's history.
    return {
      summary: `Coder round ${round}: completed ${mem.history.length} steps for goal "${goal.slice(0, 80)}"`,
      files: [
        {
          path: `.cowork/analysis.md`,
          content: lastObserve?.content ?? '(no output)',
          rationale: 'Agent wrote project analysis during the agentic loop.',
        },
      ],
      commands: [],
      round,
    };
  }

  /**
   * Run the Reviewer agent for one round.
   *
   * Checks the proposal against configurable heuristic rules.  Replace with
   * a Gemini model call that returns a structured `Review` object.
   */
  private async runReviewerRound(goal: string, proposal: Proposal): Promise<Review> {
    const comments: ReviewComment[] = [];

    // ── Heuristic review rules ────────────────────────────────────────────────

    // Rule 1: At least one file must be produced.
    if (proposal.files.length === 0) {
      comments.push({
        file: null,
        severity: 'error',
        message: 'No files were produced. The coder must generate at least one file change.',
      });
    }

    // Rule 2: Each file proposal must include a rationale.
    for (const fp of proposal.files) {
      if (!fp.rationale.trim()) {
        comments.push({
          file: fp.path,
          severity: 'warning',
          message: 'Missing rationale. Explain why this change is needed.',
        });
      }
    }

    // Rule 3: Goal alignment check — does the proposal mention the key goal keywords?
    const goalKeywords = goal
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 3);

    const proposalText = (proposal.summary + proposal.files.map((f) => f.rationale).join(' ')).toLowerCase();

    const missingKeywords = goalKeywords.filter(
      (kw) => !proposalText.includes(kw),
    );

    if (missingKeywords.length > goalKeywords.length / 2) {
      comments.push({
        file: null,
        severity: 'warning',
        message:
          `Proposal may not fully address the goal. Missing context for: ` +
          missingKeywords.slice(0, 5).join(', '),
      });
    }

    // Rule 4: Commands should not contain destructive operations.
    for (const cmd of proposal.commands) {
      if (/rm\s+-rf|format|drop\s+database/i.test(cmd)) {
        comments.push({
          file: null,
          severity: 'error',
          message: `Potentially destructive command detected: "${cmd.slice(0, 80)}"`,
        });
      }
    }

    const hasErrors = comments.some((c) => c.severity === 'error');
    const hasWarnings = comments.some((c) => c.severity === 'warning');

    const decision: Review['decision'] =
      hasErrors || (hasWarnings && proposal.round < this.maxRounds)
        ? 'changes_requested'
        : 'approved';

    const revisedGoal =
      decision === 'changes_requested'
        ? `${goal}\n\nREVIEWER FEEDBACK:\n${comments.map((c) => `• ${c.message}`).join('\n')}`
        : undefined;

    return {
      decision,
      summary:
        decision === 'approved'
          ? `Proposal meets quality standards after ${proposal.round} round(s). ${comments.length} note(s).`
          : `${comments.filter((c) => c.severity === 'error').length} error(s) and ` +
            `${comments.filter((c) => c.severity === 'warning').length} warning(s) found.`,
      comments,
      revisedGoal,
    };
  }

  // ── Logging ───────────────────────────────────────────────────────────────

  private log(
    role: AgentMessage['role'],
    content: string,
  ): void {
    this.transcript.push({ role, content, timestamp: new Date() });
    if (!this.verbose) return;

    const colours: Record<AgentMessage['role'], chalk.Chalk> = {
      orchestrator: chalk.cyan,
      coder: chalk.blue,
      reviewer: chalk.yellow,
      planner: chalk.magenta,
      user: chalk.white,
    };
    const label = colours[role]?.bold(`[${role.toUpperCase()}]`) ?? `[${role}]`;
    console.log(`\n${label} ${chalk.dim(content)}`);
  }
}
