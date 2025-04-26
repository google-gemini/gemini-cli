/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box } from 'ink';
import { MarkdownRenderer } from '../../utils/MarkdownRenderer.js';

interface GeminiMessageContentProps {
  text: string;
}

/*
 * Gemini message content is a semi-hacked component. The intention is to represent a partial
 * of GeminiMessage and is only used when a response gets too long. In that instance messages
 * are split into multiple GeminiMessageContent's to enable the root <Static> component in
 * App.tsx to be as performant as humanly possible.
 */
export const GeminiMessageContent: React.FC<GeminiMessageContentProps> = ({
  text,
}) => {
  const originalPrefix = '✦ ';
  const prefixWidth = originalPrefix.length;
  const renderedBlocks = MarkdownRenderer.render(text);

  return (
    <Box flexDirection="column" paddingLeft={prefixWidth}>
      {renderedBlocks}
    </Box>
  );
};
