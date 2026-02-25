/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { debugLogger } from '@google/gemini-cli-core';
import { stripUnsafeCharacters } from './textUtils.js';

// Constants for Markdown parsing
const BOLD_MARKER_LENGTH = 2; // For "**"
const ITALIC_MARKER_LENGTH = 1; // For "*" or "_"
const STRIKETHROUGH_MARKER_LENGTH = 2; // For "~~")
const UNDERLINE_TAG_START_LENGTH = 3; // For "<u>"
const UNDERLINE_TAG_END_LENGTH = 4; // For "</u>"

// ── Shared parser ──────────────────────────────────────────────────────

/** A segment produced by {@link parseInlineMarkdown}. */
export type MarkdownSegment =
  | { type: 'text'; content: string }
  | { type: 'bold'; content: string }
  | { type: 'italic'; content: string }
  | { type: 'strikethrough'; content: string }
  | { type: 'code'; content: string }
  | { type: 'link'; text: string; url: string }
  | { type: 'underline'; content: string }
  | { type: 'url'; content: string };

// Code spans are handled by a dedicated scanner (see scanCodeSpan) rather
// than a regex alternation, because backtick-delimited spans can contain
// backticks of shorter run-length (e.g. ``a`b`` → code "a`b").
const INLINE_REGEX =
  /(\*\*.*?\*\*|\*.*?\*|_.*?_|~~.*?~~|\[.*?\]\(.*?\)|<u>.*?<\/u>|https?:\/\/\S+)/g;

/**
 * Scan for a CommonMark code span starting at position `pos` in `text`.
 *
 * Algorithm: count the opening backtick run length N, then scan forward
 * for a closing run of exactly N backticks that is not part of a longer
 * run.  Returns `{ content, end }` on success, or `null` if no matching
 * closing run is found.
 */
function scanCodeSpan(
  text: string,
  pos: number,
): { content: string; end: number } | null {
  // Count opening backtick run length.
  let openLen = 0;
  while (pos + openLen < text.length && text[pos + openLen] === '`') {
    openLen++;
  }
  if (openLen === 0) return null;

  // Scan for a closing run of exactly `openLen` backticks.
  let i = pos + openLen;
  while (i < text.length) {
    if (text[i] !== '`') {
      i++;
      continue;
    }
    // Count this backtick run.
    const runStart = i;
    while (i < text.length && text[i] === '`') {
      i++;
    }
    if (i - runStart === openLen) {
      const content = text.slice(pos + openLen, runStart);
      // CommonMark requires non-empty content for code spans.
      if (content.length > 0) {
        return { content, end: i };
      }
    }
    // Otherwise keep scanning — the run length didn't match.
  }
  return null;
}

/**
 * Parse inline markdown into typed segments.
 *
 * This is the single source of truth for inline markdown classification.
 * Both {@link RenderInline} (React nodes) and {@link stripInlineMarkdown}
 * (plain text) consume these segments.
 */
export function parseInlineMarkdown(text: string): MarkdownSegment[] {
  const segments: MarkdownSegment[] = [];
  let lastIndex = 0;

  // Create a fresh regex instance so concurrent calls don't share state.
  const regex = new RegExp(INLINE_REGEX.source, INLINE_REGEX.flags);

  // We interleave two scanners:
  //  1. A character-level scanner for code spans (backtick-delimited).
  //  2. The INLINE_REGEX for everything else.
  //
  // At each position we check for a backtick first (code spans have
  // highest priority in CommonMark).  If found, we emit the code segment
  // and advance past it.  Otherwise we let the regex find the next
  // non-code inline marker.

  while (lastIndex < text.length) {
    // Find the next backtick in the remaining text.
    const nextBacktick = text.indexOf('`', lastIndex);

    // Find the next regex match starting at or after lastIndex.
    regex.lastIndex = lastIndex;
    const regexMatch = regex.exec(text);

    // Determine which comes first: a backtick or a regex match.
    const backtickFirst =
      nextBacktick !== -1 &&
      (regexMatch === null || nextBacktick <= regexMatch.index);

    if (backtickFirst) {
      // Emit any text before the backtick.
      if (nextBacktick > lastIndex) {
        segments.push({
          type: 'text',
          content: text.slice(lastIndex, nextBacktick),
        });
      }

      const codeSpan = scanCodeSpan(text, nextBacktick);
      if (codeSpan) {
        segments.push({ type: 'code', content: codeSpan.content });
        lastIndex = codeSpan.end;
      } else {
        // No matching close — emit the backtick run as plain text and
        // advance past it so we don't loop forever.
        let runEnd = nextBacktick + 1;
        while (runEnd < text.length && text[runEnd] === '`') runEnd++;
        segments.push({
          type: 'text',
          content: text.slice(nextBacktick, runEnd),
        });
        lastIndex = runEnd;
      }
    } else if (regexMatch) {
      // Emit any text before the regex match.
      if (regexMatch.index > lastIndex) {
        segments.push({
          type: 'text',
          content: text.slice(lastIndex, regexMatch.index),
        });
      }

      const fullMatch = regexMatch[0];
      let segment: MarkdownSegment | null = null;

      // Bold: **text**
      if (
        fullMatch.startsWith('**') &&
        fullMatch.endsWith('**') &&
        fullMatch.length > BOLD_MARKER_LENGTH * 2
      ) {
        segment = {
          type: 'bold',
          content: fullMatch.slice(BOLD_MARKER_LENGTH, -BOLD_MARKER_LENGTH),
        };
      }
      // Italic: *text* or _text_ (with boundary checks)
      else if (
        fullMatch.length > ITALIC_MARKER_LENGTH * 2 &&
        ((fullMatch.startsWith('*') && fullMatch.endsWith('*')) ||
          (fullMatch.startsWith('_') && fullMatch.endsWith('_'))) &&
        !/\w/.test(text.substring(regexMatch.index - 1, regexMatch.index)) &&
        !/\w/.test(text.substring(regex.lastIndex, regex.lastIndex + 1)) &&
        !/\S[./\\]/.test(
          text.substring(regexMatch.index - 2, regexMatch.index),
        ) &&
        !/[./\\]\S/.test(text.substring(regex.lastIndex, regex.lastIndex + 2))
      ) {
        segment = {
          type: 'italic',
          content: fullMatch.slice(ITALIC_MARKER_LENGTH, -ITALIC_MARKER_LENGTH),
        };
      }
      // Strikethrough: ~~text~~
      else if (
        fullMatch.startsWith('~~') &&
        fullMatch.endsWith('~~') &&
        fullMatch.length > STRIKETHROUGH_MARKER_LENGTH * 2
      ) {
        segment = {
          type: 'strikethrough',
          content: fullMatch.slice(
            STRIKETHROUGH_MARKER_LENGTH,
            -STRIKETHROUGH_MARKER_LENGTH,
          ),
        };
      }
      // Link: [text](url)
      else if (
        fullMatch.startsWith('[') &&
        fullMatch.includes('](') &&
        fullMatch.endsWith(')')
      ) {
        const linkMatch = fullMatch.match(/\[(.*?)\]\((.*?)\)/);
        if (linkMatch) {
          segment = { type: 'link', text: linkMatch[1], url: linkMatch[2] };
        }
      }
      // Underline: <u>text</u>
      else if (
        fullMatch.startsWith('<u>') &&
        fullMatch.endsWith('</u>') &&
        fullMatch.length >
          UNDERLINE_TAG_START_LENGTH + UNDERLINE_TAG_END_LENGTH - 1
      ) {
        segment = {
          type: 'underline',
          content: fullMatch.slice(
            UNDERLINE_TAG_START_LENGTH,
            -UNDERLINE_TAG_END_LENGTH,
          ),
        };
      }
      // Bare URL: https://...
      else if (fullMatch.match(/^https?:\/\//)) {
        segment = { type: 'url', content: fullMatch };
      }

      // Fall back to plain text for unrecognized matches
      segments.push(segment ?? { type: 'text', content: fullMatch });
      lastIndex = regex.lastIndex;
    } else {
      // No more matches — emit the rest as text.
      segments.push({ type: 'text', content: text.slice(lastIndex) });
      lastIndex = text.length;
    }
  }

  return segments;
}

// ── React renderer ─────────────────────────────────────────────────────

interface RenderInlineProps {
  text: string;
  defaultColor?: string;
}

const RenderInlineInternal: React.FC<RenderInlineProps> = ({
  text: rawText,
  defaultColor,
}) => {
  const text = stripUnsafeCharacters(rawText);
  const baseColor = defaultColor ?? theme.text.primary;
  // Early return for plain text without markdown or URLs
  if (!/[*_~`<[https?:]/.test(text)) {
    return <Text color={baseColor}>{text}</Text>;
  }

  const segments = parseInlineMarkdown(text);

  const nodes: React.ReactNode[] = segments.map((segment, i) => {
    const key = `s-${i}`;
    try {
      switch (segment.type) {
        case 'bold':
          return (
            <Text key={key} bold color={baseColor}>
              {segment.content}
            </Text>
          );
        case 'italic':
          return (
            <Text key={key} italic color={baseColor}>
              {segment.content}
            </Text>
          );
        case 'strikethrough':
          return (
            <Text key={key} strikethrough color={baseColor}>
              {segment.content}
            </Text>
          );
        case 'code':
          return (
            <Text key={key} color={theme.text.accent}>
              {segment.content}
            </Text>
          );
        case 'link':
          return (
            <Text key={key} color={baseColor}>
              {segment.text}
              <Text color={theme.text.link}> ({segment.url})</Text>
            </Text>
          );
        case 'underline':
          return (
            <Text key={key} underline color={baseColor}>
              {segment.content}
            </Text>
          );
        case 'url':
          return (
            <Text key={key} color={theme.text.link}>
              {segment.content}
            </Text>
          );
        case 'text':
        default:
          return (
            <Text key={key} color={baseColor}>
              {segment.content}
            </Text>
          );
      }
    } catch (e) {
      debugLogger.warn('Error rendering inline markdown segment:', segment, e);
      return (
        <Text key={key} color={baseColor}>
          {'content' in segment ? segment.content : ''}
        </Text>
      );
    }
  });

  return <>{nodes}</>;
};

export const RenderInline = React.memo(RenderInlineInternal);

// ── Plain-text projection ──────────────────────────────────────────────

/**
 * Strip inline markdown markers and return the text as it would be
 * visually rendered by {@link RenderInline}.  Used by TableRenderer for
 * accurate width measurement.
 */
export function stripInlineMarkdown(text: string): string {
  return parseInlineMarkdown(text)
    .map((segment) => {
      switch (segment.type) {
        case 'link':
          return segment.text + ' (' + segment.url + ')';
        case 'text':
        case 'bold':
        case 'italic':
        case 'strikethrough':
        case 'code':
        case 'underline':
        case 'url':
          return segment.content;
        default:
          return '';
      }
    })
    .join('');
}
