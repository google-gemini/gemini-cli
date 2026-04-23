/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Text, useStdout } from 'ink';
import { parseMarkdownToANSI } from './markdownParsingUtils.js';
import { stripUnsafeCharacters } from './textUtils.js';
import { processRtlText, wrapLogicalText } from '../rtl/rtlUtils.js';

interface RenderInlineProps {
  text: string;
  defaultColor?: string;
}

const RenderInlineInternal: React.FC<RenderInlineProps> = ({
  text: rawText,
  defaultColor,
}) => {
  const { stdout } = useStdout();
  const maxWidth = Math.max(10, (stdout?.columns || 80) - 4);

  const text = stripUnsafeCharacters(rawText);
  const ansiText = parseMarkdownToANSI(text, defaultColor);

  const wrappedLines = wrapLogicalText(ansiText, maxWidth);
  const processedText = wrappedLines
    .map((line) => processRtlText(line))
    .join('\n');

  return <Text>{processedText}</Text>;
};

export const RenderInline = React.memo(RenderInlineInternal);
