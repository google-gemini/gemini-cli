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
 */

import React from 'react';
import { Text } from 'ink';
import { transformMarkdownToInk } from './AstToInkTransformer.js';

interface MarkdownDisplayProps {
  text: string;
  isPending: boolean;
  availableTerminalHeight?: number;
  terminalWidth: number;
}

const MarkdownDisplayInternal: React.FC<MarkdownDisplayProps> = ({
  text,
  isPending,
  availableTerminalHeight,
  terminalWidth,
}) => {
  // Empty text check
  if (!text) return <></>;

  // Delegate to AST transformer
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
