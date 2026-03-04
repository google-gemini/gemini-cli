/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import Gradient from 'ink-gradient';
import { theme } from '../semantic-colors.js';
import type { Theme } from '../themes/theme.js';

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

const VALUE_COLUMN_WIDTH = 10;

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
  'background.focus': 'Background highlight for selected/focused items',
  'background.diff.added': 'Background for added lines in diffs',
  'background.diff.removed': 'Background for removed lines in diffs',
  'border.default': 'Standard border color',
  'ui.comment': 'Color for code comments and metadata',
  'ui.symbol': 'Color for technical symbols and UI icons',
  'ui.active': 'Border color for active or running elements',
  'ui.dark': 'Deeply dimmed color for subtle UI elements',
  'ui.focus':
    'Color for focused elements (e.g. selected menu items, focused borders)',
  'status.error': 'Color for error messages and critical status',
  'status.success': 'Color for success messages and positive status',
  'status.warning': 'Color for warnings and cautionary status',
};

interface ColorsDisplayProps {
  activeTheme: Theme;
}

/**
 * Determines a contrasting text color (black or white) based on the background color's luminance.
 */
function getContrastingTextColor(hex: string): string {
  if (!hex || !hex.startsWith('#') || hex.length < 7) {
    // Fallback for invalid hex codes or named colors
    return theme.text.primary;
  }
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  // Using YIQ formula to determine luminance
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 128 ? '#000000' : '#FFFFFF';
}

export const ColorsDisplay: React.FC<ColorsDisplayProps> = ({
  activeTheme,
}) => {
  const semanticColors = activeTheme.semanticColors;

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

  /**
   * Recursively flattens the semanticColors object.
   */
  const flattenColors = (obj: object, path: string = '') => {
    for (const [key, value] of Object.entries(obj)) {
      if (value === undefined || value === null) continue;
      const newPath = path ? `${path}.${key}` : key;

      if (key === 'gradient' && Array.isArray(value)) {
        // Gradient handled separately
        continue;
      }

      if (typeof value === 'object' && !Array.isArray(value)) {
        flattenColors(value, newPath);
      } else if (typeof value === 'string') {
        if (newPath.startsWith('background.')) {
          backgroundRows.push({
            type: 'background',
            name: newPath,
            value,
          });
        } else {
          standardRows.push({
            type: 'standard',
            name: newPath,
            value,
          });
        }
      }
    }
  };

  flattenColors(semanticColors);

  // Final order: Backgrounds first, then Standards, then Gradient
  const allRows: ColorRow[] = [
    ...backgroundRows,
    ...standardRows,
    ...(gradientRow ? [gradientRow] : []),
  ];

  return (
    <Box
      flexDirection="column"
      paddingX={1}
      paddingY={0}
      borderStyle="round"
      borderColor={theme.border.default}
    >
      <Box marginBottom={1} flexDirection="column">
        <Text bold color={theme.text.accent}>
          DEVELOPER TOOLS (Not visible to users)
        </Text>
        <Box marginTop={1} flexDirection="column">
          <Text color={theme.text.primary}>
            <Text bold>How do colors get applied?</Text>
          </Text>
          <Box marginLeft={2} flexDirection="column">
            <Text color={theme.text.primary}>
              • <Text bold>Hex:</Text> Rendered exactly by modern terminals. Not
              overridden by app themes.
            </Text>
            <Text color={theme.text.primary}>
              • <Text bold>Blank:</Text> Uses your terminal&apos;s default
              foreground/background.
            </Text>
            <Text color={theme.text.primary}>
              • <Text bold>Compatibility:</Text> On older terminals, hex is
              approximated to the nearest ANSI color.
            </Text>
            <Text color={theme.text.primary}>
              • <Text bold>ANSI Names:</Text> &apos;red&apos;,
              &apos;green&apos;, etc. are mapped to your terminal app&apos;s
              palette.
            </Text>
          </Box>
        </Box>
      </Box>

      {/* Header */}
      <Box flexDirection="row" marginBottom={0} paddingX={1}>
        <Box width={VALUE_COLUMN_WIDTH}>
          <Text bold color={theme.text.link} dimColor>
            Value
          </Text>
        </Box>
        <Box flexGrow={1}>
          <Text bold color={theme.text.link} dimColor>
            Name
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
  const isHex = value.startsWith('#');
  const displayColor = isHex ? value : theme.text.primary;
  const description = COLOR_DESCRIPTIONS[name] || '';

  return (
    <Box key={name} flexDirection="row" paddingX={1}>
      <Box width={VALUE_COLUMN_WIDTH}>
        <Text color={displayColor}>{value || '(blank)'}</Text>
      </Box>
      <Box flexGrow={1} flexDirection="row">
        <Box width="30%">
          <Text color={displayColor}>{name}</Text>
        </Box>
        <Box flexGrow={1} paddingLeft={1}>
          <Text color={theme.text.secondary}>{description}</Text>
        </Box>
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
      <Box flexGrow={1} flexDirection="row">
        <Box width="30%">
          <Gradient colors={value}>
            <Text>{name}</Text>
          </Gradient>
        </Box>
        <Box flexGrow={1} paddingLeft={1}>
          <Text color={theme.text.secondary}>{description}</Text>
        </Box>
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
        <Text color={getContrastingTextColor(value)} bold wrap="truncate">
          {value || 'default'}
        </Text>
      </Box>
      <Box flexGrow={1} flexDirection="row" paddingLeft={1}>
        <Box width="30%">
          <Text color={theme.text.primary}>{name}</Text>
        </Box>
        <Box flexGrow={1} paddingLeft={1}>
          <Text color={theme.text.secondary}>{description}</Text>
        </Box>
      </Box>
    </Box>
  );
}
