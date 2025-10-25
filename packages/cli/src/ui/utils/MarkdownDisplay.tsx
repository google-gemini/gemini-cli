/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * MarkdownDisplay Component - AST-Based Rendering
 *
 * Simplified component that delegates to AstToInkTransformer for all markdown parsing.
 * Replaces regex-based line-by-line parsing with semantic AST transformation.
 *
 * Key improvements:
 * - Consistent spacing regardless of source markdown formatting
 * - Proper nested structure handling (lists, code blocks)
 * - Graceful fallback for malformed markdown
 * - Raw markdown mode support for viewing source
 */

import React from 'react';
import { Text, Box } from 'ink';
import { transformMarkdownToInk } from './AstToInkTransformer.js';
import { colorizeCode } from './CodeColorizer.js';
import { useSettings } from '../contexts/SettingsContext.js';

interface MarkdownDisplayProps {
  text: string;
  isPending: boolean;
  availableTerminalHeight?: number;
  terminalWidth: number;
  renderMarkdown?: boolean;
}

const CODE_BLOCK_PREFIX_PADDING = 1;

const MarkdownDisplayInternal: React.FC<MarkdownDisplayProps> = ({
  text,
  isPending,
  availableTerminalHeight,
  terminalWidth,
  renderMarkdown = true,
}) => {
  const settings = useSettings();

  // Empty text check
  if (!text) return <></>;

  // Raw markdown mode - display syntax-highlighted markdown without rendering
  if (!renderMarkdown) {
    // Hide line numbers in raw markdown mode as they are confusing due to chunked output
    const colorizedMarkdown = colorizeCode(
      text,
      'markdown',
      availableTerminalHeight,
      terminalWidth - CODE_BLOCK_PREFIX_PADDING,
      undefined,
      settings,
      true, // hideLineNumbers
    );
    return (
      <Box paddingLeft={CODE_BLOCK_PREFIX_PADDING} flexDirection="column">
        {colorizedMarkdown}
      </Box>
    );
  }

  // Delegate to AST transformer for rendered markdown
  const rendered = transformMarkdownToInk(text, {
    isPending,
    availableTerminalHeight,
    terminalWidth,
  });

  // Fallback for unexpected transformer output
  if (!rendered) {
    return <Text>{text}</Text>;
  }

  return <>{rendered}</>;
};

export const MarkdownDisplay = React.memo(MarkdownDisplayInternal);
