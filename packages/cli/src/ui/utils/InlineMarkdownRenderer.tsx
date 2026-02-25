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
const INLINE_CODE_MARKER_LENGTH = 1; // For "`"
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

const INLINE_REGEX =
  /(\*\*.*?\*\*|\*.*?\*|_.*?_|~~.*?~~|\[.*?\]\(.*?\)|`+.+?`+|<u>.*?<\/u>|https?:\/\/\S+)/g;

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
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({
        type: 'text',
        content: text.slice(lastIndex, match.index),
      });
    }

    const fullMatch = match[0];
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
      !/\w/.test(text.substring(match.index - 1, match.index)) &&
      !/\w/.test(text.substring(regex.lastIndex, regex.lastIndex + 1)) &&
      !/\S[./\\]/.test(text.substring(match.index - 2, match.index)) &&
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
    // Inline code: `text` or ``text``
    else if (
      fullMatch.startsWith('`') &&
      fullMatch.endsWith('`') &&
      fullMatch.length > INLINE_CODE_MARKER_LENGTH
    ) {
      const codeMatch = fullMatch.match(/^(`+)(.+?)\1$/s);
      if (codeMatch && codeMatch[2]) {
        segment = { type: 'code', content: codeMatch[2] };
      }
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
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', content: text.slice(lastIndex) });
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
