/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Text } from 'ink';
import { parseMarkdownToANSI } from './markdownParsingUtils.js';
import { stripUnsafeCharacters } from './textUtils.js';
import { useSettings } from '../contexts/SettingsContext.js';

interface RenderInlineProps {
  text: string;
  defaultColor?: string;
}

const RenderInlineInternal: React.FC<RenderInlineProps> = ({
  text: rawText,
  defaultColor,
}) => {
  const settings = useSettings();
  const enableHyperlinks = settings?.merged?.experimental?.hyperlinks ?? false;
  const text = stripUnsafeCharacters(rawText);
  const ansiText = parseMarkdownToANSI(text, defaultColor, {
    enableHyperlinks,
  });

  return <Text>{ansiText}</Text>;
};

export const RenderInline = React.memo(RenderInlineInternal);
