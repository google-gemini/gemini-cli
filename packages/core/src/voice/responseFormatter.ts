/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Options for formatForSpeech().
 */
export interface FormatForSpeechOptions {
  /**
   * Maximum output length in characters before truncating.
   * @default 500
   */
  maxLength?: number;
  /**
   * Number of trailing path segments to keep when abbreviating absolute paths.
   * @default 3
   */
  pathDepth?: number;
  /**
   * Maximum number of characters in a JSON value before summarising it.
   * @default 80
   */
  jsonThreshold?: number;
}

// ANSI escape sequences (CSI, OSC, etc.)
// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b(?:\[[0-9;]*[mGKHF]|\][^\x07\x1b]*\x07|[()][AB012])/g;

// Fenced code blocks  ```lang\n...\n```
const CODE_FENCE_RE = /```[^\n]*\n([\s\S]*?)```/g;

// Inline code  `...`
const INLINE_CODE_RE = /`([^`]+)`/g;

// Bold/italic markers  **text**, *text*, __text__, _text_
// Exclude newlines so the pattern cannot span multiple lines and accidentally
// consume list markers that haven't been stripped yet.
const BOLD_ITALIC_RE = /\*{1,2}([^*\n]+)\*{1,2}|_{1,2}([^_\n]+)_{1,2}/g;

// Blockquote prefix  "> "
const BLOCKQUOTE_RE = /^>\s?/gm;

// ATX headings  # heading
const HEADING_RE = /^#{1,6}\s+/gm;

// Markdown links  [text](url)
const LINK_RE = /\[([^\]]+)\]\([^)]+\)/g;

// Markdown list markers  "- " or "* " or "N. " at line start
const LIST_MARKER_RE = /^[ \t]*(?:[-*]|\d+\.)\s+/gm;

// Two or more consecutive stack-trace frames (Node.js style "    at …" lines).
// Matching blocks of ≥2 lets us replace each group in-place, preserving any
// text that follows the trace rather than appending it to the end.
const STACK_BLOCK_RE = /(?:^[ \t]+at [^\n]+(?:\n|$)){2,}/gm;

// Absolute Unix paths optionally ending with :line or :line:col
// Hyphen placed at start of char class to avoid useless-escape lint error
const UNIX_PATH_RE =
  /(?:^|(?<=\s|[(`"']))(\/[-\w.@]+(?:\/[-\w.@]+)*)(:\d+(?::\d+)?)?/g;

// Absolute Windows paths  C:\...  or  C:/...  (any drive letter)
const WIN_PATH_RE =
  /(?:^|(?<=\s|[(`"']))([A-Za-z]:[/\\][-\w. ]+(?:[/\\][-\w. ]+)*)(:\d+(?::\d+)?)?/g;

/**
 * Abbreviates an absolute path to at most `depth` trailing segments,
 * prefixed with "…". Optionally converts `:line` suffix to `line N`.
 */
function abbreviatePath(
  full: string,
  suffix: string | undefined,
  depth: number,
): string {
  const segments = full.split(/[/\\]/).filter(Boolean);
  const kept = segments.length > depth ? segments.slice(-depth) : segments;
  const abbreviated =
    segments.length > depth ? `\u2026/${kept.join('/')}` : full;

  if (!suffix) return abbreviated;
  // Convert ":142" → " line 142", ":142:7" → " line 142"
  const lineNum = suffix.split(':').filter(Boolean)[0];
  return `${abbreviated} line ${lineNum}`;
}

/**
 * Summarises a JSON string as "(JSON object with N keys)" or
 * "(JSON array with N items)", falling back to the original if parsing fails.
 */
function summariseJson(jsonStr: string): string {
  try {
    const parsed: unknown = JSON.parse(jsonStr);
    if (Array.isArray(parsed)) {
      return `(JSON array with ${parsed.length} item${parsed.length === 1 ? '' : 's'})`;
    }
    if (parsed !== null && typeof parsed === 'object') {
      const keys = Object.keys(parsed).length;
      return `(JSON object with ${keys} key${keys === 1 ? '' : 's'})`;
    }
  } catch {
    // not valid JSON — leave as-is
  }
  return jsonStr;
}

/**
 * Transforms a markdown/ANSI-formatted string into speech-ready plain text.
 *
 * Transformations applied (in order):
 * 1. Strip ANSI escape codes
 * 2. Collapse fenced code blocks to their content (or a JSON summary)
 * 3. Collapse stack traces to first frame + count
 * 4. Strip markdown syntax (bold, italic, blockquotes, headings, links, lists, inline code)
 * 5. Abbreviate deep absolute paths
 * 6. Normalise whitespace
 * 7. Truncate to maxLength
 */
export function formatForSpeech(
  text: string,
  options?: FormatForSpeechOptions,
): string {
  const maxLength = options?.maxLength ?? 500;
  const pathDepth = options?.pathDepth ?? 3;
  const jsonThreshold = options?.jsonThreshold ?? 80;

  if (!text) return '';

  let out = text;

  // 1. Strip ANSI escape codes
  out = out.replace(ANSI_RE, '');

  // 2. Fenced code blocks — try to summarise JSON content, else keep text
  out = out.replace(CODE_FENCE_RE, (_match, body: string) => {
    const trimmed = body.trim();
    if (trimmed.length > jsonThreshold) {
      const summary = summariseJson(trimmed);
      if (summary !== trimmed) return summary;
    }
    return trimmed;
  });

  // 3. Collapse stack traces: replace each contiguous block of ≥2 frames
  //    in-place so that any text after the trace is preserved in order.
  out = out.replace(STACK_BLOCK_RE, (block) => {
    const lines = block
      .trim()
      .split('\n')
      .map((l) => l.trim());
    const rest = lines.length - 1;
    return `${lines[0]} (and ${rest} more frame${rest === 1 ? '' : 's'})\n`;
  });

  // 4. Strip markdown syntax
  out = out
    .replace(INLINE_CODE_RE, '$1')
    .replace(BOLD_ITALIC_RE, (_m, g1?: string, g2?: string) => g1 ?? g2 ?? '')
    .replace(BLOCKQUOTE_RE, '')
    .replace(HEADING_RE, '')
    .replace(LINK_RE, '$1')
    .replace(LIST_MARKER_RE, '');

  // 5. Abbreviate absolute paths
  //    Windows paths first to avoid the leading letter being caught by Unix RE
  out = out.replace(WIN_PATH_RE, (_m, full: string, suffix?: string) =>
    abbreviatePath(full, suffix, pathDepth),
  );
  out = out.replace(UNIX_PATH_RE, (_m, full: string, suffix?: string) =>
    abbreviatePath(full, suffix, pathDepth),
  );

  // 6. Normalise whitespace: collapse multiple blank lines, trim
  out = out.replace(/\n{3,}/g, '\n\n').trim();

  // 7. Truncate
  if (out.length > maxLength) {
    const total = out.length;
    out = out.slice(0, maxLength).trimEnd() + `\u2026 (${total} chars total)`;
  }

  return out;
}
