/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { themeManager } from '../themes/theme-manager.js';
import { theme } from '../semantic-colors.js';

const COLOR_DESCRIPTIONS: Record<string, string> = {
  'text.primary': 'Primary text color',
  'text.secondary': 'Secondary/dimmed text color',
  'text.link': 'Hyperlink and highlighting color',
  'text.accent': 'Accent color for emphasis',
  'text.response': 'Color for model response text',
  'background.primary': 'Main terminal background color',
  'background.message': 'Subtle background for message blocks',
  'background.input': 'Background for the input prompt',
  'background.diff.added': 'Background for added lines in diffs',
  'background.diff.removed': 'Background for removed lines in diffs',
  'border.default': 'Standard border color',
  'border.focused': 'Border color when an element is focused',
  'ui.comment': 'Color for code comments and metadata',
  'ui.symbol': 'Color for technical symbols and UI icons',
  'ui.dark': 'Deeply dimmed color for subtle UI elements',
  'ui.gradient': 'Array of colors used for UI gradients',
  'status.error': 'Color for error messages and critical status',
  'status.success': 'Color for success messages and positive status',
  'status.warning': 'Color for warnings and cautionary status',
};

interface StandardColorRow {
  type: 'standard';
  name: string;
  value: string;
}

interface GradientColorRow {
  type: 'gradient';
  name: string;
  value: string[];
}

interface BackgroundColorRow {
  type: 'background';
  name: string;
  value: string;
}

export const ColorsDisplay: React.FC = () => {
  const semanticColors = themeManager.getSemanticColors();
  const activeTheme = themeManager.getActiveTheme();

  const standardRows: StandardColorRow[] = [];
  const backgroundRows: BackgroundColorRow[] = [];
  const gradientRow: GradientColorRow | null =
    semanticColors.ui.gradient && semanticColors.ui.gradient.length > 0
      ? {
          type: 'gradient',
          name: 'ui.gradient',
          value: semanticColors.ui.gradient,
        }
      : null;

  // Flatten and categorize the SemanticColors object
  for (const [category, subColors] of Object.entries(semanticColors)) {
    if (category === 'ui' && 'gradient' in subColors) {
      // Handled separately
      continue;
    }

    for (const [name, value] of Object.entries(subColors)) {
      const fullName = `${category}.${name}`;

      if (value === undefined || value === null) {
        continue;
      }

      if (typeof value === 'object' && !Array.isArray(value)) {
        for (const [diffName, diffValue] of Object.entries(value)) {
          if (typeof diffValue === 'string') {
            if (category === 'background') {
              backgroundRows.push({
                type: 'background',
                name: `${fullName}.${diffName}`,
                value: diffValue,
              });
            } else {
              standardRows.push({
                type: 'standard',
                name: `${fullName}.${diffName}`,
                value: diffValue,
              });
            }
          }
        }
      } else if (typeof value === 'string') {
        if (category === 'background') {
          backgroundRows.push({
            type: 'background',
            name: fullName,
            value,
          });
        } else {
          standardRows.push({
            type: 'standard',
            name: fullName,
            value,
          });
        }
      }
    }
  }

  return (
    <Box flexDirection="column" paddingX={1} marginY={1}>
      <Box marginBottom={1} flexDirection="column">
        <Text bold color={theme.text.accent}>
          /colors - Theme Colors Demo
        </Text>
        <Text color={theme.text.secondary}>
          The purpose of this feature is to visualize how colors are used in the
          app, test across a variety of Terminals (Mac Terminal, Ghostty,
          iTerm2, VSCode, etc), and see how the colors change across different
          themes.
        </Text>
        <Box marginTop={1}>
          <Text color={theme.text.secondary}>
            Active Theme:{' '}
            <Text color={theme.text.primary} bold>
              {activeTheme.name}
            </Text>{' '}
            ({activeTheme.type})
          </Text>
        </Box>
      </Box>

      {/* Header */}
      <Box
        flexDirection="row"
        marginBottom={1}
        borderStyle="single"
        borderColor={theme.border.default}
        paddingX={1}
      >
        <Box width="15%">
          <Text bold color={theme.text.link}>
            Value
          </Text>
        </Box>
        <Box width="30%">
          <Text bold color={theme.text.link}>
            Name
          </Text>
        </Box>
        <Box flexGrow={1}>
          <Text bold color={theme.text.link}>
            Usage
          </Text>
        </Box>
      </Box>

      {/* Standard Section */}
      <Box flexDirection="column" marginBottom={1}>
        {standardRows.map((row) => renderStandardRow(row))}
      </Box>

      {/* Gradient Section */}
      {gradientRow && (
        <Box flexDirection="column" marginBottom={1}>
          {renderGradientRow(gradientRow)}
        </Box>
      )}

      {/* Background Section */}
      <Box flexDirection="column" marginTop={1}>
        <Box marginBottom={1}>
          <Text bold color={theme.text.accent}>
            Background Colors
          </Text>
        </Box>
        {backgroundRows.map((row) => renderBackgroundRow(row))}
      </Box>
    </Box>
  );
};

function renderStandardRow({ name, value }: StandardColorRow) {
  const description = COLOR_DESCRIPTIONS[name] || '';
  const isHex = value.startsWith('#');

  return (
    <Box key={name} flexDirection="row" paddingX={1}>
      <Box width="15%">
        <Text color={isHex ? value : theme.text.primary}>{value}</Text>
      </Box>
      <Box width="30%">
        <Text color={theme.text.primary}>{name}</Text>
      </Box>
      <Box flexGrow={1}>
        <Text color={theme.text.secondary}>{description}</Text>
      </Box>
    </Box>
  );
}

function renderGradientRow({ name, value }: GradientColorRow) {
  const description = COLOR_DESCRIPTIONS[name] || '';

  return (
    <Box key={name} flexDirection="row" paddingX={1}>
      <Box width="15%" flexDirection="row">
        {value.map((c, i) => (
          <Text key={i} color={c}>
            {c}
            {i < value.length - 1 ? ', ' : ''}
          </Text>
        ))}
      </Box>
      <Box width="30%">
        <Text color={theme.text.primary}>{name}</Text>
      </Box>
      <Box flexGrow={1}>
        <Text color={theme.text.secondary}>{description}</Text>
      </Box>
    </Box>
  );
}

function renderBackgroundRow({ name, value }: BackgroundColorRow) {
  const description = COLOR_DESCRIPTIONS[name] || '';

  return (
    <Box key={name} flexDirection="row" paddingX={1} marginBottom={1}>
      <Box
        width="15%"
        backgroundColor={value}
        justifyContent="center"
        paddingX={1}
      >
        <Text color={theme.text.primary} bold>
          {value || 'default'}
        </Text>
      </Box>
      <Box width="30%" paddingLeft={1}>
        <Text color={theme.text.primary}>{name}</Text>
      </Box>
      <Box flexGrow={1}>
        <Text color={theme.text.secondary}>{description}</Text>
      </Box>
    </Box>
  );
}
