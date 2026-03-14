/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import type { BrowserPreview } from '@google/gemini-cli-core';
import { theme } from '../../semantic-colors.js';

interface BrowserPreviewDisplayProps {
  preview: BrowserPreview;
}

export const BrowserPreviewDisplay: React.FC<BrowserPreviewDisplayProps> = ({
  preview,
}) => (
    <Box flexDirection="column" paddingX={1}>
      <Text color={theme.status.success}>
        Preview opened in browser: {preview.title || 'Untitled'}
      </Text>
      <Text dimColor>File: {preview.imagePath}</Text>
    </Box>
  );
