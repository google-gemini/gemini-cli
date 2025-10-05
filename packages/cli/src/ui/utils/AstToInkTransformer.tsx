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
  Content,
  PhrasingContent,
  Paragraph,
  Heading,
  Code,
  List,
  ListItem,
  BlockContent,
  Table,
  Blockquote,
} from 'mdast';
import { theme } from '../semantic-colors.js';
import { colorizeCode } from './CodeColorizer.js';
import { TableRenderer } from './TableRenderer.js';
import { useSettings } from '../contexts/SettingsContext.js';

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
 * Render phrasing (inline) content
 * Maps mdast inline nodes directly to React components
 */
function renderPhrasing(children: PhrasingContent[]): React.ReactNode {
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
            `{child.value}`
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

  // Extract first paragraph as item text
  const firstParagraph = node.children.find(
    (c): c is Paragraph => c.type === 'paragraph',
  );
  const itemText = firstParagraph
    ? renderPhrasing(firstParagraph.children)
    : '';

  // Extract code blocks (CRITICAL for proper termination)
  const codeBlocks = node.children.filter((c): c is Code => c.type === 'code');

  // Extract tables
  const tables = node.children.filter((c): c is Table => c.type === 'table');

  // Extract nested lists
  const nestedLists = node.children.filter((c): c is List => c.type === 'list');

  return (
    <Box key={`item-${depth}-${index}`} flexDirection="column">
      <Text>
        {indent}
        {marker} {itemText}
      </Text>

      {codeBlocks.map((codeBlock, idx) => (
        <Box
          key={`code-${depth}-${index}-${idx}`}
          paddingLeft={3}
          marginTop={1}
          marginBottom={1}
        >
          <RenderCodeBlock
            code={codeBlock.value}
            language={codeBlock.lang || null}
          />
        </Box>
      ))}

      {tables.map((table, idx) => {
        // Extract headers from first row
        const headers: string[] = [];
        if (table.children.length > 0 && table.children[0].children) {
          table.children[0].children.forEach((cell) => {
            if (cell.children.length > 0 && cell.children[0].type === 'text') {
              headers.push(cell.children[0].value);
            } else {
              headers.push('');
            }
          });
        }

        // Extract data rows (skip header row)
        const rows: string[][] = [];
        for (let i = 1; i < table.children.length; i++) {
          const row = table.children[i];
          const cells: string[] = [];
          row.children.forEach((cell) => {
            if (cell.children.length > 0 && cell.children[0].type === 'text') {
              cells.push(cell.children[0].value);
            } else {
              cells.push('');
            }
          });
          rows.push(cells);
        }

        return (
          <Box
            key={`table-${depth}-${index}-${idx}`}
            paddingLeft={3}
            marginTop={1}
            marginBottom={1}
          >
            <TableRenderer
              headers={headers}
              rows={rows}
              terminalWidth={terminalWidth - 3}
            />
          </Box>
        );
      })}

      {nestedLists.map((list, idx) =>
        renderList(
          list,
          `nested-${depth}-${index}-${idx}`,
          depth + 1,
          terminalWidth,
        ),
      )}
    </Box>
  );
};

/**
 * List renderer with depth tracking
 * Only top-level items get marginBottom={1}
 */
function renderList(
  node: List,
  key: string,
  depth: number,
  terminalWidth?: number,
): React.ReactElement {
  const isTopLevel = depth === 0;

  return (
    <Box key={key} flexDirection="column" marginBottom={isTopLevel ? 1 : 0}>
      {node.children.map((item, index) => (
        <RenderListItemInternal
          key={`item-${depth}-${index}`}
          node={item}
          index={index}
          depth={depth}
          ordered={node.ordered || false}
          start={node.start || undefined}
          terminalWidth={terminalWidth}
        />
      ))}
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

  // Extract headers from first row
  const headers: string[] = [];
  if (node.children.length > 0 && node.children[0].children) {
    node.children[0].children.forEach((cell) => {
      if (cell.children.length > 0 && cell.children[0].type === 'text') {
        headers.push(cell.children[0].value);
      } else {
        headers.push('');
      }
    });
  }

  // Extract data rows (skip header row)
  const rows: string[][] = [];
  for (let i = 1; i < node.children.length; i++) {
    const row = node.children[i];
    const cells: string[] = [];
    row.children.forEach((cell) => {
      if (cell.children.length > 0 && cell.children[0].type === 'text') {
        cells.push(cell.children[0].value);
      } else {
        cells.push('');
      }
    });
    rows.push(cells);
  }

  return (
    <Box key={key} marginBottom={isTopLevel ? 1 : 0}>
      <TableRenderer
        headers={headers}
        rows={rows}
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
  node: Content | BlockContent,
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
    default:
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
