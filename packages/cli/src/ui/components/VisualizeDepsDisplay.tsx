/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { buildDepGraph, renderDepTree } from '../utils/depGraph.js';

export const VisualizeDepsDisplay: React.FC = () => {
  const graph = buildDepGraph(process.cwd());

  if (!graph) {
    return (
      <Box marginY={1}>
        <Text color={theme.status.error}>
          No package.json found in current directory.
        </Text>
      </Box>
    );
  }

  const depLines = renderDepTree(graph.dependencies);
  const devDepLines = renderDepTree(graph.devDependencies);

  return (
    <Box flexDirection="column" marginY={1}>
      <Box marginBottom={1}>
        <Text color={theme.text.primary} bold>
          {graph.projectName}@{graph.projectVersion}
        </Text>
      </Box>

      {graph.totalDeps > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text color={theme.text.accent} bold>
            dependencies ({graph.totalDeps})
          </Text>
          {depLines.map((line, i) => (
            <Text key={`dep-${i}`} color={theme.text.primary}>
              {line}
            </Text>
          ))}
        </Box>
      )}

      {graph.totalDevDeps > 0 && (
        <Box flexDirection="column">
          <Text color={theme.status.warning} bold>
            devDependencies ({graph.totalDevDeps})
          </Text>
          {devDepLines.map((line, i) => (
            <Text key={`dev-${i}`} color={theme.text.secondary}>
              {line}
            </Text>
          ))}
        </Box>
      )}

      {graph.totalDeps === 0 && graph.totalDevDeps === 0 && (
        <Text color={theme.text.secondary}>No dependencies found.</Text>
      )}
    </Box>
  );
};
