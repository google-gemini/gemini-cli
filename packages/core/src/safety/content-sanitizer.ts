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
const INVISIBLE_UNICODE_RE = /[​‌‍‪-‮⁠﻿]/g;

/** HTML comment pattern. */
const HTML_COMMENT_RE = /<!--[\s\S]*?-->/g;

/**
 * Injection phrase patterns.
 * Compound patterns (two-component) catch multi-step attacks; simple patterns
 * catch standalone hijack phrases that are unambiguously adversarial.
 */
const INJECTION_PATTERNS: RegExp[] = [
  // Instruction hijacking + follow-up imperative (compound)
  /\b(?:ignore|disregard|forget|override)\s+(?:all\s+)?(?:previous|prior|above|earlier)\s+(?:instructions?|context|rules?|prompts?|system)\b[\s\S]{0,200}?(?:instead|now|and|;)\s+(?:you\s+(?:must|should|will)|do|execute|run|perform)/i,
  // Standalone instruction hijacking — unambiguously adversarial without follow-up
  /\b(?:ignore|disregard|forget|override)\s+(?:all\s+)?(?:previous|prior|above|earlier)\s+(?:instructions?|context|rules?|prompts?|system prompt)\b/i,
  // Role manipulation + command (compound)
  /\byou\s+are\s+now\s+(?:a|an|the)\s+\w+[\s\S]{0,100}?(?:you\s+(?:must|should|will)|do|execute|run|perform)/i,
  // Standalone new-role assignment
  /\byour\s+(?:new\s+)?(?:instructions?|rules?|directives?|purpose)\s+(?:are|is)\s*:/i,
  // Exfiltration directive
  /\b(?:send|post|upload|exfiltrate|transmit)\s+(?:the\s+)?(?:contents?\s+of\s+|all\s+)?(?:\.env|api\s+keys?|credentials?|secrets?|password)/i,
  // Output suppression
  /\b(?:do\s+not|never|don't)\s+(?:mention|reveal|show|tell|disclose)\s+(?:this|these|the\s+(?:above|following|previous))/i,
  // System prompt extraction
  /\b(?:print|show|output|reveal|repeat|display)\s+(?:your\s+)?(?:system\s+prompt|initial\s+instructions?|original\s+instructions?|prompt\s+above)\b/i,
];

const ALERT_THRESHOLD = 3;

/**
 * Sanitizes external content (web_fetch responses, untrusted MCP results) before
 * it enters the LLM context window.
 *
 * Strips HTML comments, invisible Unicode, injection phrase patterns, and
 * excessive whitespace padding.
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

  // 3. Detect and remove injection phrase patterns
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(sanitized)) {
      sanitized = sanitized.replace(pattern, '[SANITIZED]');
      strippedCount++;
    }
  }

  // 4. Normalize excessive whitespace padding (>100 consecutive spaces)
  const paddingRe = / {100,}/g;
  if (paddingRe.test(sanitized)) {
    sanitized = sanitized.replace(paddingRe, ' ');
    strippedCount++;
  }

  if (strippedCount >= ALERT_THRESHOLD) {
    warnings.push(
      `Content contained ${strippedCount} injection pattern(s) and was sanitized.`,
    );
  }

  return { sanitized, strippedCount, warnings };
}
