/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Text } from 'ink';
import { parseMarkdownToANSI } from './markdownParsingUtils.js';
import {
  stripUnsafeCharacters,
  maskAllowlistedAuthHyperlinks,
  restoreMaskedAuthHyperlinks,
} from './textUtils.js';

interface RenderInlineProps {
  text: string;
  defaultColor?: string;
}

const RenderInlineInternal: React.FC<RenderInlineProps> = ({
  text: rawText,
  defaultColor,
}) => {
  // Mask the CLI's own allowlisted sign-in hyperlink (see
  // maskAllowlistedAuthHyperlinks) before stripping/markdown-parsing, then
  // restore it just before Ink renders it. Without this, stripUnsafeCharacters
  // would remove the OSC 8 sequence and parseMarkdownToANSI would mangle it,
  // so the TUI could never render the link Ink itself supports. All other
  // ANSI/OSC sequences are stripped exactly as before.
  const { text: maskedText, links } = maskAllowlistedAuthHyperlinks(rawText);
  const text = stripUnsafeCharacters(maskedText);
  const ansiText = parseMarkdownToANSI(text, defaultColor);
  const restoredText = restoreMaskedAuthHyperlinks(ansiText, links);

  return <Text>{restoredText}</Text>;
};

export const RenderInline = React.memo(RenderInlineInternal);
