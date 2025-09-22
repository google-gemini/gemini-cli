/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Text } from 'ink';
import { theme } from '../semantic-colors.js'; // Assuming this import path is correct
import stringWidth from 'string-width';

interface RenderInlineProps {
  text: string;
}

/**
 * Defines the shape of the named capture groups in our regex.
 */
interface MarkdownMatchGroups {
  bold?: string;
  italic?: string;
  strike?: string;
  inlineCode?: string;
  link?: string;
  underline?: string;
  bareUrl?: string;
}

/**
 * A regex that checks for characters that might start a markdown
 * sequence or a bare URL.
 *
 * - `[*_~`<\\[]`: Matches styling characters *, _, ~, `, < (for <u>), or [ (for links).
 * - `(https?|ftp|mailto):`: Matches common URL protocols.
 */
const POTENTIAL_MARKDOWN_REGEX = /[*_~`<\\[]|(https?|ftp|mailto):/;

/**
 * Checks if a string is just plain text, with no markdown or URLs.
 * This allows for a fast exit before attempting to parse.
 */
const isPlainText = (text: string): boolean =>
  !POTENTIAL_MARKDOWN_REGEX.test(text);

// Marker lengths for slicing
const BOLD_MARKER_LENGTH = 2; // For "**"
const ITALIC_MARKER_LENGTH = 1; // For "*" or "_"
const STRIKETHROUGH_MARKER_LENGTH = 2; // For "~~"
const UNDERLINE_TAG_START_LENGTH = 3; // For "<u>"
const UNDERLINE_TAG_END_LENGTH = 4; // For "</u>"

/**
 * The source of truth for all markdown rules.
 * It defines the key that matches MarkdownMatchGroups,
 * and the regex pattern for that key.
 *
 * The order of this array defines the parsing priority.
 */
const MARKDOWN_RULES: Array<{
  key: keyof MarkdownMatchGroups;
  pattern: string;
}> = [
  { key: 'bold', pattern: `(?<bold>\\*\\*.+?\\*\\*)` },
  { key: 'italic', pattern: `(?<italic>\\*.+?\\*|_.+?_)` },
  { key: 'strike', pattern: `(?<strike>~~.+?~~)` },
  { key: 'link', pattern: `(?<link>\\[.*?\\]\\((?:[^\\s()]|\\([^)]*\\))*\\))` },
  { key: 'inlineCode', pattern: `(?<inlineCode>\`+.+?\`+)` },
  { key: 'underline', pattern: `(?<underline><u>.*?<\\/u>)` },
  {
    key: 'bareUrl',
    pattern: `(?<bareUrl>(?:https?|ftp):\\/\\/\\S+|mailto:\\S+)`,
  },
];

/**
 * Generated regex token, built from the patterns in MARKDOWN_RULES.
 */
const MARKDOWN_TOKEN_REGEX = new RegExp(
  MARKDOWN_RULES.map((rule) => rule.pattern).join('|'),
  'g',
);

/**
 * Generated array of keys, built from the keys in MARKDOWN_RULES.
 * This guarantees the iteration order matches the regex priority.
 */
const HANDLER_KEYS_IN_ORDER = MARKDOWN_RULES.map((rule) => rule.key);

const extractSimpleContent = (match: string, start: number, end: number) =>
  match.slice(start, -end);

const extractCodeContent = (match: string) => {
  const codeMatch = match.match(/^(`+)(.+?)\1$/s);
  return codeMatch ? codeMatch[2] : match;
};

const extractLinkContent = (match: string) => {
  const linkMatch = match.match(/\[(.*?)\]\((.*)\)/);
  if (!linkMatch) {
    return { text: match, url: '', isSafe: false };
  }
  const url = linkMatch[2];
  const isSafe = /^(https|http|mailto):/i.test(url);
  return { text: linkMatch[1], url, isSafe };
};

/**
 * A handler that defines all logic for a markdown type.
 */
interface MarkdownHandler {
  render: (match: string, key: string) => React.ReactNode;
  strip: (match: string) => string;
}

/**
 * The map for all markdown operations.
 */
const MARKDOWN_HANDLERS: Record<keyof MarkdownMatchGroups, MarkdownHandler> = {
  bold: {
    render: (match, key) => (
      <Text key={key} bold>
        {extractSimpleContent(match, BOLD_MARKER_LENGTH, BOLD_MARKER_LENGTH)}
      </Text>
    ),
    strip: (match) =>
      extractSimpleContent(match, BOLD_MARKER_LENGTH, BOLD_MARKER_LENGTH),
  },
  italic: {
    render: (match, key) => (
      <Text key={key} italic>
        {extractSimpleContent(
          match,
          ITALIC_MARKER_LENGTH,
          ITALIC_MARKER_LENGTH,
        )}
      </Text>
    ),
    strip: (match) =>
      extractSimpleContent(match, ITALIC_MARKER_LENGTH, ITALIC_MARKER_LENGTH),
  },
  strike: {
    render: (match, key) => (
      <Text key={key} strikethrough>
        {extractSimpleContent(
          match,
          STRIKETHROUGH_MARKER_LENGTH,
          STRIKETHROUGH_MARKER_LENGTH,
        )}
      </Text>
    ),
    strip: (match) =>
      extractSimpleContent(
        match,
        STRIKETHROUGH_MARKER_LENGTH,
        STRIKETHROUGH_MARKER_LENGTH,
      ),
  },
  inlineCode: {
    render: (match, key) => (
      <Text key={key} color={theme.text.accent}>
        {extractCodeContent(match)}
      </Text>
    ),
    strip: (match) => extractCodeContent(match),
  },
  link: {
    render: (match, key) => {
      const { text, url, isSafe } = extractLinkContent(match);
      const linkComponent = <Text color={theme.text.link}> ({url})</Text>;
      return (
        <Text key={key}>
          {text}
          {isSafe ? linkComponent : ` (${url})`}
        </Text>
      );
    },
    strip: (match) => extractLinkContent(match).text,
  },
  underline: {
    render: (match, key) => (
      <Text key={key} underline>
        {extractSimpleContent(
          match,
          UNDERLINE_TAG_START_LENGTH,
          UNDERLINE_TAG_END_LENGTH,
        )}
      </Text>
    ),
    strip: (match) =>
      extractSimpleContent(
        match,
        UNDERLINE_TAG_START_LENGTH,
        UNDERLINE_TAG_END_LENGTH,
      ),
  },
  bareUrl: {
    render: (match, key) => (
      <Text key={key}>
        {match}
        <Text color={theme.text.link}> ({match})</Text>
      </Text>
    ),
    strip: (match) => match,
  },
};

const getRenderedNodeForMatch = (
  match: RegExpMatchArray,
  key: string,
): React.ReactNode => {
  const groups = match.groups as MarkdownMatchGroups | undefined;
  if (groups) {
    for (const handlerKey of HANDLER_KEYS_IN_ORDER) {
      const matchText = groups[handlerKey];
      if (matchText) {
        return MARKDOWN_HANDLERS[handlerKey].render(matchText, key);
      }
    }
  }
  return <Text key={key}>{match[0]}</Text>;
};

/**
 * A helper to add the plain text between matches (or at the end).
 */
const addPrecedingPlainTextNode = (
  nodes: React.ReactNode[],
  text: string,
  from: number,
  to: number,
) => {
  if (to > from) {
    const plainText = text.slice(from, to);
    nodes.push(<Text key={`t-${from}`}>{plainText}</Text>);
  }
};

/**
 * Utility function to get the plain text length of a string with markdown formatting.
 */
export const getPlainTextLength = (text: string): number => {
  const cleanText = text.replace(MARKDOWN_TOKEN_REGEX, (match, ...args) => {
    const groups = args[args.length - 1] as MarkdownMatchGroups;
    for (const key of HANDLER_KEYS_IN_ORDER) {
      const matchText = groups[key];
      if (matchText) {
        return MARKDOWN_HANDLERS[key].strip(matchText);
      }
    }
    return match;
  });
  return stringWidth(cleanText);
};

const RenderInlineInternal: React.FC<RenderInlineProps> = ({ text }) => {
  if (isPlainText(text)) {
    return <Text color={theme.text.primary}>{text}</Text>;
  }

  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(MARKDOWN_TOKEN_REGEX)) {
    const matchIndex = match.index!;

    // Add any plain text before this match
    addPrecedingPlainTextNode(nodes, text, lastIndex, matchIndex);

    // Get the rendered node for the match itself
    const key = `m-${matchIndex}`;
    const renderedNode = getRenderedNodeForMatch(match, key);
    nodes.push(renderedNode);

    // Update position
    lastIndex = matchIndex + match[0].length;
  }

  // Add any final plain text after the last match
  addPrecedingPlainTextNode(nodes, text, lastIndex, text.length);

  return <>{nodes}</>;
};

export const RenderInline = React.memo(RenderInlineInternal);
