/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import { theme } from '../../semantic-colors.js';

interface TabsProps {
  tabs: string[];
  activeTab: string;
}

export function Tabs({ tabs, activeTab }: TabsProps) {
  return (
    <Box flexDirection="row">
      {tabs.map((tab, index) => {
        const isActive = tab === activeTab;
        return (
          <Box key={tab} flexDirection="row" alignItems="center">
            <Text
              color={isActive ? theme.status.success : theme.text.secondary}
            >
              {isActive ? ` ✓ ${tab} ` : `  ${tab} `}
            </Text>
            {index < tabs.length - 1 && (
              <Text color={theme.text.secondary}>|</Text>
            )}
          </Box>
        );
      })}
    </Box>
  );
}
