/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useCallback, useMemo } from 'react';
import { Box, Text } from 'ink';
import { type TeamDefinition } from '@google/gemini-cli-core';
import { theme } from '../semantic-colors.js';
import { DescriptiveRadioButtonSelect } from './shared/DescriptiveRadioButtonSelect.js';

interface TeamSelectionDialogProps {
  teams: TeamDefinition[];
  onSelect: (teamName: string | undefined) => void;
}

export function TeamSelectionDialog({
  teams,
  onSelect,
}: TeamSelectionDialogProps): React.JSX.Element {
  const options = useMemo(() => {
    const list = teams.map((team) => ({
      value: team.name,
      title: team.displayName,
      description: team.description,
      key: team.name,
    }));

    list.push({
      value: 'none',
      title: 'No Team',
      description: 'Continue with standard Gemini CLI experience',
      key: 'none',
    });

    list.push({
      value: 'marketplace',
      title: 'Browse Marketplace (Coming Soon)',
      description: 'Discover and install teams from the community',
      key: 'marketplace',
    });

    list.push({
      value: 'create',
      title: 'Create Team (Coming Soon)',
      description: 'Define your own agent team and orchestration instructions',
      key: 'create',
    });

    return list;
  }, [teams]);

  const handleSelect = useCallback(
    (value: string) => {
      if (value === 'none') {
        onSelect(undefined);
      } else if (value === 'marketplace' || value === 'create') {
        // No-op for coming soon features
        return;
      } else {
        onSelect(value);
      }
    },
    [onSelect],
  );

  return (
    <Box
      borderStyle="round"
      borderColor={theme.border.default}
      flexDirection="column"
      padding={1}
      width="100%"
    >
      <Text bold color={theme.text.primary}>
        Select an Agent Team
      </Text>
      <Text color={theme.text.secondary}>
        Choose a specialized team to orchestrate your tasks.
      </Text>

      <Box marginTop={1}>
        <DescriptiveRadioButtonSelect
          items={options}
          onSelect={handleSelect}
          showNumbers={true}
          maxItemsToShow={10}
        />
      </Box>

      <Box marginTop={1}>
        <Text color={theme.text.secondary}>
          (Use arrow keys to navigate, Enter to select)
        </Text>
      </Box>
    </Box>
  );
}
