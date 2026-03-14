/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useMemo } from 'react';
import { Box, Text } from 'ink';
import type { DiagramData } from '@google/gemini-cli-core';
import { GridCanvas } from '@google/gemini-cli-core';
import { theme } from '../../semantic-colors.js';

interface FlowchartRendererProps {
  diagram: DiagramData;
  terminalWidth: number;
}

export const FlowchartRenderer: React.FC<FlowchartRendererProps> = ({
  diagram,
  terminalWidth,
}) => {
  const renderedLines = useMemo(() => {
    let maxX = 0;
    let maxY = 0;
    for (const node of diagram.nodes) {
      maxX = Math.max(maxX, node.x + node.width + 1);
      maxY = Math.max(maxY, node.y + node.height + 1);
    }

    const width = Math.min(maxX + 2, terminalWidth);
    const height = maxY + 2;

    const canvas = new GridCanvas(width, height);

    // Draw edges first (behind nodes)
    for (const edge of diagram.edges) {
      canvas.drawEdge(edge);
    }

    // Draw nodes on top
    for (const node of diagram.nodes) {
      canvas.drawNode(node);
    }

    return canvas.toString().split('\n');
  }, [diagram, terminalWidth]);

  return (
    <Box flexDirection="column">
      {diagram.title && (
        <Text bold color={theme.text.primary}>
          {diagram.title}
        </Text>
      )}
      {renderedLines.map((line, i) => (
        <Text key={i} color={theme.text.primary}>
          {line}
        </Text>
      ))}
    </Box>
  );
};
