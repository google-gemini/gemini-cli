/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Represents a detected user hold directive that should prevent mutating
 * tool calls for the current turn.
 */
export interface HoldDirective {
  /** The type of hold directive detected. */
  type: HoldDirectiveType;
  /** The original phrase that matched. */
  matchedPhrase: string;
  /** Confidence score from 0 to 1. */
  confidence: number;
}

export enum HoldDirectiveType {
  /** User explicitly said to wait, hold, or pause. */
  EXPLICIT_WAIT = 'explicit_wait',
  /** User asked for explanation or analysis only. */
  EXPLAIN_ONLY = 'explain_only',
  /** User said not to apply changes yet. */
  NO_CHANGES_YET = 'no_changes_yet',
  /** User requested a review/report before action. */
  REVIEW_FIRST = 'review_first',
}

/**
 * Patterns that indicate the user wants the agent to hold off on mutating
 * actions. Each entry maps a regex to a directive type and confidence level.
 *
 * Patterns are designed to avoid false positives from common programming
 * terms (e.g., "wait for the promise to resolve" should NOT trigger a hold).
 */
const HOLD_PATTERNS: Array<{
  pattern: RegExp;
  type: HoldDirectiveType;
  confidence: number;
}> = [
  // Explicit wait/hold/pause directives
  // Standalone single-word directives (Review #1: gemini-code-assist)
  {
    pattern: /^(?:wait|hold|pause|stop|halt)[.!]?$/i,
    type: HoldDirectiveType.EXPLICIT_WAIT,
    confidence: 0.9,
  },
  {
    pattern:
      /\b(?:wait|hold|pause|stop|halt)\b(?:\s+(?:for|until)\s+(?:my|me|user|i\s|further)|\s+(?:before|on|here|there|now|first)|\s*[,.]?\s*(?:don'?t|do\s+not|let me))/i,
    type: HoldDirectiveType.EXPLICIT_WAIT,
    confidence: 0.95,
  },
  // Round 1 Review #6 + Round 2 Review #7: temporal suffix mandatory,
  // [^.!?\n]*? prevents crossing sentence AND newline boundaries.
  {
    pattern:
      /\b(?:don'?t|do\s+not)\s+(?:apply|make|execute|run|implement|modify|change|write|edit|replace|update|fix|rewrite)\b[^.!?\n]*?\b(?:yet|now|until|before|first|for now)\b/i,
    type: HoldDirectiveType.NO_CHANGES_YET,
    confidence: 0.95,
  },
  {
    pattern: /\bnot\s+(?:yet|now|right now)\b/i,
    type: HoldDirectiveType.NO_CHANGES_YET,
    confidence: 0.8,
  },
  // Round 2 Review #8: "but don't change/make" now also requires temporal
  // suffix to avoid false positives on "but don't change the existing tests".
  {
    pattern: /\bbut\s+(?:not\s+now|wait|first|hold)\b/i,
    type: HoldDirectiveType.NO_CHANGES_YET,
    confidence: 0.9,
  },
  {
    pattern:
      /\bbut\s+don'?t\s+(?:apply|make|change|fix|modify)\b[^.!?\n]*?\b(?:yet|now|first|for now)\b/i,
    type: HoldDirectiveType.NO_CHANGES_YET,
    confidence: 0.9,
  },

  // Explain/analyze only directives
  {
    pattern:
      /\b(?:just|only|merely)\s+(?:explain|describe|analyze|analyse|show|tell|list|outline|summarize|report|review|investigate|research|assess|evaluate)\b/i,
    type: HoldDirectiveType.EXPLAIN_ONLY,
    confidence: 0.9,
  },
  {
    pattern: /\bexplain\s+(?:first|before|it\s+to\s+me)\b/i,
    type: HoldDirectiveType.EXPLAIN_ONLY,
    confidence: 0.85,
  },
  {
    pattern:
      /\bwithout\s+(?:changing|modifying|editing|applying|touching|altering|writing)\s+(?:anything|any\s+(?:files?|code))\b/i,
    type: HoldDirectiveType.EXPLAIN_ONLY,
    confidence: 0.95,
  },

  // Review/report first directives
  {
    pattern:
      /\b(?:show|present|give)\s+(?:me\s+)?(?:the\s+)?(?:full\s+)?(?:review|report|analysis|findings|results|plan|design|proposal|strategy|assessment)\s*(?:report|analysis|findings)?\s+(?:first|before)\b/i,
    type: HoldDirectiveType.REVIEW_FIRST,
    confidence: 0.9,
  },
  // Round 2 Review #9: replaced greedy .* with [^.!?\n]* to stay within one clause.
  {
    pattern:
      /\b(?:show|present|give)\s+(?:me\s+)?(?:the\s+)?(?:full\s+)?(?:review|report|analysis|findings|results)\b[^.!?\n]*\b(?:before)\b/i,
    type: HoldDirectiveType.REVIEW_FIRST,
    confidence: 0.85,
  },
  // Round 2 Review #11: only matches when "before/prior to" starts the
  // sentence. "run tests before making changes" is an action, not a hold.
  // Round 3 Review #13: also match after newlines since we preserve them.
  {
    pattern:
      /(?:^|[.!?\n]\s*)\b(?:before|prior\s+to)\s+(?:making|applying|implementing|executing)\s+(?:any\s+)?(?:changes|fixes|modifications|updates)\b/i,
    type: HoldDirectiveType.REVIEW_FIRST,
    confidence: 0.9,
  },
  // Round 3 Review #12: restricted to "first|myself" only. "later|after"
  // caused false positives on "I will review later, for now implement".
  {
    pattern:
      /\bi\s+will\s+(?:run|do|apply|check|review|test)\b[^.!?\n]*\b(?:first|myself)\b/i,
    type: HoldDirectiveType.REVIEW_FIRST,
    confidence: 0.85,
  },
];

/**
 * Negative patterns that cancel a hold directive detection.
 * These catch cases like "don't wait" or "just apply the fix".
 */
const NEGATION_PATTERNS: RegExp[] = [
  /\b(?:don'?t|do\s+not)\s+(?:wait|hold|pause|stop)\b/i,
  // Review #2: narrowed "just do" to "just do it" to avoid false negatives
  // on phrases like "just do the analysis, don't apply yet"
  /\bjust\s+(?:apply|fix|implement|make|go ahead|proceed)\b|\bjust\s+do\s+it\b/i,
  /\bgo\s+ahead\b/i,
  /\bproceed\b/i,
];

/**
 * Detects hold directives from user message text.
 *
 * Returns the highest-confidence hold directive found, or null if no
 * directive is detected or a negation pattern cancels it.
 *
 * @param userMessage - The raw user message text to analyze.
 * @returns The detected hold directive with the highest confidence, or null.
 */
export function detectHoldDirective(userMessage: string): HoldDirective | null {
  if (!userMessage || typeof userMessage !== 'string') {
    return null;
  }

  // Normalize horizontal whitespace only. Newlines are preserved so that
  // regex [^.!?\n] boundaries work correctly on multi-line messages
  // (Round 3 Review #13).
  const normalized = userMessage
    .replace(/\r\n|\r/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .trim();

  if (normalized.length === 0) {
    return null;
  }

  // Split the message into clauses (by sentence-ending punctuation,
  // newlines, or common clause separators like ", but" / "; ").
  // Round 4 Review #18: negation patterns are now per-clause so that
  // "go ahead with research, but do not modify files yet" correctly
  // detects the hold in the second clause rather than being globally
  // cancelled by "go ahead" in the first clause.
  const clauses = normalized
    .split(/[.!?\n]|,\s+but\s+|;\s+/)
    .map((c) => c.trim())
    .filter(Boolean);

  let bestMatch: HoldDirective | null = null;

  for (const clause of clauses) {
    // Check if this clause is negated (action directive)
    const isNegated = NEGATION_PATTERNS.some((p) => p.test(clause));
    if (isNegated) {
      continue;
    }

    for (const { pattern, type, confidence } of HOLD_PATTERNS) {
      const match = pattern.exec(clause);
      if (match) {
        if (!bestMatch || confidence > bestMatch.confidence) {
          bestMatch = {
            type,
            matchedPhrase: match[0],
            confidence,
          };
        }
      }
    }
  }

  // Also run patterns against the full normalized message for patterns
  // that span clause boundaries (e.g., standalone "not yet").
  if (!bestMatch) {
    const isGlobalNegated = NEGATION_PATTERNS.some((p) => p.test(normalized));
    if (!isGlobalNegated) {
      for (const { pattern, type, confidence } of HOLD_PATTERNS) {
        const match = pattern.exec(normalized);
        if (match) {
          if (!bestMatch || confidence > bestMatch.confidence) {
            bestMatch = { type, matchedPhrase: match[0], confidence };
          }
        }
      }
    }
  }

  return bestMatch;
}

import { MUTATING_TOOL_NAMES } from '../tools/tool-names.js';

/**
 * Checks whether a tool name refers to a mutating (write) tool.
 *
 * Secure by default (Review #3: gemini-code-assist): any tool NOT
 * explicitly listed in the read-only allowlist is treated as mutating.
 * This ensures custom MCP tools and new built-in tools are blocked
 * by the hold directive guard until explicitly allowlisted.
 */
export function isMutatingTool(toolName: string): boolean {
  return !READ_ONLY_TOOL_NAMES.has(toolName);
}

export { MUTATING_TOOL_NAMES };

/**
 * Tools that are always allowed regardless of hold directive state.
 * This is an allowlist of explicitly safe, read-only tools.
 */
export const READ_ONLY_TOOL_NAMES = new Set([
  'read_file',
  'read_many_files',
  'glob',
  'grep',
  'ls',
  'web_search',
  'web_fetch',
  'get_internal_docs',
  'ask_user',
  'activate_skill',
  'update_topic',
  'complete_task',
  'enter_plan_mode',
  'exit_plan_mode',
  'tracker_get_task',
  'tracker_list_tasks',
  'tracker_visualize',
  'read_mcp_resource',
  'list_mcp_resources',
  'codebase_investigator',
  'cli_help',
]);

/**
 * Builds the error message returned to the model when a tool call is
 * blocked by an active hold directive.
 */
export function buildHoldDirectiveError(
  toolName: string,
  directive: HoldDirective,
): string {
  const typeDescriptions: Record<HoldDirectiveType, string> = {
    [HoldDirectiveType.EXPLICIT_WAIT]:
      'The user has requested you to wait before making changes.',
    [HoldDirectiveType.EXPLAIN_ONLY]:
      'The user requested explanation/analysis only, no file modifications.',
    [HoldDirectiveType.NO_CHANGES_YET]:
      'The user explicitly instructed you NOT to apply changes yet.',
    [HoldDirectiveType.REVIEW_FIRST]:
      'The user asked to see your findings/plan before any changes are applied.',
  };

  return (
    `[HOLD DIRECTIVE ACTIVE] Tool "${toolName}" was blocked because: ` +
    `${typeDescriptions[directive.type]} ` +
    `(Matched phrase: "${directive.matchedPhrase}"). ` +
    `Read-only tools (read_file, grep, glob, ls, web_search, etc.) remain available. ` +
    `Present your findings to the user and wait for an explicit Directive ` +
    `(e.g., "apply the fix", "go ahead", "proceed") before calling ` +
    `mutating tools like write_file, edit, or shell.`
  );
}
