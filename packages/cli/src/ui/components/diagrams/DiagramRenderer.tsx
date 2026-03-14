/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useMemo } from 'react';
import { Box, Text } from 'ink';
import type { DiagramData } from '@google/gemini-cli-core';
import { renderDSA } from '@google/gemini-cli-core';
import { FlowchartRenderer } from './FlowchartRenderer.js';
import { theme } from '../../semantic-colors.js';

interface DiagramRendererProps {
  diagram: DiagramData;
  terminalWidth: number;
}

export const DiagramRenderer: React.FC<DiagramRendererProps> = ({
  diagram,
  terminalWidth,
}) => {
  const dsaLines = useMemo(() => renderDSA(diagram), [diagram]);

  if (dsaLines) {
    return (
      <Box flexDirection="column">
        {diagram.title && (
          <Text bold color={theme.text.primary}>
            {diagram.title}
          </Text>
        )}
        {dsaLines.map((line, i) => (
          <Text key={i} color={theme.text.primary}>
            {line}
          </Text>
        ))}
      </Box>
    );
  }

  return <FlowchartRenderer diagram={diagram} terminalWidth={terminalWidth} />;
};
