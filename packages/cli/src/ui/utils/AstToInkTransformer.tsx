/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * AST-Based Markdown to Ink Transformer
 *
 * This module implements semantic markdown rendering using unified + remark.
 * It replaces regex-based line-by-line parsing with AST transformation.
 *
 * Key Features:
 * - Semantic spacing (depth-aware marginBottom)
 * - Proper nested structure handling (lists, code blocks, tables)
 * - Type-safe parsing with runtime validation
 * - Graceful fallback for malformed markdown
 */

import React from 'react';
import { Text, Box } from 'ink';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import type {
  Root,
  RootContent,
  PhrasingContent,
  Paragraph,
  Heading,
  Code,
  List,
  ListItem,
  Table,
  Blockquote,
  AlignType,
} from 'mdast';
import { theme } from '../semantic-colors.js';
import { colorizeCode } from './CodeColorizer.js';
import { TableRenderer } from './TableRenderer.js';
import { useSettings } from '../contexts/SettingsContext.js';
import { checkExhaustive } from '../../utils/checks.js';

/**
 * Type guard for mdast Root node
 * Runtime validation prevents type assertion errors
 */
function isMdastRoot(node: unknown): node is Root {
  return (
    typeof node === 'object' &&
    node !== null &&
    'type' in node &&
    node.type === 'root' &&
    'children' in node &&
    Array.isArray(node.children)
  );
}

/**
 * Parse markdown into mdast AST
 * Returns null on failure to enable graceful fallback
 */
export function parseMarkdown(markdown: string): Root | null {
  try {
    const processor = unified().use(remarkParse).use(remarkGfm);
    const tree = processor.parse(markdown);
    return isMdastRoot(tree) ? tree : null;
  } catch (error) {
    console.error('Markdown parsing failed:', error);
    return null;
  }
}

/**
 * Props for RenderCodeBlock component
 */
interface RenderCodeBlockProps {
  code: string;
  language: string | null;
  isPending?: boolean;
  availableTerminalHeight?: number;
  terminalWidth?: number;
}

/**
 * Code block renderer component
 * Reuses existing colorizeCode logic from MarkdownDisplay.tsx
 */
const RenderCodeBlockInternal: React.FC<RenderCodeBlockProps> = ({
  code,
  language,
  isPending = false,
  availableTerminalHeight,
  terminalWidth = 80,
}) => {
  const settings = useSettings();
  const CODE_BLOCK_PREFIX_PADDING = 1;
  const MIN_LINES_FOR_MESSAGE = 1;
  const RESERVED_LINES = 2;

  const lines = code.split('\n');

  if (isPending && availableTerminalHeight !== undefined) {
    const MAX_CODE_LINES_WHEN_PENDING = Math.max(
      0,
      availableTerminalHeight - RESERVED_LINES,
    );

    if (lines.length > MAX_CODE_LINES_WHEN_PENDING) {
      if (MAX_CODE_LINES_WHEN_PENDING < MIN_LINES_FOR_MESSAGE) {
        return (
          <Box paddingLeft={CODE_BLOCK_PREFIX_PADDING}>
            <Text color={theme.text.secondary}>
              ... code is being written ...
            </Text>
          </Box>
        );
      }
      const truncatedContent = lines.slice(0, MAX_CODE_LINES_WHEN_PENDING);
      const colorizedTruncatedCode = colorizeCode(
        truncatedContent.join('\n'),
        language,
        availableTerminalHeight,
        terminalWidth - CODE_BLOCK_PREFIX_PADDING,
        undefined,
        settings,
      );
      return (
        <Box paddingLeft={CODE_BLOCK_PREFIX_PADDING} flexDirection="column">
          {colorizedTruncatedCode}
          <Text color={theme.text.secondary}>... generating more ...</Text>
        </Box>
      );
    }
  }

  const colorizedCode = colorizeCode(
    code,
    language,
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

/**
 * Extract headers and rows from table AST node
 * Returns PhrasingContent arrays for direct rendering without markdown serialization
 */
function extractTableData(node: Table): {
  headers: PhrasingContent[][];
  rows: PhrasingContent[][][];
  alignment?: AlignType[];
} {
  const headers: PhrasingContent[][] = [];
  if (node.children.length > 0 && node.children[0].children) {
    node.children[0].children.forEach((cell) => {
      headers.push(cell.children);
    });
  }

  const rows: PhrasingContent[][][] = [];
  for (let i = 1; i < node.children.length; i++) {
    const row = node.children[i];
    const cells: PhrasingContent[][] = [];
    row.children.forEach((cell) => {
      cells.push(cell.children);
    });
    rows.push(cells);
  }
  return { headers, rows, alignment: node.align || undefined };
}

/**
 * Render phrasing (inline) content
 * Maps mdast inline nodes directly to React components
 *
 * Exported for use in TableRenderer to maintain consistency
 */
export function renderPhrasing(children: PhrasingContent[]): React.ReactNode {
  return children.map((child, index) => {
    const key = `inline-${index}`;

    switch (child.type) {
      case 'text':
        return <React.Fragment key={key}>{child.value}</React.Fragment>;
      case 'strong':
        return (
          <Text key={key} bold>
            {renderPhrasing(child.children)}
          </Text>
        );
      case 'emphasis':
        return (
          <Text key={key} italic>
            {renderPhrasing(child.children)}
          </Text>
        );
      case 'inlineCode':
        return (
          <Text key={key} color="cyan">
            {child.value}
          </Text>
        );
      case 'link':
        return (
          <Text key={key} underline color="blue">
            {renderPhrasing(child.children)}
          </Text>
        );
      case 'delete':
        return (
          <Text key={key} strikethrough>
            {renderPhrasing(child.children)}
          </Text>
        );
      default:
        return null;
    }
  });
}

/**
 * Props for list item component
 */
interface RenderListItemInternalProps {
  node: ListItem;
  index: number;
  depth: number;
  ordered: boolean;
  start?: number;
  terminalWidth?: number;
}

/**
 * List item renderer with code block and table support
 * Processes children in order to preserve content sequence
 */
const RenderListItemInternal: React.FC<RenderListItemInternalProps> = ({
  node,
  index,
  depth,
  ordered,
  start,
  terminalWidth = 80,
}) => {
  const indent = '   '.repeat(depth);
  const marker = ordered ? `${(start || 1) + index}.` : '*';

  // Calculate spacing for continuation lines (indent + marker + space)
  const markerLine = `${indent}${marker} `;
  const continuationIndent = ' '.repeat(markerLine.length);

  if (node.children.length === 0) {
    return (
      <Box key={`item-${depth}-${index}`}>
        <Text>
          {indent}
          {marker}
        </Text>
      </Box>
    );
  }

  const elements: React.ReactNode[] = [];
  let markerUsed = false;

  // Use spread property to determine if we need spacing between children
  const needsSpacing = node.spread || false;

  // Process each child in order
  node.children.forEach((child, childIdx) => {
    const key = `child-${depth}-${index}-${childIdx}`;
    const isFirstChild = childIdx === 0;

    if (!markerUsed && child.type === 'paragraph') {
      // First paragraph: render inline with marker
      elements.push(
        <Text key={key}>
          {indent}
          {marker} {renderPhrasing(child.children)}
        </Text>,
      );
      markerUsed = true;
    } else {
      // All other children: render with continuation indent
      let childElement: React.ReactNode = null;

      // If marker not yet used, add it before first non-paragraph element
      const prefix = !markerUsed ? `${indent}${marker}\n` : '';
      if (!markerUsed) markerUsed = true;

      // Add top margin for spread lists (preserves \n\n spacing)
      const topMargin = needsSpacing && !isFirstChild ? 1 : 0;

      switch (child.type) {
        case 'paragraph':
          childElement = (
            <Box key={key} marginTop={topMargin}>
              <Text wrap="wrap">
                {continuationIndent}
                {renderPhrasing(child.children)}
              </Text>
            </Box>
          );
          break;
        case 'code':
          childElement = (
            <Box
              key={key}
              flexDirection="column"
              marginTop={1}
              marginBottom={1}
            >
              {prefix && <Text>{prefix.trim()}</Text>}
              <Box paddingLeft={continuationIndent.length}>
                <RenderCodeBlock
                  code={child.value}
                  language={child.lang || null}
                  terminalWidth={terminalWidth - continuationIndent.length}
                />
              </Box>
            </Box>
          );
          break;
        case 'table': {
          const { headers, rows, alignment } = extractTableData(child);
          childElement = (
            <Box
              key={key}
              flexDirection="column"
              marginTop={1}
              marginBottom={1}
            >
              {prefix && <Text>{prefix.trim()}</Text>}
              <Box paddingLeft={continuationIndent.length}>
                <TableRenderer
                  headers={headers}
                  rows={rows}
                  alignment={alignment}
                  terminalWidth={terminalWidth - continuationIndent.length}
                />
              </Box>
            </Box>
          );
          break;
        }
        case 'list':
          childElement = (
            <Box key={key}>
              {prefix && <Text>{prefix.trim()}</Text>}
              {renderList(child, key, depth + 1, terminalWidth)}
            </Box>
          );
          break;
        case 'heading':
        case 'blockquote':
        case 'thematicBreak':
          // These are less common in list items but should still be handled
          childElement = (
            <Box key={key}>
              {prefix && <Text>{prefix.trim()}</Text>}
              <Box paddingLeft={continuationIndent.length}>
                {transformNode(
                  child as RootContent,
                  key,
                  depth + 1,
                  false,
                  undefined,
                  terminalWidth,
                )}
              </Box>
            </Box>
          );
          break;
        default:
          // Unknown or unsupported type - skip
          break;
      }

      if (childElement) {
        elements.push(childElement);
      }
    }
  });

  return (
    <Box key={`item-${depth}-${index}`} flexDirection="column">
      {elements}
    </Box>
  );
};

/**
 * List renderer with depth tracking
 * Spacing controlled by list spread property and depth
 */
function renderList(
  node: List,
  key: string,
  depth: number,
  terminalWidth?: number,
): React.ReactElement {
  const isTopLevel = depth === 0;
  // Spread lists have blank lines between items in source markdown
  const hasSpacing = node.spread || false;

  return (
    <Box key={key} flexDirection="column" marginBottom={isTopLevel ? 1 : 0}>
      {node.children.map((item, index) => {
        // Add margin between list items for spread lists
        const isLastItem = index === node.children.length - 1;
        const itemMarginBottom = hasSpacing && !isLastItem ? 1 : 0;

        return (
          <Box
            key={`item-wrapper-${depth}-${index}`}
            marginBottom={itemMarginBottom}
          >
            <RenderListItemInternal
              key={`item-${depth}-${index}`}
              node={item}
              index={index}
              depth={depth}
              ordered={node.ordered || false}
              start={node.start || undefined}
              terminalWidth={terminalWidth}
            />
          </Box>
        );
      })}
    </Box>
  );
}

/**
 * Transform paragraph node
 */
function transformParagraph(
  node: Paragraph,
  key: string,
  depth: number,
): React.ReactElement {
  const isTopLevel = depth === 0;
  return (
    <Box key={key} marginBottom={isTopLevel ? 1 : 0}>
      <Text wrap="wrap">{renderPhrasing(node.children)}</Text>
    </Box>
  );
}

/**
 * Transform heading node
 */
function transformHeading(
  node: Heading,
  key: string,
  depth: number,
): React.ReactElement {
  const isTopLevel = depth === 0;
  let headerNode: React.ReactNode = null;

  switch (node.depth) {
    case 1:
      headerNode = (
        <Text bold color={theme.text.link}>
          {renderPhrasing(node.children)}
        </Text>
      );
      break;
    case 2:
      headerNode = (
        <Text bold color={theme.text.link}>
          {renderPhrasing(node.children)}
        </Text>
      );
      break;
    case 3:
      headerNode = (
        <Text bold color={theme.text.primary}>
          {renderPhrasing(node.children)}
        </Text>
      );
      break;
    case 4:
      headerNode = (
        <Text italic color={theme.text.secondary}>
          {renderPhrasing(node.children)}
        </Text>
      );
      break;
    default:
      headerNode = (
        <Text color={theme.text.primary}>{renderPhrasing(node.children)}</Text>
      );
      break;
  }

  return (
    <Box key={key} marginBottom={isTopLevel ? 1 : 0}>
      {headerNode}
    </Box>
  );
}

/**
 * Transform code block node
 */
function transformCodeBlock(
  node: Code,
  key: string,
  depth: number,
  isPending: boolean,
  availableTerminalHeight?: number,
  terminalWidth?: number,
): React.ReactElement {
  const isTopLevel = depth === 0;
  return (
    <Box key={key} marginBottom={isTopLevel ? 1 : 0}>
      <RenderCodeBlock
        code={node.value}
        language={node.lang || null}
        isPending={isPending}
        availableTerminalHeight={availableTerminalHeight}
        terminalWidth={terminalWidth}
      />
    </Box>
  );
}

/**
 * Transform thematic break node
 */
function transformThematicBreak(
  key: string,
  depth: number,
): React.ReactElement {
  const isTopLevel = depth === 0;
  return (
    <Box key={key} marginBottom={isTopLevel ? 1 : 0}>
      <Text dimColor>---</Text>
    </Box>
  );
}

/**
 * Transform table node
 */
function transformTable(
  node: Table,
  key: string,
  depth: number,
  terminalWidth: number,
): React.ReactElement {
  const isTopLevel = depth === 0;
  const { headers, rows, alignment } = extractTableData(node);

  return (
    <Box key={key} marginBottom={isTopLevel ? 1 : 0}>
      <TableRenderer
        headers={headers}
        rows={rows}
        alignment={alignment}
        terminalWidth={terminalWidth}
      />
    </Box>
  );
}

/**
 * Transform blockquote node
 * Renders with continuous left vertical bar (GitHub style)
 */
function transformBlockquote(
  node: Blockquote,
  key: string,
  depth: number,
  isPending: boolean,
  availableTerminalHeight?: number,
  terminalWidth?: number,
): React.ReactElement {
  const isTopLevel = depth === 0;
  const barChar = '│';
  const barColor = theme.text.secondary;

  // Flatten all children into lines with bar prefix
  const lines: React.ReactNode[] = [];

  node.children.forEach((child, idx) => {
    const isLastChild = idx === node.children.length - 1;
    const element = transformNode(
      child,
      `quote-${idx}`,
      depth + 1,
      isPending,
      availableTerminalHeight,
      terminalWidth,
    );

    // Add element with bar prefix
    lines.push(
      <Box key={`quote-line-${idx}`} flexDirection="row">
        <Text color={barColor} bold>
          {barChar}{' '}
        </Text>
        <Box flexGrow={1}>{element}</Box>
      </Box>,
    );

    // Add spacing line with bar between children (except last)
    if (!isLastChild) {
      lines.push(
        <Box key={`quote-space-${idx}`} flexDirection="row">
          <Text color={barColor} bold>
            {barChar}
          </Text>
        </Box>,
      );
    }
  });

  return (
    <Box key={key} marginBottom={isTopLevel ? 1 : 0} flexDirection="column">
      {lines}
    </Box>
  );
}

/**
 * Main node transformer
 * Routes nodes to specific transformers based on type
 */
function transformNode(
  node: RootContent,
  key: string,
  depth: number,
  isPending: boolean,
  availableTerminalHeight?: number,
  terminalWidth?: number,
): React.ReactElement | null {
  switch (node.type) {
    case 'paragraph':
      return transformParagraph(node as Paragraph, key, depth);
    case 'heading':
      return transformHeading(node as Heading, key, depth);
    case 'code':
      return transformCodeBlock(
        node as Code,
        key,
        depth,
        isPending,
        availableTerminalHeight,
        terminalWidth,
      );
    case 'thematicBreak':
      return transformThematicBreak(key, depth);
    case 'list':
      return renderList(node as List, key, depth, terminalWidth);
    case 'table':
      return transformTable(node as Table, key, depth, terminalWidth || 80);
    case 'blockquote':
      return transformBlockquote(
        node as Blockquote,
        key,
        depth,
        isPending,
        availableTerminalHeight,
        terminalWidth,
      );
    // Unsupported or edge-case node types - return null
    case 'html':
    case 'definition':
    case 'footnoteDefinition':
    case 'yaml':
      return null;
    // Phrasing content that shouldn't appear at root level
    case 'break':
    case 'delete':
    case 'emphasis':
    case 'footnoteReference':
    case 'image':
    case 'imageReference':
    case 'inlineCode':
    case 'link':
    case 'linkReference':
    case 'strong':
    case 'text':
      return null;
    // Table/list internals that shouldn't appear at root level
    case 'listItem':
    case 'tableRow':
    case 'tableCell':
      return null;
    default:
      checkExhaustive(node);
      return null;
  }
}

/**
 * Transform options
 */
export interface TransformOptions {
  isPending?: boolean;
  availableTerminalHeight?: number;
  terminalWidth?: number;
}

/**
 * Main transform function
 * Converts markdown AST to Ink React elements
 */
export function transformMarkdownToInk(
  markdown: string,
  options: TransformOptions = {},
): React.ReactNode {
  const {
    isPending = false,
    availableTerminalHeight,
    terminalWidth = 80,
  } = options;

  // Parse markdown into AST
  const ast = parseMarkdown(markdown);

  // Fallback to plain text if parsing fails
  if (!ast) {
    return <Text>{markdown}</Text>;
  }

  // Transform AST nodes to React elements
  return ast.children.map((node, index) =>
    transformNode(
      node,
      `node-${index}`,
      0,
      isPending,
      availableTerminalHeight,
      terminalWidth,
    ),
  );
}
