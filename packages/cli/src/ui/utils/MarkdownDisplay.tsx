/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Text, Box } from 'ink';
import { Colors } from '../colors.js';
import { colorizeCode } from './CodeColorizer.js';

interface MarkdownDisplayProps {
  text: string;
  isPending: boolean;
  availableTerminalHeight?: number;
  terminalWidth: number;
}

// Constants for Markdown parsing and rendering
const BOLD_MARKER_LENGTH = 2; // For "**"
const ITALIC_MARKER_LENGTH = 1; // For "*" or "_"
const STRIKETHROUGH_MARKER_LENGTH = 2; // For "~~"
const INLINE_CODE_MARKER_LENGTH = 1; // For "`"
const UNDERLINE_TAG_START_LENGTH = 3; // For "<u>"
const UNDERLINE_TAG_END_LENGTH = 4; // For "</u>"

const EMPTY_LINE_HEIGHT = 1;
const CODE_BLOCK_PADDING = 1;
const LIST_ITEM_PREFIX_PADDING = 1;
const LIST_ITEM_TEXT_FLEX_GROW = 1;

const MarkdownDisplayInternal: React.FC<MarkdownDisplayProps> = ({
  text,
  isPending,
  availableTerminalHeight,
  terminalWidth,
}) => {
  if (!text) return <></>;

  const lines = text.split('\n');
  const headerRegex = /^ *(#{1,4}) +(.*)/;
  const codeFenceRegex = /^ *(`{3,}|~{3,}) *(\w*?) *$/;
  const ulItemRegex = /^([ \t]*)([-*+]) +(.*)/;
  const olItemRegex = /^([ \t]*)(\d+)\. +(.*)/;
  const hrRegex = /^ *([-*_] *){3,} *$/;

  const contentBlocks: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeBlockContent: string[] = [];
  let codeBlockLang: string | null = null;
  let codeBlockFence = '';

  lines.forEach((line, index) => {
    const key = `line-${index}`;

    if (inCodeBlock) {
      const fenceMatch = line.match(codeFenceRegex);
      if (
        fenceMatch &&
        fenceMatch[1].startsWith(codeBlockFence[0]) &&
        fenceMatch[1].length >= codeBlockFence.length
      ) {
        contentBlocks.push(
          <RenderCodeBlock
            key={key}
            content={codeBlockContent}
            lang={codeBlockLang}
            isPending={isPending}
            availableTerminalHeight={availableTerminalHeight}
            terminalWidth={terminalWidth}
          />,
        );
        inCodeBlock = false;
        codeBlockContent = [];
        codeBlockLang = null;
        codeBlockFence = '';
      } else {
        codeBlockContent.push(line);
      }
      return;
    }

    const codeFenceMatch = line.match(codeFenceRegex);
    const headerMatch = line.match(headerRegex);
    const ulMatch = line.match(ulItemRegex);
    const olMatch = line.match(olItemRegex);
    const hrMatch = line.match(hrRegex);

    if (codeFenceMatch) {
      inCodeBlock = true;
      codeBlockFence = codeFenceMatch[1];
      codeBlockLang = codeFenceMatch[2] || null;
    } else if (hrMatch) {
      contentBlocks.push(
        <Box key={key}>
          <Text dimColor>---</Text>
        </Box>,
      );
    } else if (headerMatch) {
      const level = headerMatch[1].length;
      const headerText = headerMatch[2];
      let headerNode: React.ReactNode = null;
      switch (level) {
        case 1:
          headerNode = (
            <Text bold color={Colors.AccentCyan}>
              <RenderInline text={headerText} />
            </Text>
          );
          break;
        case 2:
          headerNode = (
            <Text bold color={Colors.AccentBlue}>
              <RenderInline text={headerText} />
            </Text>
          );
          break;
        case 3:
          headerNode = (
            <Text bold>
              <RenderInline text={headerText} />
            </Text>
          );
          break;
        case 4:
          headerNode = (
            <Text italic color={Colors.Gray}>
              <RenderInline text={headerText} />
            </Text>
          );
          break;
        default:
          headerNode = (
            <Text>
              <RenderInline text={headerText} />
            </Text>
          );
          break;
      }
      if (headerNode) contentBlocks.push(<Box key={key}>{headerNode}</Box>);
    } else if (ulMatch) {
      const leadingWhitespace = ulMatch[1];
      const marker = ulMatch[2];
      const itemText = ulMatch[3];
      contentBlocks.push(
        <RenderListItem
          key={key}
          itemText={itemText}
          type="ul"
          marker={marker}
          leadingWhitespace={leadingWhitespace}
        />,
      );
    } else if (olMatch) {
      const leadingWhitespace = olMatch[1];
      const marker = olMatch[2];
      const itemText = olMatch[3];
      contentBlocks.push(
        <RenderListItem
          key={key}
          itemText={itemText}
          type="ol"
          marker={marker}
          leadingWhitespace={leadingWhitespace}
        />,
      );
    } else {
      if (line.trim().length === 0) {
        if (contentBlocks.length > 0 && !inCodeBlock) {
          contentBlocks.push(<Box key={key} height={EMPTY_LINE_HEIGHT} />);
        }
      } else {
        contentBlocks.push(
          <Box key={key}>
            <Text wrap="wrap">
              <RenderInline text={line} />
            </Text>
          </Box>,
        );
      }
    }
  });

  if (inCodeBlock) {
    contentBlocks.push(
      <RenderCodeBlock
        key="line-eof"
        content={codeBlockContent}
        lang={codeBlockLang}
        isPending={isPending}
        availableTerminalHeight={availableTerminalHeight}
        terminalWidth={terminalWidth}
      />,
    );
  }

  return <>{contentBlocks}</>;
};

// Helper functions (adapted from static methods of MarkdownRenderer)

interface RenderInlineProps {
  text: string;
}

const RenderInlineInternal: React.FC<RenderInlineProps> = ({ text }) => {
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  const inlineRegex =
    /(\*\*.*?\*\*|\*.*?\*|_.*?_|~~.*?~~|\[.*?\]\(.*?\)|`+.+?`+|<u>.*?<\/u>)/g;
  let match;

  while ((match = inlineRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(
        <Text key={`t-${lastIndex}`}>
          {text.slice(lastIndex, match.index)}
        </Text>,
      );
    }

    const fullMatch = match[0];
    let renderedNode: React.ReactNode = null;
    const key = `m-${match.index}`;

    try {
      if (
        fullMatch.startsWith('**') &&
        fullMatch.endsWith('**') &&
        fullMatch.length > BOLD_MARKER_LENGTH * 2
      ) {
        renderedNode = (
          <Text key={key} bold>
            {fullMatch.slice(BOLD_MARKER_LENGTH, -BOLD_MARKER_LENGTH)}
          </Text>
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
        renderedNode = (
          <Text key={key} italic>
            {fullMatch.slice(ITALIC_MARKER_LENGTH, -ITALIC_MARKER_LENGTH)}
          </Text>
        );
      } else if (
        fullMatch.startsWith('~~') &&
        fullMatch.endsWith('~~') &&
        fullMatch.length > STRIKETHROUGH_MARKER_LENGTH * 2
      ) {
        renderedNode = (
          <Text key={key} strikethrough>
            {fullMatch.slice(
              STRIKETHROUGH_MARKER_LENGTH,
              -STRIKETHROUGH_MARKER_LENGTH,
            )}
          </Text>
        );
      } else if (
        fullMatch.startsWith('`') &&
        fullMatch.endsWith('`') &&
        fullMatch.length > INLINE_CODE_MARKER_LENGTH
      ) {
        const codeMatch = fullMatch.match(/^(`+)(.+?)\1$/s);
        if (codeMatch && codeMatch[2]) {
          renderedNode = (
            <Text key={key} color={Colors.AccentPurple}>
              {codeMatch[2]}
            </Text>
          );
        } else {
          renderedNode = (
            <Text key={key} color={Colors.AccentPurple}>
              {fullMatch.slice(
                INLINE_CODE_MARKER_LENGTH,
                -INLINE_CODE_MARKER_LENGTH,
              )}
            </Text>
          );
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
          renderedNode = (
            <Text key={key}>
              {linkText}
              <Text color={Colors.AccentBlue}> ({url})</Text>
            </Text>
          );
        }
      } else if (
        fullMatch.startsWith('<u>') &&
        fullMatch.endsWith('</u>') &&
        fullMatch.length >
          UNDERLINE_TAG_START_LENGTH + UNDERLINE_TAG_END_LENGTH - 1 // -1 because length is compared to combined length of start and end tags
      ) {
        renderedNode = (
          <Text key={key} underline>
            {fullMatch.slice(
              UNDERLINE_TAG_START_LENGTH,
              -UNDERLINE_TAG_END_LENGTH,
            )}
          </Text>
        );
      }
    } catch (e) {
      console.error('Error parsing inline markdown part:', fullMatch, e);
      renderedNode = null;
    }

    nodes.push(renderedNode ?? <Text key={key}>{fullMatch}</Text>);
    lastIndex = inlineRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(<Text key={`t-${lastIndex}`}>{text.slice(lastIndex)}</Text>);
  }

  return <>{nodes.filter((node) => node !== null)}</>;
};

const RenderInline = React.memo(RenderInlineInternal);

interface RenderCodeBlockProps {
  content: string[];
  lang: string | null;
  isPending: boolean;
  availableTerminalHeight?: number;
  terminalWidth: number;
}

const RenderCodeBlockInternal: React.FC<RenderCodeBlockProps> = ({
  content,
  lang,
  isPending,
  availableTerminalHeight,
  terminalWidth,
}) => {
  const MIN_LINES_FOR_MESSAGE = 1; // Minimum lines to show before the "generating more" message
  const RESERVED_LINES = 2; // Lines reserved for the message itself and potential padding

  if (isPending && availableTerminalHeight !== undefined) {
    const MAX_CODE_LINES_WHEN_PENDING = Math.max(
      0,
      availableTerminalHeight - CODE_BLOCK_PADDING * 2 - RESERVED_LINES,
    );

    if (content.length > MAX_CODE_LINES_WHEN_PENDING) {
      if (MAX_CODE_LINES_WHEN_PENDING < MIN_LINES_FOR_MESSAGE) {
        // Not enough space to even show the message meaningfully
        return (
          <Box padding={CODE_BLOCK_PADDING}>
            <Text color={Colors.Gray}>... code is being written ...</Text>
          </Box>
        );
      }
      const truncatedContent = content.slice(0, MAX_CODE_LINES_WHEN_PENDING);
      const colorizedTruncatedCode = colorizeCode(
        truncatedContent.join('\n'),
        lang,
        availableTerminalHeight,
        terminalWidth - CODE_BLOCK_PADDING * 2,
      );
      return (
        <Box flexDirection="column" padding={CODE_BLOCK_PADDING}>
          {colorizedTruncatedCode}
          <Text color={Colors.Gray}>... generating more ...</Text>
        </Box>
      );
    }
  }

  const fullContent = content.join('\n');
  const colorizedCode = colorizeCode(
    fullContent,
    lang,
    availableTerminalHeight,
    terminalWidth - CODE_BLOCK_PADDING * 2,
  );

  return (
    <Box
      flexDirection="column"
      padding={CODE_BLOCK_PADDING}
      width={terminalWidth}
      flexShrink={0}
    >
      {colorizedCode}
    </Box>
  );
};

const RenderCodeBlock = React.memo(RenderCodeBlockInternal);

interface RenderListItemProps {
  itemText: string;
  type: 'ul' | 'ol';
  marker: string;
  leadingWhitespace?: string;
}

const RenderListItemInternal: React.FC<RenderListItemProps> = ({
  itemText,
  type,
  marker,
  leadingWhitespace = '',
}) => {
  const prefix = type === 'ol' ? `${marker}. ` : `${marker} `;
  const prefixWidth = prefix.length;
  const indentation = leadingWhitespace.length;

  return (
    <Box
      paddingLeft={indentation + LIST_ITEM_PREFIX_PADDING}
      flexDirection="row"
    >
      <Box width={prefixWidth}>
        <Text>{prefix}</Text>
      </Box>
      <Box flexGrow={LIST_ITEM_TEXT_FLEX_GROW}>
        <Text wrap="wrap">
          <RenderInline text={itemText} />
        </Text>
      </Box>
    </Box>
  );
};

const RenderListItem = React.memo(RenderListItemInternal);

export const MarkdownDisplay = React.memo(MarkdownDisplayInternal);
