/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import chalk from 'chalk';
import {
  resolveColor,
  INK_SUPPORTED_NAMES,
  INK_NAME_TO_HEX_MAP,
} from '../themes/color-utils.js';
import { theme } from '../semantic-colors.js';
import { debugLogger } from '@google/gemini-cli-core';

// Constants for Markdown parsing
const BOLD_MARKER_LENGTH = 2; // For "**"
const ITALIC_MARKER_LENGTH = 1; // For "*" or "_"
const STRIKETHROUGH_MARKER_LENGTH = 2; // For "~~")
const INLINE_CODE_MARKER_LENGTH = 1; // For "`"
const UNDERLINE_TAG_START_LENGTH = 3; // For "<u>"
const UNDERLINE_TAG_END_LENGTH = 4; // For "</u>"

// Characters that are typically trailing punctuation and not part of a URL
const TRAILING_PUNCTUATION = /[.,;:!?)}\]]+$/;

/**
 * Strips trailing punctuation from a URL, handling balanced parentheses
 * for URLs like Wikipedia links (e.g., https://en.wikipedia.org/wiki/Foo_(bar)).
 *
 * @returns A tuple of [cleanUrl, trailingPunctuation]
 */
export function stripTrailingUrlPunctuation(rawUrl: string): [string, string] {
  const match = rawUrl.match(TRAILING_PUNCTUATION);
  if (!match) {
    return [rawUrl, ''];
  }

  let url = rawUrl.slice(0, -match[0].length);
  let trailing = match[0];

  // Handle balanced parentheses: if the URL contains an opening paren
  // but we stripped the closing one, restore closing parens to balance them.
  const openParens = (url.match(/\(/g) || []).length;
  const closeParens = (url.match(/\)/g) || []).length;
  const deficit = openParens - closeParens;

  if (deficit > 0) {
    // Restore closing parens from the trailing punctuation to balance
    let restored = 0;
    for (let i = 0; i < trailing.length && restored < deficit; i++) {
      if (trailing[i] === ')') {
        restored++;
      }
    }
    if (restored > 0) {
      // Move the balanced closing parens back to the URL
      let parensToRestore = restored;
      let splitIndex = 0;
      for (let i = 0; i < trailing.length && parensToRestore > 0; i++) {
        if (trailing[i] === ')') {
          parensToRestore--;
        }
        splitIndex = i + 1;
      }
      url = rawUrl.slice(0, rawUrl.length - match[0].length + splitIndex);
      trailing = rawUrl.slice(rawUrl.length - match[0].length + splitIndex);
    }
  }

  // If nothing remains after stripping, return the original URL
  if (url.length === 0) {
    return [rawUrl, ''];
  }

  return [url, trailing];
}

/**
 * Helper to apply color to a string using ANSI escape codes,
 * consistent with how Ink's colorize works.
 */
const ansiColorize = (str: string, color: string | undefined): string => {
  if (!color) return str;
  const resolved = resolveColor(color);
  if (!resolved) return str;

  if (resolved.startsWith('#')) {
    return chalk.hex(resolved)(str);
  }

  const mappedHex = INK_NAME_TO_HEX_MAP[resolved];
  if (mappedHex) {
    return chalk.hex(mappedHex)(str);
  }

  if (INK_SUPPORTED_NAMES.has(resolved)) {
    switch (resolved) {
      case 'black':
        return chalk.black(str);
      case 'red':
        return chalk.red(str);
      case 'green':
        return chalk.green(str);
      case 'yellow':
        return chalk.yellow(str);
      case 'blue':
        return chalk.blue(str);
      case 'magenta':
        return chalk.magenta(str);
      case 'cyan':
        return chalk.cyan(str);
      case 'white':
        return chalk.white(str);
      case 'gray':
      case 'grey':
        return chalk.gray(str);
      default:
        return str;
    }
  }

  return str;
};

/**
 * Converts markdown text into a string with ANSI escape codes.
 * This mirrors the parsing logic in InlineMarkdownRenderer.tsx
 */
export const parseMarkdownToANSI = (
  text: string,
  defaultColor?: string,
): string => {
  const baseColor = defaultColor ?? theme.text.primary;
  // Early return for plain text without markdown or URLs
  if (!/[*_~`<[https?:]/.test(text)) {
    return ansiColorize(text, baseColor);
  }

  let result = '';
  const inlineRegex =
    /(\*\*\*.*?\*\*\*|\*\*.*?\*\*|\*.*?\*|_.*?_|~~.*?~~|\[.*?\]\(.*?\)|`+.+?`+|<u>.*?<\/u>|https?:\/\/\S+)/g;
  let lastIndex = 0;
  let match;

  while ((match = inlineRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      result += ansiColorize(text.slice(lastIndex, match.index), baseColor);
    }

    const fullMatch = match[0];
    let styledPart = '';

    try {
      if (
        fullMatch.endsWith('***') &&
        fullMatch.startsWith('***') &&
        fullMatch.length > (BOLD_MARKER_LENGTH + ITALIC_MARKER_LENGTH) * 2
      ) {
        styledPart = chalk.bold(
          chalk.italic(
            parseMarkdownToANSI(
              fullMatch.slice(
                BOLD_MARKER_LENGTH + ITALIC_MARKER_LENGTH,
                -BOLD_MARKER_LENGTH - ITALIC_MARKER_LENGTH,
              ),
              baseColor,
            ),
          ),
        );
      } else if (
        fullMatch.endsWith('**') &&
        fullMatch.startsWith('**') &&
        fullMatch.length > BOLD_MARKER_LENGTH * 2
      ) {
        styledPart = chalk.bold(
          parseMarkdownToANSI(
            fullMatch.slice(BOLD_MARKER_LENGTH, -BOLD_MARKER_LENGTH),
            baseColor,
          ),
        );
      } else if (
        fullMatch.length > ITALIC_MARKER_LENGTH * 2 &&
        ((fullMatch.startsWith('*') && fullMatch.endsWith('*')) ||
          (fullMatch.startsWith('_') && fullMatch.endsWith('_'))) &&
        !/\w/.test(text.substring(match.index - 1, match.index)) &&
        !/\w/.test(
          text.substring(inlineRegex.lastIndex, inlineRegex.lastIndex + 1),
        ) &&
        !/\S[./\\]/.test(text.substring(match.index - 2, match.index)) &&
        !/[./\\]\S/.test(
          text.substring(inlineRegex.lastIndex, inlineRegex.lastIndex + 2),
        )
      ) {
        styledPart = chalk.italic(
          parseMarkdownToANSI(
            fullMatch.slice(ITALIC_MARKER_LENGTH, -ITALIC_MARKER_LENGTH),
            baseColor,
          ),
        );
      } else if (
        fullMatch.startsWith('~~') &&
        fullMatch.endsWith('~~') &&
        fullMatch.length > STRIKETHROUGH_MARKER_LENGTH * 2
      ) {
        styledPart = chalk.strikethrough(
          parseMarkdownToANSI(
            fullMatch.slice(
              STRIKETHROUGH_MARKER_LENGTH,
              -STRIKETHROUGH_MARKER_LENGTH,
            ),
            baseColor,
          ),
        );
      } else if (
        fullMatch.startsWith('`') &&
        fullMatch.endsWith('`') &&
        fullMatch.length > INLINE_CODE_MARKER_LENGTH
      ) {
        const codeMatch = fullMatch.match(/^(`+)(.+?)\1$/s);
        if (codeMatch && codeMatch[2]) {
          styledPart = ansiColorize(codeMatch[2], theme.text.accent);
        }
      } else if (
        fullMatch.startsWith('[') &&
        fullMatch.includes('](') &&
        fullMatch.endsWith(')')
      ) {
        const linkMatch = fullMatch.match(/\[(.*?)\]\((.*?)\)/);
        if (linkMatch) {
          const linkText = linkMatch[1];
          const url = linkMatch[2];
          styledPart =
            parseMarkdownToANSI(linkText, baseColor) +
            ansiColorize(' (', baseColor) +
            ansiColorize(url, theme.text.link) +
            ansiColorize(')', baseColor);
        }
      } else if (
        fullMatch.startsWith('<u>') &&
        fullMatch.endsWith('</u>') &&
        fullMatch.length >
          UNDERLINE_TAG_START_LENGTH + UNDERLINE_TAG_END_LENGTH - 1
      ) {
        styledPart = chalk.underline(
          parseMarkdownToANSI(
            fullMatch.slice(
              UNDERLINE_TAG_START_LENGTH,
              -UNDERLINE_TAG_END_LENGTH,
            ),
            baseColor,
          ),
        );
      } else if (fullMatch.match(/^https?:\/\//)) {
        const [cleanUrl, trailingPunc] = stripTrailingUrlPunctuation(fullMatch);
        styledPart = ansiColorize(cleanUrl, theme.text.link);
        if (trailingPunc) {
          styledPart += ansiColorize(trailingPunc, baseColor);
        }
      }
    } catch (e) {
      debugLogger.warn('Error parsing inline markdown part:', fullMatch, e);
      styledPart = '';
    }

    result += styledPart || ansiColorize(fullMatch, baseColor);
    lastIndex = inlineRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    result += ansiColorize(text.slice(lastIndex), baseColor);
  }

  return result;
};
