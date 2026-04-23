/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export interface SanitizationResult {
  sanitized: string;
  strippedCount: number;
  warnings: string[];
}

/**
 * Unicode codepoints with no visible representation.
 * Explicit \uXXXX escapes ensure the regex survives editor/git normalization.
 * U+200B zero-width space, U+200C ZWNJ, U+200D ZWJ,
 * U+202A–U+202E directional formatting (incl. RTL override U+202E),
 * U+2060 word joiner, U+FEFF BOM.
 */
const INVISIBLE_UNICODE_RE =
  // eslint-disable-next-line no-misleading-character-class -- intentional match on invisible/bidi codepoints
  /[\u200B\u200C\u200D\u202A-\u202E\u2060\uFEFF]/gu;

/** HTML comment pattern. */
const HTML_COMMENT_RE = /<!--[\s\S]*?-->/g;

/**
 * Injection phrase patterns — all use /gi so every occurrence is replaced, not
 * just the first. Without the g flag an attacker can repeat the phrase to bypass.
 * Compound patterns (two-component) catch multi-step attacks; simple patterns
 * catch standalone hijack phrases that are unambiguously adversarial.
 */
const INJECTION_PATTERNS: RegExp[] = [
  // Instruction hijacking + follow-up imperative (compound)
  /\b(?:ignore|disregard|forget|override)\s+(?:all\s+)?(?:previous|prior|above|earlier)\s+(?:instructions?|context|rules?|prompts?|system)\b[\s\S]{0,200}?(?:instead|now|and|;)\s+(?:you\s+(?:must|should|will)|do|execute|run|perform)/gi,
  // Standalone instruction hijacking — unambiguously adversarial without follow-up
  /\b(?:ignore|disregard|forget|override)\s+(?:all\s+)?(?:previous|prior|above|earlier)\s+(?:instructions?|context|rules?|prompts?|system prompt)\b/gi,
  // Role manipulation + command (compound)
  /\byou\s+are\s+now\s+(?:a|an|the)\s+\w+[\s\S]{0,100}?(?:you\s+(?:must|should|will)|do|execute|run|perform)/gi,
  // Standalone new-role assignment
  /\byour\s+(?:new\s+)?(?:instructions?|rules?|directives?|purpose)\s+(?:are|is)\s*:/gi,
  // Exfiltration directive
  /\b(?:send|post|upload|exfiltrate|transmit)\s+(?:the\s+)?(?:contents?\s+of\s+|all\s+)?(?:\.env|api\s+keys?|credentials?|secrets?|password)/gi,
  // Output suppression
  /\b(?:do\s+not|never|don't)\s+(?:mention|reveal|show|tell|disclose)\s+(?:this|these|the\s+(?:above|following|previous))/gi,
  // System prompt extraction
  /\b(?:print|show|output|reveal|repeat|display)\s+(?:your\s+)?(?:system\s+prompt|initial\s+instructions?|original\s+instructions?|prompt\s+above)\b/gi,
];

/**
 * Strips leading ']' at the start of a line. Some LLMs use [Role] turn markers;
 * a lone ']' at line-start can break out of such a marker to inject a new turn.
 */
const CONTEXT_BRACKET_RE = /^\]/gm;

/**
 * Collapses runs of 3+ consecutive blank lines to 2. Excessive blank lines are
 * used to push injected content past the visible context window and inject fake
 * new conversation turns.
 */
const EXCESSIVE_NEWLINE_RE = /(?:\r?\n){3,}/g;

const ALERT_THRESHOLD = 3;

/**
 * Sanitizes external content (web_fetch responses, untrusted MCP results) before
 * it enters the LLM context window.
 *
 * Strips HTML comments, invisible Unicode, injection phrase patterns, leading
 * context-bracket characters, and normalizes excessive blank lines.
 */
export function sanitizeExternalContent(raw: string): SanitizationResult {
  let sanitized = raw;
  let strippedCount = 0;
  const warnings: string[] = [];

  // 1. Remove invisible Unicode characters
  const unicodeMatches = sanitized.match(INVISIBLE_UNICODE_RE);
  if (unicodeMatches && unicodeMatches.length > 0) {
    sanitized = sanitized.replace(INVISIBLE_UNICODE_RE, '');
    strippedCount += unicodeMatches.length;
  }

  // 2. Remove HTML comments
  const htmlCommentMatches = sanitized.match(HTML_COMMENT_RE);
  if (htmlCommentMatches && htmlCommentMatches.length > 0) {
    sanitized = sanitized.replace(HTML_COMMENT_RE, '');
    strippedCount += htmlCommentMatches.length;
  }

  // 3. Detect and remove injection phrase patterns (global replace — all occurrences)
  for (const pattern of INJECTION_PATTERNS) {
    const before = sanitized;
    sanitized = sanitized.replace(pattern, '[SANITIZED]');
    if (sanitized !== before) strippedCount++;
  }

  // 4. Strip leading ']' at line-start (context turn-marker escape)
  const bracketBefore = sanitized;
  sanitized = sanitized.replace(CONTEXT_BRACKET_RE, '');
  if (sanitized !== bracketBefore) strippedCount++;

  // 5. Collapse excessive blank lines (fake turn injection)
  const newlineBefore = sanitized;
  sanitized = sanitized.replace(EXCESSIVE_NEWLINE_RE, '\n\n');
  if (sanitized !== newlineBefore) strippedCount++;

  // 6. Normalize excessive whitespace padding (>100 consecutive spaces or tabs).
  //    Uses [ \t] rather than \s so newlines are preserved — collapsing \n here
  //    would destroy paragraph structure for legitimate content.
  const paddingBefore = sanitized;
  sanitized = sanitized.replace(/[ \t]{100,}/g, ' ');
  if (sanitized !== paddingBefore) strippedCount++;

  if (strippedCount >= ALERT_THRESHOLD) {
    warnings.push(
      `Content contained ${strippedCount} injection pattern(s) and was sanitized.`,
    );
  }

  return { sanitized, strippedCount, warnings };
}
