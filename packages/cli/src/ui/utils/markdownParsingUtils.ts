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
import {
  wrapHyperlink,
  looksLikeFilePath,
  extractFilePath,
  resolveFileUri,
  PLAIN_TEXT_FILE_PATH_REGEX,
} from './hyperlinkUtils.js';

// Constants for Markdown parsing
const BOLD_MARKER_LENGTH = 2; // For "**"
const ITALIC_MARKER_LENGTH = 1; // For "*" or "_"
const STRIKETHROUGH_MARKER_LENGTH = 2; // For "~~")
const INLINE_CODE_MARKER_LENGTH = 1; // For "`"
const UNDERLINE_TAG_START_LENGTH = 3; // For "<u>"
const UNDERLINE_TAG_END_LENGTH = 4; // For "</u>"

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
 * Helper to colorize plain text, optionally detecting and hyperlinking file paths.
 */
const colorizeWithFileLinks = (
  text: string,
  color: string | undefined,
  enableHyperlinks: boolean,
): string => {
  if (!enableHyperlinks || !text) {
    return ansiColorize(text, color);
  }

  // Reset the regex state for each call
  const regex = new RegExp(
    PLAIN_TEXT_FILE_PATH_REGEX.source,
    PLAIN_TEXT_FILE_PATH_REGEX.flags,
  );
  let result = '';
  let lastIdx = 0;
  let m;

  while ((m = regex.exec(text)) !== null) {
    // Skip if this looks like part of a URL (preceded by ://)
    const precedingText = text.slice(Math.max(0, m.index - 3), m.index);
    if (precedingText.includes('://')) {
      continue;
    }

    if (m.index > lastIdx) {
      result += ansiColorize(text.slice(lastIdx, m.index), color);
    }

    const filePath = m[1];
    const fullMatch = m[0];
    const uri = resolveFileUri(filePath);
    result += wrapHyperlink(ansiColorize(fullMatch, color), uri);

    lastIdx = regex.lastIndex;
  }

  if (lastIdx === 0) return ansiColorize(text, color);

  if (lastIdx < text.length) {
    result += ansiColorize(text.slice(lastIdx), color);
  }

  return result;
};

export interface ParseMarkdownOptions {
  enableHyperlinks?: boolean;
}

/**
 * Converts markdown text into a string with ANSI escape codes.
 * This mirrors the parsing logic in InlineMarkdownRenderer.tsx
 */
export const parseMarkdownToANSI = (
  text: string,
  defaultColor?: string,
  options?: ParseMarkdownOptions,
): string => {
  const enableHyperlinks = options?.enableHyperlinks ?? false;
  const baseColor = defaultColor ?? theme.text.primary;
  // Early return for plain text without markdown or URLs
  if (!/[*_~`<[https?:]/.test(text)) {
    return colorizeWithFileLinks(text, baseColor, enableHyperlinks);
  }

  let result = '';
  const inlineRegex =
    /(\*\*\*.*?\*\*\*|\*\*.*?\*\*|\*.*?\*|_.*?_|~~.*?~~|\[.*?\]\(.*?\)|`+.+?`+|<u>.*?<\/u>|https?:\/\/\S+)/g;
  let lastIndex = 0;
  let match;

  while ((match = inlineRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      result += colorizeWithFileLinks(
        text.slice(lastIndex, match.index),
        baseColor,
        enableHyperlinks,
      );
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
              options,
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
            options,
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
            options,
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
            options,
          ),
        );
      } else if (
        fullMatch.startsWith('`') &&
        fullMatch.endsWith('`') &&
        fullMatch.length > INLINE_CODE_MARKER_LENGTH
      ) {
        const codeMatch = fullMatch.match(/^(`+)(.+?)\1$/s);
        if (codeMatch && codeMatch[2]) {
          const codeContent = codeMatch[2];
          const styled = ansiColorize(codeContent, theme.text.accent);
          if (enableHyperlinks && looksLikeFilePath(codeContent)) {
            const pathPart = extractFilePath(codeContent);
            styledPart = wrapHyperlink(styled, resolveFileUri(pathPart));
          } else {
            styledPart = styled;
          }
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
          const linkOutput =
            parseMarkdownToANSI(linkText, baseColor, options) +
            ansiColorize(' (', baseColor) +
            ansiColorize(url, theme.text.link) +
            ansiColorize(')', baseColor);
          if (enableHyperlinks && /^https?:\/\//.test(url)) {
            styledPart = wrapHyperlink(linkOutput, url);
          } else {
            styledPart = linkOutput;
          }
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
            options,
          ),
        );
      } else if (fullMatch.match(/^https?:\/\//)) {
        const colored = ansiColorize(fullMatch, theme.text.link);
        styledPart = enableHyperlinks
          ? wrapHyperlink(colored, fullMatch)
          : colored;
      }
    } catch (e) {
      debugLogger.warn('Error parsing inline markdown part:', fullMatch, e);
      styledPart = '';
    }

    result += styledPart || ansiColorize(fullMatch, baseColor);
    lastIndex = inlineRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    result += colorizeWithFileLinks(
      text.slice(lastIndex),
      baseColor,
      enableHyperlinks,
    );
  }

  return result;
};
