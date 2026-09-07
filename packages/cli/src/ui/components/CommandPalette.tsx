/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import type { CommandItem } from '../../commands/CommandRegistry.js';

export interface CommandPaletteProps {
  matches: CommandItem[];
  selectedIndex: number;
  query: string;
  maxVisible?: number;
}

export function CommandPalette({
  matches,
  selectedIndex,
  query,
  maxVisible = 5,
}: CommandPaletteProps): React.JSX.Element {
  if (matches.length === 0) {
    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="gray"
        paddingX={1}
        marginBottom={0}
      >
        <Text color="gray">No commands matching /{query}</Text>
        <Text color="gray">Press Esc to dismiss</Text>
      </Box>
    );
  }

  const visibleCount = Math.min(maxVisible, matches.length);
  let startIndex = 0;
  if (matches.length > visibleCount) {
    startIndex = Math.max(
      0,
      Math.min(selectedIndex - Math.floor(visibleCount / 2), matches.length - visibleCount)
    );
  }
  const visibleItems = matches.slice(startIndex, startIndex + visibleCount);

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      paddingX={1}
      marginBottom={0}
    >
      <Box flexDirection="row" marginBottom={0}>
        <Text bold color="cyan">
          Commands{query ? ` (filter: /${query})` : ''}
        </Text>
        <Text color="gray"> — {matches.length} available</Text>
      </Box>

      {visibleItems.map((item, idx) => {
        const actualIndex = startIndex + idx;
        const isSelected = actualIndex === selectedIndex;

        return (
          <Box key={item.name} flexDirection="row">
            <Text bold={isSelected} color={isSelected ? 'cyan' : 'gray'}>
              {isSelected ? '> ' : '  '}/{item.name.padEnd(12)}{' '}
            </Text>
            <Text color={isSelected ? 'white' : 'gray'}>
              {item.description}
            </Text>
          </Box>
        );
      })}

      <Box marginTop={0}>
        <Text color="gray">
          {matches.length > visibleCount
            ? `(${matches.length - visibleCount} more) `
            : ''}
          Tab to complete • ↑/↓ navigate • Esc dismiss
        </Text>
      </Box>
    </Box>
  );
}
