/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Utility helpers to preserve literal escape sequences (e.g. \\n, \\t, \\r, \\f, \\b, \\\\)
 * that may have been unintentionally collapsed into control characters by model
 * generations or intermediate processing steps.
 */

/**
 * Result of attempting to restore collapsed escapes.
 */
export interface EscapeCollapseResult {
  /**
   * The (possibly) corrected output string.
   */
  output: string;
  /**
   * Whether any modification was applied.
   */
  changed: boolean;
  /**
   * A map of escape literals that were restored and how many times.
   */
  restoredCounts: Record<string, number>;
}

/**
 * Options controlling restoration behavior.
 */
export interface RestoreEscapesOptions {
  /**
   * When true (default), attempt to restore all supported escapes aggressively
   * whenever the heuristic triggers.
   */
  aggressive?: boolean;

  /**
   * Restrict restoration only to these escape literals (e.g. ["\\n","\\t"]).
   * If omitted, all supported escapes are considered.
   */
  restrictTo?: string[];

  /**
   * Maximum total replacements allowed. If exceeded, the function aborts and
   * returns the original proposed text unchanged (changed = false). This helps
   * avoid pathological large unintended rewrites.
   * Default: 10_000 (effectively "no practical cap" for normal edits).
   */
  maxTotalReplacements?: number;
}

/**
 * Internal representation of a supported escape sequence.
 */
interface SupportedEscape {
  /**
   * Literal form as appears in source (two chars or more, e.g. "\\n").
   */
  literal: string;
  /**
   * The control character that the literal could collapse to.
   * For "\\\\" we use a single backslash.
   */
  controlChar: string;
  /**
   * Human readable label (optional, not used right now but may aid logging).
   */
  label: string;
}

/**
 * List of supported escape sequences we attempt to preserve.
 *
 * NOTE:
 * - We exclude sequences like \\uXXXX intentionally, because collapsing there
 *   is different in nature (potentially a unicode escape vs literal codepoint).
 * - We can extend this list later if necessary.
 */
const SUPPORTED_ESCAPES: SupportedEscape[] = [
  { literal: '\\n', controlChar: '\n', label: 'newline' },
  { literal: '\\r', controlChar: '\r', label: 'carriage_return' },
  { literal: '\\t', controlChar: '\t', label: 'tab' },
  { literal: '\\f', controlChar: '\f', label: 'form_feed' },
  { literal: '\\b', controlChar: '\b', label: 'backspace' },
  // Double backslash => single backslash
  { literal: '\\\\', controlChar: '\\', label: 'backslash' },
];

/**
 * Counts the non-overlapping occurrences of a substring within a string.
 * Avoids regex for clarity and to keep deterministic behavior.
 */
function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let idx = 0;
  while (true) {
    idx = haystack.indexOf(needle, idx);
    if (idx === -1) break;
    count++;
    idx += needle.length;
  }
  return count;
}

/**
 * Applies a single escape restoration rule.
 *
 * Heuristic:
 *  - If the original contains the literal at least once.
 *  - AND the proposed output does not contain that literal at all.
 *  - AND the proposed output does contain the *control character*.
 *  - AND (aggressive mode) we assume all such control characters are unintended
 *    collapses and replace them globally.
 *
 * Additional constraints (for backslash):
 *  - We only restore "\\\\" if original had it AND proposed has single '\' but
 *    not the double literal.
 */
function maybeRestoreEscape(
  original: string,
  proposed: string,
  esc: SupportedEscape,
  aggressive: boolean,
  restoredCounts: Record<string, number>,
  maxTotalReplacements: { current: number; limit: number },
  restrictSet?: Set<string>,
): string {
  // Must appear (as literal) in original text to even consider restoration.
  if (!original.includes(esc.literal)) {
    return proposed;
  }

  // If caller restricted the list and this escape is not included, skip.
  if (restrictSet && !restrictSet.has(esc.literal)) {
    return proposed;
  }

  // Already preserved => nothing to do.
  if (proposed.includes(esc.literal)) {
    return proposed;
  }

  // If proposed does not contain the control char either, nothing to restore.
  if (!proposed.includes(esc.controlChar)) {
    return proposed;
  }

  /**
   * Partial‑collapse heuristic:
   * Only restore if (count(literal in original) === count(controlChar in proposed))
   * OR (aggressive mode). This prevents restoring cases where the user genuinely
   * introduced more real control characters than originally escaped.
   */
  const originalLiteralCount = countOccurrences(original, esc.literal);
  const proposedControlCount = countOccurrences(proposed, esc.controlChar);

  if (!aggressive && proposedControlCount !== originalLiteralCount) {
    // Skip restoration in non‑aggressive mode unless counts align exactly.
    return proposed;
  }

  // Backslash special case:
  // Avoid restoring single backslashes that were legitimately present unless
  // there is clear evidence of collapse: the original had the double literal
  // AND proposed contains at least one sequence where introducing the literal
  // would not create an invalid escape pair like "\\n" that we already plan to
  // restore separately.
  if (
    esc.literal === '\\\\' &&
    !original.includes('\\\\') // defensive (already covered by earlier includes, kept for clarity)
  ) {
    return proposed;
  }

  // Perform replacements (global) in a single pass.
  const replacementNeeded = proposed.includes(esc.controlChar);
  if (!replacementNeeded) {
    return proposed;
  }

  const pieces = proposed.split(esc.controlChar);
  if (pieces.length <= 1) {
    return proposed;
  }

  const replacements = pieces.length - 1;
  if (
    maxTotalReplacements.current + replacements >
    maxTotalReplacements.limit
  ) {
    return proposed;
  }

  // Reconstruct and record.
  const restored = pieces.join(esc.literal);
  if (restored === proposed) {
    return proposed;
  }

  maxTotalReplacements.current += replacements;
  restoredCounts[esc.literal] =
    (restoredCounts[esc.literal] ?? 0) + replacements;
  return restored;
}

/**
 * Restores collapsed escapes in a proposed edit using the original text as
 * a reference.
 *
 * @param original The original snippet (pre-edit).
 * @param proposed The proposed edited snippet (possibly with collapsed escapes).
 * @param options  Optional behavioral flags.
 *
 * @returns EscapeCollapseResult with (possibly) restored output.
 */
export function restoreCollapsedEscapes(
  original: string,
  proposed: string,
  options?: RestoreEscapesOptions,
): EscapeCollapseResult {
  if (!original || !proposed) {
    return {
      output: proposed,
      changed: false,
      restoredCounts: {},
    };
  }

  const aggressive = options?.aggressive ?? true;
  const restrictSet = options?.restrictTo
    ? new Set(options.restrictTo)
    : undefined;
  const limit = options?.maxTotalReplacements ?? 10_000;

  const restoredCounts: Record<string, number> = {};
  let output = proposed;
  let changed = false;

  const maxTotalReplacements = { current: 0, limit };

  for (const esc of SUPPORTED_ESCAPES) {
    const before = output;
    output = maybeRestoreEscape(
      original,
      output,
      esc,
      aggressive,
      restoredCounts,
      maxTotalReplacements,
      restrictSet,
    );
    if (output !== before) {
      changed = true;
      if (maxTotalReplacements.current >= maxTotalReplacements.limit) {
        break;
      }
    }
  }

  return { output, changed, restoredCounts };
}

/**
 * Convenience wrapper with a shorter semantic name for use at call sites where
 * "preserve" better communicates intent than "restore".
 *
 * Equivalent to calling restoreCollapsedEscapes with default options.
 */
export function preserveEscapesUsingOriginalContext(
  original: string,
  proposed: string,
  options?: RestoreEscapesOptions,
): EscapeCollapseResult {
  return restoreCollapsedEscapes(original, proposed, options);
}

/**
 * Simple diagnostic helper for debugging & tests: produces a summary string
 * indicating which escapes were restored.
 */
export function formatRestorationSummary(result: EscapeCollapseResult): string {
  const entries = Object.entries(result.restoredCounts);
  if (entries.length === 0) {
    return 'No escape sequences restored.';
  }
  return entries.map(([literal, count]) => `${literal}: ${count}`).join(', ');
}

/**
 * Counts how many literal escape sequences of the supported set are present.
 * Useful in tests for asserting baseline expectations.
 */
export function countSupportedEscapeLiterals(text: string): number {
  return SUPPORTED_ESCAPES.reduce(
    (acc, esc) => acc + countOccurrences(text, esc.literal),
    0,
  );
}
