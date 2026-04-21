/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useMemo, useCallback, useState } from 'react';
import { Box, Text } from 'ink';
import {
  type RegistryTeam,
  type TeamDefinition,
} from '@google/gemini-cli-core';
import {
  SearchableList,
  type GenericListItem,
} from '../shared/SearchableList.js';
import { theme } from '../../semantic-colors.js';

import { useTeamRegistry } from '../../hooks/useTeamRegistry.js';
import { useConfig } from '../../contexts/ConfigContext.js';
import { useRegistrySearch } from '../../hooks/useRegistrySearch.js';
import { useUIState } from '../../contexts/UIStateContext.js';
import { TeamDetailsView } from './TeamDetailsView.js';
import { ProviderTag } from '../shared/ProviderTag.js';

export interface TeamRegistryViewProps {
  onInstall?: (team: RegistryTeam) => void | Promise<void>;
  onClose?: () => void;
  installedTeams: TeamDefinition[];
}

interface TeamListItem extends GenericListItem {
  team: RegistryTeam;
}

export function TeamRegistryView({
  onInstall,
  onClose,
  installedTeams,
}: TeamRegistryViewProps): React.JSX.Element {
  const config = useConfig();
  const { teams, loading, error, search } = useTeamRegistry(
    '',
    config.getTeamRegistryURI(),
  );
  const { terminalHeight, staticExtraHeight } = useUIState();
  const [selectedTeam, setSelectedTeam] = useState<RegistryTeam | null>(null);

  const items: TeamListItem[] = useMemo(
    () =>
      teams.map((team) => ({
        key: team.id,
        label: team.displayName,
        description: team.description,
        team,
      })),
    [teams],
  );

  const handleSelect = useCallback((item: TeamListItem) => {
    setSelectedTeam(item.team);
  }, []);

  const handleBack = useCallback(() => {
    setSelectedTeam(null);
  }, []);

  const handleInstallAction = useCallback(
    async (team: RegistryTeam) => {
      await onInstall?.(team);
      // Go back to list view after install
      setSelectedTeam(null);
    },
    [onInstall],
  );

  const renderItem = useCallback(
    (item: TeamListItem, isActive: boolean, _labelWidth: number) => {
      const isInstalled = installedTeams.some((t) => t.name === item.team.name);
      const providers = Array.from(
        new Set(item.team.agents.map((a) => a.provider || 'gemini')),
      ).sort();

      return (
        <Box flexDirection="column" width="100%" marginBottom={1}>
          <Box flexDirection="row" width="100%" justifyContent="space-between">
            <Box flexDirection="row" flexShrink={1} minWidth={0}>
              <Box width={2} flexShrink={0}>
                <Text
                  color={isActive ? theme.status.success : theme.text.secondary}
                >
                  {isActive ? '● ' : '  '}
                </Text>
              </Box>
              <Box flexShrink={0}>
                <Text
                  bold={isActive}
                  color={isActive ? theme.status.success : theme.text.primary}
                >
                  {item.label}
                </Text>
              </Box>
              <Box flexShrink={0} marginX={1}>
                <Text color={theme.text.secondary}>|</Text>
              </Box>
              {isInstalled && (
                <Box marginRight={1} flexShrink={0}>
                  <Text color={theme.status.success}>[Installed]</Text>
                </Box>
              )}
              <Box flexShrink={1} minWidth={0}>
                <Text color={theme.text.secondary} wrap="truncate-end">
                  {item.description}
                </Text>
              </Box>
            </Box>
            <Box flexShrink={0} marginLeft={2} width={8} flexDirection="row">
              <Text color={theme.status.warning}>⭐</Text>
              <Text
                color={isActive ? theme.status.success : theme.text.secondary}
              >
                {' '}
                {item.team.stars || 0}
              </Text>
            </Box>
          </Box>
          <Box marginLeft={2} flexDirection="row" alignItems="center">
            <Text color={theme.text.secondary} italic>
              {item.team.agents.length} agent
              {item.team.agents.length === 1 ? '' : 's'}{' '}
            </Text>
            <Box marginLeft={1} flexDirection="row">
              {providers.map((p) => (
                <Box key={p} marginRight={1}>
                  <ProviderTag provider={p} />
                </Box>
              ))}
            </Box>
          </Box>
        </Box>
      );
    },
    [installedTeams],
  );

  const header = useMemo(
    () => (
      <Box flexDirection="row" justifyContent="space-between" width="100%">
        <Box flexShrink={1}>
          <Text color={theme.text.secondary} wrap="truncate">
            Browse and search Agent Teams from the registry.
          </Text>
        </Box>
        <Box flexShrink={0} marginLeft={2}>
          <Text color={theme.text.secondary}>
            {installedTeams.length > 0 &&
              `${installedTeams.length} teams installed`}
          </Text>
        </Box>
      </Box>
    ),
    [installedTeams.length],
  );

  const footer = useCallback(
    ({
      startIndex,
      endIndex,
      totalVisible,
    }: {
      startIndex: number;
      endIndex: number;
      totalVisible: number;
    }) => (
      <Text color={theme.text.secondary}>
        ({startIndex + 1}-{endIndex}) / {totalVisible}
      </Text>
    ),
    [],
  );

  const maxItemsToShow = useMemo(() => {
    const staticHeight = 10;
    const availableTerminalHeight = terminalHeight - staticExtraHeight;
    const remainingHeight = Math.max(0, availableTerminalHeight - staticHeight);
    const itemHeight = 3; // Increased due to multi-line rendering
    return Math.max(4, Math.floor(remainingHeight / itemHeight));
  }, [terminalHeight, staticExtraHeight]);

  if (loading && items.length === 0) {
    return (
      <Box padding={1}>
        <Text color={theme.text.secondary}>Loading Agent Teams...</Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box padding={1} flexDirection="column">
        <Text color={theme.status.error}>Error loading teams:</Text>
        <Text color={theme.text.secondary}>{error}</Text>
      </Box>
    );
  }

  return (
    <>
      <Box
        display={selectedTeam ? 'none' : 'flex'}
        flexDirection="column"
        width="100%"
        height="100%"
      >
        <SearchableList<TeamListItem>
          title="Browse Agent Teams"
          items={items}
          onSelect={handleSelect}
          onClose={onClose || (() => {})}
          searchPlaceholder="Search agent teams"
          renderItem={renderItem}
          header={header}
          footer={footer}
          maxItemsToShow={maxItemsToShow}
          useSearch={useRegistrySearch}
          onSearch={search}
          resetSelectionOnItemsChange={true}
          isFocused={!selectedTeam}
        />
      </Box>
      {selectedTeam && (
        <TeamDetailsView
          team={selectedTeam}
          onBack={handleBack}
          onInstall={async () => {
            await handleInstallAction(selectedTeam);
          }}
          isInstalled={installedTeams.some((t) => t.name === selectedTeam.name)}
        />
      )}
    </>
  );
}
