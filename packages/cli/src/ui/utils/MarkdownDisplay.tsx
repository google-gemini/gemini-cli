/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Text, Box } from 'ink';
import { EOL } from 'os';
import { Colors } from '../colors.js';
import { colorizeCode } from './CodeColorizer.js';
import { TableRenderer } from './TableRenderer.js';
import { RenderInline } from './InlineMarkdownRenderer.js';
import { useSettings } from '../contexts/SettingsContext.js';

interface MarkdownDisplayProps {
  text: string;
  isPending: boolean;
  availableTerminalHeight?: number;
  terminalWidth: number;
}

// Constants for Markdown parsing and rendering

const EMPTY_LINE_HEIGHT = 1;
const CODE_BLOCK_PREFIX_PADDING = 1;
const LIST_ITEM_PREFIX_PADDING = 1;
const LIST_ITEM_TEXT_FLEX_GROW = 1;

const MarkdownDisplayInternal: React.FC<MarkdownDisplayProps> = ({
  text,
  isPending,
  availableTerminalHeight,
  terminalWidth,
}) => {
  if (!text) return <></>;

  const lines = text.split(EOL);
  const headerRegex = /^ *(#{1,4}) +(.*)/;
  const codeFenceRegex = /^ *(`{3,}|~{3,}) *(\w*?) *$/;
  const ulItemRegex = /^([ \t]*)([-*+]) +(.*)/;
  const olItemRegex = /^([ \t]*)(\d+)\. +(.*)/;
  const hrRegex = /^ *([-*_] *){3,} *$/;
  const tableRowRegex = /^\s*\|(.+)\|\s*$/;
  const tableSeparatorRegex = /^\s*\|?\s*(:?-+:?)\s*(\|\s*(:?-+:?)\s*)+\|?\s*$/;

  const contentBlocks: React.ReactNode[] = [];
  let inCodeBlock = false;
  let lastLineEmpty = true;
  let codeBlockContent: string[] = [];
  let codeBlockLang: string | null = null;
  let codeBlockFence = '';
  let inTable = false;
  let tableRows: string[][] = [];
  let tableHeaders: string[] = [];

  function addContentBlock(block: React.ReactNode) {
    if (block) {
      contentBlocks.push(block);
      lastLineEmpty = false;
    }
  }

  lines.forEach((line, index) => {
    const key = `line-${index}`;

    if (inCodeBlock) {
      const fenceMatch = line.match(codeFenceRegex);
      if (
        fenceMatch &&
        fenceMatch[1].startsWith(codeBlockFence[0]) &&
        fenceMatch[1].length >= codeBlockFence.length
      ) {
        addContentBlock(
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
    const tableRowMatch = line.match(tableRowRegex);
    const tableSeparatorMatch = line.match(tableSeparatorRegex);

    if (codeFenceMatch) {
      inCodeBlock = true;
      codeBlockFence = codeFenceMatch[1];
      codeBlockLang = codeFenceMatch[2] || null;
    } else if (tableRowMatch && !inTable) {
      // Potential table start - check if next line is separator
      if (
        index + 1 < lines.length &&
        lines[index + 1].match(tableSeparatorRegex)
      ) {
        inTable = true;
        tableHeaders = tableRowMatch[1].split('|').map((cell) => cell.trim());
        tableRows = [];
      } else {
        // Not a table, treat as regular text
        addContentBlock(
          <Box key={key}>
            <Text wrap="wrap">
              <RenderInline text={line} />
            </Text>
          </Box>,
        );
      }
    } else if (inTable && tableSeparatorMatch) {
      // Skip separator line - already handled
    } else if (inTable && tableRowMatch) {
      // Add table row
      const cells = tableRowMatch[1].split('|').map((cell) => cell.trim());
      // Ensure row has same column count as headers
      while (cells.length < tableHeaders.length) {
        cells.push('');
      }
      if (cells.length > tableHeaders.length) {
        cells.length = tableHeaders.length;
      }
      tableRows.push(cells);
    } else if (inTable && !tableRowMatch) {
      // End of table
      if (tableHeaders.length > 0 && tableRows.length > 0) {
        addContentBlock(
          <RenderTable
            key={`table-${contentBlocks.length}`}
            headers={tableHeaders}
            rows={tableRows}
            terminalWidth={terminalWidth}
          />,
        );
      }
      inTable = false;
      tableRows = [];
      tableHeaders = [];

      // Process current line as normal
      if (line.trim().length > 0) {
        addContentBlock(
          <Box key={key}>
            <Text wrap="wrap">
              <RenderInline text={line} />
            </Text>
          </Box>,
        );
      }
    } else if (hrMatch) {
      addContentBlock(
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
      if (headerNode) addContentBlock(<Box key={key}>{headerNode}</Box>);
    } else if (ulMatch) {
      const leadingWhitespace = ulMatch[1];
      const marker = ulMatch[2];
      const itemText = ulMatch[3];
      addContentBlock(
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
      addContentBlock(
        <RenderListItem
          key={key}
          itemText={itemText}
          type="ol"
          marker={marker}
          leadingWhitespace={leadingWhitespace}
        />,
      );
    } else {
      if (line.trim().length === 0 && !inCodeBlock) {
        if (!lastLineEmpty) {
          contentBlocks.push(
            <Box key={`spacer-${index}`} height={EMPTY_LINE_HEIGHT} />,
          );
          lastLineEmpty = true;
        }
      } else {
        addContentBlock(
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
    addContentBlock(
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

  // Handle table at end of content
  if (inTable && tableHeaders.length > 0 && tableRows.length > 0) {
    addContentBlock(
      <RenderTable
        key={`table-${contentBlocks.length}`}
        headers={tableHeaders}
        rows={tableRows}
        terminalWidth={terminalWidth}
      />,
    );
  }

  return <>{contentBlocks}</>;
};

// Helper functions (adapted from static methods of MarkdownRenderer)

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
  const settings = useSettings();
  const MIN_LINES_FOR_MESSAGE = 1; // Minimum lines to show before the "generating more" message
  const RESERVED_LINES = 2; // Lines reserved for the message itself and potential padding

  if (isPending && availableTerminalHeight !== undefined) {
    const MAX_CODE_LINES_WHEN_PENDING = Math.max(
      0,
      availableTerminalHeight - RESERVED_LINES,
    );

    if (content.length > MAX_CODE_LINES_WHEN_PENDING) {
      if (MAX_CODE_LINES_WHEN_PENDING < MIN_LINES_FOR_MESSAGE) {
        // Not enough space to even show the message meaningfully
        return (
          <Box paddingLeft={CODE_BLOCK_PREFIX_PADDING}>
            <Text color={Colors.Gray}>... code is being written ...</Text>
          </Box>
        );
      }
      const truncatedContent = content.slice(0, MAX_CODE_LINES_WHEN_PENDING);
      const colorizedTruncatedCode = colorizeCode(
        truncatedContent.join('\n'),
        lang,
        availableTerminalHeight,
        terminalWidth - CODE_BLOCK_PREFIX_PADDING,
        undefined,
        settings,
      );
      return (
        <Box paddingLeft={CODE_BLOCK_PREFIX_PADDING} flexDirection="column">
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
    terminalWidth - CODE_BLOCK_PREFIX_PADDING,
    undefined,
    settings,
  );

  return (
    <Box
      paddingLeft={CODE_BLOCK_PREFIX_PADDING}
      flexDirection="column"
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

interface RenderTableProps {
  headers: string[];
  rows: string[][];
  terminalWidth: number;
}

const RenderTableInternal: React.FC<RenderTableProps> = ({
  headers,
  rows,
  terminalWidth,
}) => (
  <TableRenderer headers={headers} rows={rows} terminalWidth={terminalWidth} />
);

const RenderTable = React.memo(RenderTableInternal);

export const MarkdownDisplay = React.memo(MarkdownDisplayInternal);
