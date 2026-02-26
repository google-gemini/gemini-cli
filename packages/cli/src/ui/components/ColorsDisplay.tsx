/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import Gradient from 'ink-gradient';
import { themeManager } from '../themes/theme-manager.js';
import { theme } from '../semantic-colors.js';

const COLOR_DESCRIPTIONS: Record<string, string> = {
  'text.primary': 'Primary text color (uses terminal default if blank)',
  'text.secondary': 'Secondary/dimmed text color',
  'text.link': 'Hyperlink and highlighting color',
  'text.accent': 'Accent color for emphasis',
  'text.response':
    'Color for model response text (uses terminal default if blank)',
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

type ColorRow = StandardColorRow | GradientColorRow | BackgroundColorRow;

const VALUE_COLUMN_WIDTH = '8%';
const NAME_COLUMN_WIDTH = '30%';

export const ColorsDisplay: React.FC = () => {
  const semanticColors = themeManager.getSemanticColors();
  const activeTheme = themeManager.getActiveTheme();

  const backgroundRows: BackgroundColorRow[] = [];
  const standardRows: StandardColorRow[] = [];
  let gradientRow: GradientColorRow | null = null;

  if (semanticColors.ui.gradient && semanticColors.ui.gradient.length > 0) {
    gradientRow = {
      type: 'gradient',
      name: 'ui.gradient',
      value: semanticColors.ui.gradient,
    };
  }

  // Flatten and categorize the SemanticColors object
  for (const [category, subColors] of Object.entries(semanticColors)) {
    if (category === 'ui' && 'gradient' in subColors) {
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

  // Final order: Backgrounds first, then Standards, then Gradient
  const allRows: ColorRow[] = [
    ...backgroundRows,
    ...standardRows,
    ...(gradientRow ? [gradientRow] : []),
  ];

  return (
    <Box flexDirection="column" paddingX={1} marginY={1}>
      <Box marginBottom={1} flexDirection="column">
        <Text bold color={theme.text.accent}>
          /colors - Theme Colors Demo
        </Text>
        <Text color={theme.text.primary}>
          The purpose of this feature is to visualize how colors are used in the
          app, test across a variety of Terminals (Mac Terminal, Ghostty,
          iTerm2, VSCode, etc), and see how the colors change across different
          themes.
        </Text>
        <Box marginTop={1} flexDirection="column">
          <Text color={theme.text.primary}>
            <Text bold>How themes and terminals interact:</Text>
          </Text>
          <Box marginLeft={2} flexDirection="column">
            <Text color={theme.text.primary}>
              • <Text bold>TrueColor (Hex):</Text> Modern terminals (iTerm2,
              Ghostty, VSCode) render hex codes exactly. They are{' '}
              <Text italic>not</Text> overridden by terminal app themes.
            </Text>
            <Text color={theme.text.primary}>
              • <Text bold>ANSI Names:</Text> Colors like &apos;red&apos; or
              &apos;green&apos; (used in our ANSI theme) <Text italic>are</Text>{' '}
              mapped to your terminal app&apos;s specific palette.
            </Text>
            <Text color={theme.text.primary}>
              • <Text bold>Default colors:</Text> When Name or Value is
              &apos;(blank)&apos;, the app uses your terminal&apos;s default
              foreground/background.
            </Text>
            <Text color={theme.text.primary}>
              • <Text bold>Compatibility:</Text> In terminals with limited color
              (like older Mac Terminals), hex colors are automatically
              approximated to the closest available ANSI color.
            </Text>
          </Box>
        </Box>
        <Box marginTop={1}>
          <Text color={theme.text.primary}>
            Active Theme:{' '}
            <Text color={theme.text.accent} bold>
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
        <Box width={VALUE_COLUMN_WIDTH}>
          <Text bold color={theme.text.link}>
            Value
          </Text>
        </Box>
        <Box width={NAME_COLUMN_WIDTH}>
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

      {/* All Rows */}
      <Box flexDirection="column">
        {allRows.map((row) => {
          if (row.type === 'standard') return renderStandardRow(row);
          if (row.type === 'gradient') return renderGradientRow(row);
          if (row.type === 'background') return renderBackgroundRow(row);
          return null;
        })}
      </Box>
    </Box>
  );
};

function renderStandardRow({ name, value }: StandardColorRow) {
  const description = COLOR_DESCRIPTIONS[name] || '';
  const isHex = value.startsWith('#');
  const displayColor = isHex ? value : theme.text.primary;

  return (
    <Box key={name} flexDirection="row" paddingX={1}>
      <Box width={VALUE_COLUMN_WIDTH}>
        <Text color={displayColor}>{value || '(blank)'}</Text>
      </Box>
      <Box width={NAME_COLUMN_WIDTH}>
        <Text color={displayColor}>{name}</Text>
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
      <Box width={VALUE_COLUMN_WIDTH} flexDirection="column">
        {value.map((c, i) => (
          <Text key={i} color={c}>
            {c}
          </Text>
        ))}
      </Box>
      <Box width={NAME_COLUMN_WIDTH}>
        <Gradient colors={value}>
          <Text>{name}</Text>
        </Gradient>
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
    <Box key={name} flexDirection="row" paddingX={1}>
      <Box
        width={VALUE_COLUMN_WIDTH}
        backgroundColor={value}
        justifyContent="center"
        paddingX={1}
      >
        <Text color={theme.text.primary} bold>
          {value || 'default'}
        </Text>
      </Box>
      <Box width={NAME_COLUMN_WIDTH} paddingLeft={1}>
        <Text color={theme.text.primary}>{name}</Text>
      </Box>
      <Box flexGrow={1}>
        <Text color={theme.text.secondary}>{description}</Text>
      </Box>
    </Box>
  );
}
