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
const NAME_COLUMN_WIDTH = '30%';

interface ColorsDisplayProps {
  activeTheme: Theme;
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
        <Box width={NAME_COLUMN_WIDTH}>
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

  return (
    <Box key={name} flexDirection="row" paddingX={1}>
      <Box width={VALUE_COLUMN_WIDTH}>
        <Text color={displayColor}>{value || '(blank)'}</Text>
      </Box>
      <Box width={NAME_COLUMN_WIDTH}>
        <Text color={displayColor}>{name}</Text>
      </Box>
    </Box>
  );
}

function renderGradientRow({ name, value }: GradientColorRow) {
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
    </Box>
  );
}

function renderBackgroundRow({ name, value }: BackgroundColorRow) {
  return (
    <Box key={name} flexDirection="row" paddingX={1}>
      <Box
        width={VALUE_COLUMN_WIDTH}
        backgroundColor={value}
        justifyContent="center"
        paddingX={1}
      >
        <Text color={theme.text.primary} bold wrap="truncate">
          {value || 'default'}
        </Text>
      </Box>
      <Box width={NAME_COLUMN_WIDTH} paddingLeft={1}>
        <Text color={theme.text.primary}>{name}</Text>
      </Box>
    </Box>
  );
}
