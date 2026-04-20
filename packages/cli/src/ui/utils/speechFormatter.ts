/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Speech-friendly response formatter for screen readers and text-to-speech.
 *
 * Transforms markdown-formatted CLI responses into plain text that is easier
 * to consume with assistive technologies. This includes stripping markdown
 * syntax, converting code blocks to descriptive prefixes, numbering bullet
 * points, linearizing tables, and replacing common symbols with verbal
 * descriptions.
 */

import stripAnsi from 'strip-ansi';

// ---------------------------------------------------------------------------
// Symbol replacement map
// ---------------------------------------------------------------------------

const SYMBOL_REPLACEMENTS: ReadonlyMap<string, string> = new Map([
  ['\u2192', ' arrow '], // →
  ['\u2190', ' left arrow '], // ←
  ['\u2191', ' up arrow '], // ↑
  ['\u2193', ' down arrow '], // ↓
  ['\u2194', ' left right arrow '], // ↔
  ['\u2713', ' check '], // ✓
  ['\u2714', ' check '], // ✔
  ['\u2717', ' cross '], // ✗
  ['\u2718', ' cross '], // ✘
  ['\u2022', ' bullet '], // •
  ['\u2026', '...'], // …
  ['\u2014', ' - '], // —  (em dash)
  ['\u2013', ' - '], // –  (en dash)
  ['\u2605', ' star '], // ★
  ['\u2606', ' star '], // ☆
  ['\u26A0', ' warning '], // ⚠
  ['\u2139', ' info '], // ℹ
  ['\u274C', ' error '], // ❌
  ['\u2705', ' check '], // ✅
  ['\u2728', ' sparkle '], // ✨
  ['\u2666', ' diamond '], // ♦  (used as a prefix marker)
  ['\u2756', ' diamond '], // ❖
  ['\u29BF', ' circle dot '], // ⦿
  ['\u25CF', ' circle '], // ●
  ['\u25CB', ' circle '], // ○
]);

// Build a single regex that matches any of the symbols above.
const symbolPattern = new RegExp(
  [...SYMBOL_REPLACEMENTS.keys()].map(escapeRegExp).join('|'),
  'g',
);

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------------------------------------------------------------------------
// Core formatting functions
// ---------------------------------------------------------------------------

/**
 * Strips ANSI escape / color codes from a string.
 */
export function stripAnsiCodes(text: string): string {
  return stripAnsi(text);
}

/**
 * Replaces common Unicode symbols with their verbal descriptions.
 */
export function replaceSymbols(text: string): string {
  return text.replace(
    symbolPattern,
    (match) => SYMBOL_REPLACEMENTS.get(match) ?? match,
  );
}

/**
 * Strips inline markdown formatting while preserving the inner text.
 *
 * Handles: bold (** / __), italic (* / _), strikethrough (~~),
 * inline code (`), underline (<u></u>), and markdown links [text](url).
 */
export function stripInlineMarkdown(text: string): string {
  let result = text;

  // Bold + italic (***text***)
  result = result.replace(/\*{3}(.+?)\*{3}/g, '$1');

  // Bold (**text** or __text__)
  result = result.replace(/\*{2}(.+?)\*{2}/g, '$1');
  result = result.replace(/__(.+?)__/g, '$1');

  // Italic (*text* or _text_) — avoid matching inside words or paths
  result = result.replace(/(?<!\w)\*(.+?)\*(?!\w)/g, '$1');
  result = result.replace(/(?<!\w)_(.+?)_(?!\w)/g, '$1');

  // Strikethrough (~~text~~)
  result = result.replace(/~~(.+?)~~/g, '$1');

  // Inline code (`text`)
  result = result.replace(/`([^`]+)`/g, '$1');

  // Underline (<u>text</u>)
  result = result.replace(/<u>(.*?)<\/u>/gi, '$1');

  // Markdown links [text](url) → "text (url)"
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)');

  return result;
}

/**
 * Converts a fenced code block into a speech-friendly representation.
 *
 * Input (array of lines inside the fences, excluding the ``` delimiters):
 *   language: "python"
 *   lines: ["def hello():", "    print('hi')"]
 *
 * Output:
 *   "Code, python:\ndef hello():\n    print('hi')\nEnd code."
 */
export function formatCodeBlock(
  lines: string[],
  language: string | null,
): string {
  const langLabel = language ? `, ${language}` : '';
  const code = lines.join('\n');
  return `Code${langLabel}:\n${code}\nEnd code.`;
}

/**
 * Converts markdown-style bullet lists (-, *, +) into numbered items
 * for easier sequential navigation with a screen reader.
 *
 * Nested bullets are flattened with indentation preserved as "sub-item".
 */
export function convertBulletsToNumbered(text: string): string {
  const lines = text.split('\n');
  let itemNumber = 0;
  const result: string[] = [];

  for (const line of lines) {
    const bulletMatch = line.match(/^(\s*)([-*+])\s+(.*)/);
    if (bulletMatch) {
      const indent = bulletMatch[1];
      const content = bulletMatch[3];
      if (indent.length > 0) {
        // Nested bullet — keep the parent numbering context.
        result.push(`${indent}sub-item: ${content}`);
      } else {
        itemNumber++;
        result.push(`${itemNumber}. ${content}`);
      }
    } else {
      // Reset numbering on non-list content (paragraph break).
      if (line.trim() === '') {
        itemNumber = 0;
      }
      result.push(line);
    }
  }

  return result.join('\n');
}

/**
 * Converts a markdown table into a descriptive, linearized text format
 * that is easy to follow when read aloud.
 *
 * Example output:
 *   Table with 2 columns: Name, Age.
 *   Row 1: Name: Alice, Age: 30.
 *   Row 2: Name: Bob, Age: 25.
 *   End table.
 */
export function convertTableToText(
  headers: string[],
  rows: string[][],
): string {
  const parts: string[] = [];
  parts.push(
    `Table with ${headers.length} column${headers.length !== 1 ? 's' : ''}: ${headers.join(', ')}.`,
  );

  rows.forEach((row, rowIndex) => {
    const cells = headers.map((header, colIndex) => {
      const value = row[colIndex] ?? '';
      return `${header}: ${value}`;
    });
    parts.push(`Row ${rowIndex + 1}: ${cells.join(', ')}.`);
  });

  parts.push('End table.');
  return parts.join('\n');
}

/**
 * Strips markdown heading markers (# through ####) while preserving
 * the heading text. Adds a "Heading:" prefix so the listener knows
 * the structural role of the text.
 */
export function convertHeadings(text: string): string {
  return text.replace(
    /^(#{1,4})\s+(.*)/gm,
    (_match, hashes: string, content: string) => {
      const level = hashes.length;
      return `Heading level ${level}: ${content}`;
    },
  );
}

/**
 * Strips horizontal rule markers (---, ***, ___).
 */
export function convertHorizontalRules(text: string): string {
  return text.replace(/^[ \t]*([-*_][ \t]*){3,}[ \t]*$/gm, 'Separator.');
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Full-pipeline speech-friendly formatter.
 *
 * Takes raw markdown text (potentially with ANSI codes) and returns
 * plain text optimised for screen readers and TTS engines.
 */
export function formatForSpeech(markdown: string): string {
  let text = markdown;

  // 1. Strip ANSI escape codes first so downstream regexes work on plain text.
  text = stripAnsiCodes(text);

  // 2. Process fenced code blocks before touching inline markdown,
  //    because code blocks may contain characters that look like markdown.
  text = processFencedCodeBlocks(text);

  // 3. Process tables.
  text = processMarkdownTables(text);

  // 4. Convert headings.
  text = convertHeadings(text);

  // 5. Convert horizontal rules.
  text = convertHorizontalRules(text);

  // 6. Convert unordered bullet lists to numbered items.
  text = convertBulletsToNumbered(text);

  // 7. Strip remaining inline markdown.
  text = stripInlineMarkdown(text);

  // 8. Replace symbols with verbal descriptions.
  text = replaceSymbols(text);

  // 9. Collapse excessive blank lines (more than 2 consecutive) into a single blank line.
  text = text.replace(/\n{3,}/g, '\n\n');

  return text.trim();
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Finds fenced code blocks (``` ... ```) and replaces them with
 * speech-friendly equivalents.
 */
function processFencedCodeBlocks(text: string): string {
  const fenceRegex =
    /^[ \t]*(`{3,}|~{3,})[ \t]*(\w*?)[ \t]*$\n?([\s\S]*?)^[ \t]*\1[ \t]*$/gm;

  return text.replace(
    fenceRegex,
    (_match, _fence, lang: string, code: string) => {
      const lines = code.replace(/\n$/, '').split('\n');
      return formatCodeBlock(lines, lang || null);
    },
  );
}

/**
 * Finds markdown tables and replaces them with linearized text.
 *
 * A markdown table is identified by:
 *   | header1 | header2 |
 *   | ------- | ------- |
 *   | cell1   | cell2   |
 */
function processMarkdownTables(text: string): string {
  const lines = text.split('\n');
  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const headerMatch = lines[i].match(/^\s*\|(.+)\|\s*$/);
    const separatorLine = i + 1 < lines.length ? lines[i + 1] : '';
    const separatorMatch = separatorLine.match(
      /^\s*\|?\s*(:?-+:?)\s*(\|\s*(:?-+:?)\s*)+\|?\s*$/,
    );

    if (headerMatch && separatorMatch) {
      const headers = headerMatch[1].split('|').map((c) => c.trim());
      const rows: string[][] = [];
      i += 2; // skip header + separator

      while (i < lines.length) {
        const rowMatch = lines[i].match(/^\s*\|(.+)\|\s*$/);
        if (!rowMatch) break;
        rows.push(rowMatch[1].split('|').map((c) => c.trim()));
        i++;
      }

      result.push(convertTableToText(headers, rows));
    } else {
      result.push(lines[i]);
      i++;
    }
  }

  return result.join('\n');
}
