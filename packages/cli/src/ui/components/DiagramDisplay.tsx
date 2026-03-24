/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';

const DIAGRAM_ICONS: Record<string, string> = {
  flowchart: '⬡',
  sequence: '⇄',
  class: '⊞',
  erd: '⊟',
};

interface DiagramDisplayProps {
  diagramType: string;
  title?: string;
  asciiArt: string;
  mermaidSource?: string;
}

export const DiagramDisplay: React.FC<DiagramDisplayProps> = ({
  diagramType,
  title,
  asciiArt,
  mermaidSource,
}) => {
  const icon = DIAGRAM_ICONS[diagramType] ?? '◈';
  const typeLabel = diagramType.charAt(0).toUpperCase() + diagramType.slice(1);
  const headerLabel = title
    ? `${icon}  ${typeLabel} Diagram — ${title}`
    : `${icon}  ${typeLabel} Diagram`;

  return (
    <Box
      borderStyle="round"
      borderColor={theme.border.default}
      flexDirection="column"
      paddingX={2}
      paddingTop={1}
      paddingBottom={1}
    >
      {/* Header */}
      <Text bold color={theme.text.accent}>
        {headerLabel}
      </Text>
      <Box height={1} />

      {/* ASCII art rendered line by line */}
      {asciiArt.split('\n').map((line, idx) => (
        <Text key={idx} color={theme.text.primary}>
          {line}
        </Text>
      ))}

      {/* Optional Mermaid source hint */}
      {mermaidSource && (
        <>
          <Box height={1} />
          <Text dimColor color={theme.text.secondary}>
            {'─'.repeat(40)}
          </Text>
          <Text dimColor color={theme.text.secondary}>
            Mermaid source:
          </Text>
          {mermaidSource.split('\n').map((line, idx) => (
            <Text key={idx} dimColor color={theme.text.secondary}>
              {line}
            </Text>
          ))}
        </>
      )}
    </Box>
  );
};
