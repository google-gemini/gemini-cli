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

    // Use direction from diagram data
    const isHorizontal =
      diagram.direction === 'LR' || diagram.direction === 'RL';

    // Group edges by source for fork drawing
    const edgesBySource = new Map<string, typeof diagram.edges>();
    for (const edge of diagram.edges) {
      if (!edgesBySource.has(edge.source)) {
        edgesBySource.set(edge.source, []);
      }
      edgesBySource.get(edge.source)!.push(edge);
    }

    // Build node lookup
    const nodeById = new Map(diagram.nodes.map((n) => [n.id, n]));

    // Draw edges - use fork for multi-child, single edge otherwise
    for (const [sourceId, sourceEdges] of edgesBySource) {
      const srcNode = nodeById.get(sourceId);
      if (!srcNode) {
        for (const edge of sourceEdges) canvas.drawEdge(edge);
        continue;
      }

      if (sourceEdges.length > 1 && !isHorizontal) {
        // TD fork: parent center -> multiple children
        const parentCenterX = srcNode.x + Math.floor(srcNode.width / 2);
        const parentBottomY = srcNode.y + srcNode.height;

        const childCenters = sourceEdges.map((e) => {
          const tgt = nodeById.get(e.target);
          if (tgt) {
            return {
              x: tgt.x + Math.floor(tgt.width / 2),
              topY: tgt.y - 1,
            };
          }
          return { x: e.targetX, topY: e.targetY };
        });

        canvas.drawTreeFork(parentCenterX, parentBottomY, childCenters);
      } else if (sourceEdges.length > 1 && isHorizontal) {
        // LR fork: parent right -> multiple children
        const parentRightX = srcNode.x + srcNode.width;
        const parentCenterY = srcNode.y + Math.floor(srcNode.height / 2);

        const childEntries = sourceEdges.map((e) => {
          const tgt = nodeById.get(e.target);
          if (tgt) {
            return {
              leftX: tgt.x - 1,
              y: tgt.y + Math.floor(tgt.height / 2),
            };
          }
          return { leftX: e.targetX, y: e.targetY };
        });

        canvas.drawHorizontalFork(parentRightX, parentCenterY, childEntries);
      } else {
        // Single edge
        for (const edge of sourceEdges) {
          canvas.drawEdge(edge);
        }
      }
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
