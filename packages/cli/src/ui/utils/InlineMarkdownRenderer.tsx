/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { parseMarkdownToANSI } from './markdownParsingUtils.js';
import { stripUnsafeCharacters } from './textUtils.js';

interface RenderInlineProps {
  text: string;
  defaultColor?: string;
}

const RenderInlineInternal: React.FC<RenderInlineProps> = ({
  text: rawText,
  defaultColor,
}) => {
  const text = stripUnsafeCharacters(rawText);
  const ansiText = parseMarkdownToANSI(text, defaultColor);

  return <>{ansiText}</>;
};

/**
 * Renders inline markdown as ANSI-formatted text.
 *
 * NOTE: This component returns a React fragment and does NOT include its own
 * Ink <Text> wrapper. Callers MUST wrap this component in a <Text> block to
 * ensure Ink's layout engine can correctly calculate wrap points and prevent
 * character dropping.
 */
export const RenderInline = React.memo(RenderInlineInternal);
