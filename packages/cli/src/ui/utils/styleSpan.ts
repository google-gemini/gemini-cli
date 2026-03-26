/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  toStyledCharacters,
  styledCharsToString as inkStyledCharsToString,
} from 'ink';
import type { StyledChar } from 'ink';
import { getCachedStringWidth } from './textUtils.js';

/**
 * Style Span: A run-length encoded representation of styled text.
 * Instead of creating one object per character, we group consecutive
 * characters with identical styling into a single span.
 */
export interface StyleSpan {
  /** The text content of this span (may contain multiple characters) */
  text: string;
  /** The ANSI styling codes for this span */
  styles: StyledChar['styles'];
}

/**
 * Compares two style arrays for equality.
 * Handles the case where styles might be undefined or empty arrays.
 */
function stylesEqual(
  styles1: StyledChar['styles'],
  styles2: StyledChar['styles'],
): boolean {
  const s1 = styles1 || [];
  const s2 = styles2 || [];

  if (s1.length !== s2.length) {
    return false;
  }

  // Compare each style element
  for (let i = 0; i < s1.length; i++) {
    if (s1[i] !== s2[i]) {
      return false;
    }
  }

  return true;
}

/**
 * Converts ANSI-styled text to an array of StyleSpans using run-length encoding.
 * This replaces ink's toStyledCharacters and reduces memory usage dramatically.
 *
 * @param ansiText - Text with ANSI escape codes
 * @returns Array of StyleSpans instead of individual StyledChars
 */
export function ansiToStyleSpans(ansiText: string): StyleSpan[] {
  // Use ink's parser to get styled characters
  const styledChars = toStyledCharacters(ansiText);

  // Group consecutive characters with the same styles into spans
  if (styledChars.length === 0) {
    return [];
  }

  const spans: StyleSpan[] = [];
  let currentSpan: StyleSpan = {
    text: styledChars[0].value,
    styles: styledChars[0].styles || [],
  };

  for (let i = 1; i < styledChars.length; i++) {
    const char = styledChars[i];
    const charStyles = char.styles || [];

    if (stylesEqual(currentSpan.styles, charStyles)) {
      // Extend current span
      currentSpan.text += char.value;
    } else {
      // Styles differ, start new span
      spans.push(currentSpan);
      currentSpan = {
        text: char.value,
        styles: charStyles,
      };
    }
  }

  spans.push(currentSpan);
  return spans;
}

/**
 * Calculates the display width of style spans.
 * Accounts for emoji (2-char wide), combining marks, etc.
 *
 * @param spans - Array of StyleSpans
 * @returns The display width in columns
 */
export function styleSpansWidth(spans: StyleSpan[]): number {
  let totalWidth = 0;
  for (const span of spans) {
    totalWidth += getCachedStringWidth(span.text);
  }
  return totalWidth;
}

/**
 * Breaks style spans into words for word-wrapping logic.
 * Returns an array of word arrays (each word is an array of spans).
 *
 * @param spans - Array of StyleSpans
 * @returns Array of words (each word is an array of spans)
 */
export function breakStyleSpansIntoWords(spans: StyleSpan[]): StyleSpan[][] {
  const words: StyleSpan[][] = [];
  let currentWord: StyleSpan[] = [];

  for (const span of spans) {
    // Split span text by whitespace while preserving styles
    const parts = spanToWordParts(span);

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];

      if (part.isWhitespace) {
        // Whitespace ends current word
        if (currentWord.length > 0) {
          words.push(currentWord);
          currentWord = [];
        }
        // Add whitespace as its own "word" for alignment
        words.push([part.span]);
      } else {
        // Regular text, add to current word
        currentWord.push(part.span);
      }
    }
  }

  if (currentWord.length > 0) {
    words.push(currentWord);
  }

  return words;
}

interface WordPart {
  span: StyleSpan;
  isWhitespace: boolean;
}

/**
 * Splits a single StyleSpan by whitespace, preserving the style for each part.
 */
function spanToWordParts(span: StyleSpan): WordPart[] {
  const parts: WordPart[] = [];
  const regex = /(\s+)/;
  const textParts = span.text.split(regex);

  for (const part of textParts) {
    if (part.length === 0) continue;

    const isWhitespace = /^\s+$/.test(part);
    parts.push({
      span: {
        text: part,
        styles: span.styles,
      },
      isWhitespace,
    });
  }

  return parts;
}

/**
 * Finds the widest line in an array of style span arrays.
 * Used for calculating column widths in tables.
 *
 * @param lines - Array of lines, each line is an array of StyleSpans
 * @returns The width of the widest line
 */
export function widestLineFromStyleSpans(lines: StyleSpan[][]): number {
  let maxWidth = 0;
  for (const line of lines) {
    const width = styleSpansWidth(line);
    maxWidth = Math.max(maxWidth, width);
  }
  return maxWidth;
}

/**
 * Wraps style spans to a maximum width, breaking into multiple lines.
 * Returns an array of lines, where each line is an array of StyleSpans.
 *
 * @param spans - Array of StyleSpans to wrap
 * @param maxWidth - Maximum width per line
 * @returns Array of wrapped lines, each containing StyleSpans
 */
export function wrapStyleSpans(
  spans: StyleSpan[],
  maxWidth: number,
): StyleSpan[][] {
  if (maxWidth <= 0 || spans.length === 0) {
    return [spans];
  }

  const lines: StyleSpan[][] = [];
  let currentLine: StyleSpan[] = [];
  let currentLineWidth = 0;

  const words = breakStyleSpansIntoWords(spans);

  for (const word of words) {
    const wordWidth = styleSpansWidth(word);

    // Check if word is whitespace-only
    const isWhitespaceWord = word.length === 1 && /^\s+$/.test(word[0].text);

    if (isWhitespaceWord && currentLineWidth === 0) {
      // Skip leading whitespace
      continue;
    }

    if (currentLineWidth > 0 && currentLineWidth + wordWidth > maxWidth) {
      // Word doesn't fit, start new line
      if (currentLineWidth > 0) {
        lines.push(currentLine);
        currentLine = [];
        currentLineWidth = 0;
      }
    }

    // Add word to current line
    currentLine.push(...word);
    currentLineWidth += wordWidth;

    // Trim trailing whitespace at line breaks
    if (currentLineWidth > maxWidth && !isWhitespaceWord) {
      // If we've exceeded, this is a long word that doesn't fit
      if (currentLine.length > word.length) {
        // Remove this word and start new line
        currentLine.splice(currentLine.length - word.length);
        lines.push(currentLine);
        currentLine = [...word];
        currentLineWidth = wordWidth;
      }
    }
  }

  // Trim trailing whitespace from last line
  while (currentLine.length > 0) {
    const lastSpan = currentLine[currentLine.length - 1];
    if (/^\s+$/.test(lastSpan.text)) {
      currentLine.pop();
    } else {
      break;
    }
  }

  if (currentLine.length > 0) {
    lines.push(currentLine);
  }

  return lines.length > 0 ? lines : [[]];
}

/**
 * Converts style spans back to a plain string (without ANSI codes).
 * Used when we just need the text content.
 *
 * @param spans - Array of StyleSpans
 * @returns Plain text string
 */
export function styleSpansToString(spans: StyleSpan[]): string {
  return spans.map((span) => span.text).join('');
}

/**
 * Converts style spans to a string with ANSI codes for terminal display.
 * This reconstructs the ANSI escape sequences from the style information.
 *
 * @param spans - Array of StyleSpans
 * @returns String with ANSI codes
 */
export function styleSpansToANSIString(spans: StyleSpan[]): string {
  // Convert spans back to StyledChars and use ink's function
  const styledChars: StyledChar[] = [];

  for (const span of spans) {
    for (const char of span.text) {
      styledChars.push({
        value: char,
        styles: span.styles,
      });
    }
  }

  return inkStyledCharsToString(styledChars);
}
