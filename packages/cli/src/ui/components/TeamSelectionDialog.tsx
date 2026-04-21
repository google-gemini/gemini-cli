/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useCallback, useMemo, useState } from 'react';
import { Box, Text } from 'ink';
import {
  type TeamDefinition,
  type AgentDefinition,
  installRegistryTeam,
} from '@google/gemini-cli-core';
import { theme } from '../semantic-colors.js';
import { DescriptiveRadioButtonSelect } from './shared/DescriptiveRadioButtonSelect.js';
import { useKeypress } from '../hooks/useKeypress.js';
import { useUIActions } from '../contexts/UIActionsContext.js';
import { TeamRegistryView } from './views/TeamRegistryView.js';
import { useConfig } from '../contexts/ConfigContext.js';
import { ProviderTag } from './shared/ProviderTag.js';

interface TeamSelectionDialogProps {
  teams: TeamDefinition[];
  onSelect: (teamName: string | undefined) => void;
  onRefreshTeams?: () => void | Promise<void>;
}

const MultiModelBadge: React.FC = () => (
  <Box marginLeft={1}>
    <Text color={theme.text.secondary} italic>
      Multi-Model
    </Text>
  </Box>
);

function getProviderTags(agents: AgentDefinition[]): React.ReactNode {
  const providers = new Set<string>();
  for (const agent of agents) {
    if (agent.kind === 'external') {
      providers.add(agent.provider);
    } else {
      providers.add('gemini');
    }
  }

  const sortedProviders = Array.from(providers).sort();
  const isMulti = providers.size > 1;

  return (
    <Box flexDirection="row" alignItems="center">
      <Box flexDirection="row">
        {sortedProviders.map((p, i) => (
          <Box key={p} marginLeft={i === 0 ? 0 : 1}>
            <ProviderTag provider={p} />
          </Box>
        ))}
      </Box>
      {isMulti && <MultiModelBadge />}
    </Box>
  );
}

export function TeamSelectionDialog({
  teams: discoveredTeams,
  onSelect,
  onRefreshTeams,
}: TeamSelectionDialogProps): React.JSX.Element {
  const uiActions = useUIActions();
  const config = useConfig();
  const [view, setView] = useState<'select' | 'marketplace'>('select');

  useKeypress(
    () => {
      setView('select');
      return true;
    },
    { isActive: view !== 'select' },
  );

  const options = useMemo(() => {
    const list = discoveredTeams.map((team) => ({
      value: team.name,
      title: team.displayName || team.name,
      description: team.description,
      key: team.name,
      titleSuffix: getProviderTags(team.agents),
    }));

    // Curated "Marketplace" Teams (Hardcoded MVP)
    const polyglotTeam: TeamDefinition = {
      name: 'curated-polyglot',
      displayName: 'The Polyglot Team',
      description:
        'Advanced multi-model orchestration with Gemini, Claude Code, and Codex.',
      instructions: 'Orchestrate across multiple specialized models.',
      agents: [
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        {
          kind: 'local',
          name: 'gemini-expert',
          description: 'Gemini Expert',
          inputConfig: { type: 'object', properties: {}, required: [] },
        } as unknown as AgentDefinition,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        {
          kind: 'external',
          name: 'claude-coder',
          provider: 'claude-code',
          description: 'Claude Coder',
          inputConfig: { type: 'object', properties: {}, required: [] },
        } as unknown as AgentDefinition,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        {
          kind: 'external',
          name: 'codex-architect',
          provider: 'codex',
          description: 'Codex Architect',
          inputConfig: { type: 'object', properties: {}, required: [] },
        } as unknown as AgentDefinition,
      ],
    };

    list.push({
      value: polyglotTeam.name,
      title: `${polyglotTeam.displayName} (Curated)`,
      description: polyglotTeam.description,
      key: polyglotTeam.name,
      titleSuffix: getProviderTags(polyglotTeam.agents),
    });

    list.push({
      value: 'none',
      title: 'No Team',
      description: 'Continue with standard Gemini CLI experience',
      key: 'none',
      titleSuffix: undefined,
    });

    list.push({
      value: 'marketplace',
      title: 'Browse Agent Teams',
      description: 'Discover and install teams from the community',
      key: 'marketplace',
      titleSuffix: undefined,
    });

    list.push({
      value: 'create',
      title: 'Create Team',
      description: 'Define your own agent team and orchestration instructions',
      key: 'create',
      titleSuffix: undefined,
    });

    return list;
  }, [discoveredTeams]);

  const handleSelect = useCallback(
    (value: string) => {
      if (value === 'none') {
        onSelect(undefined);
      } else if (value === 'marketplace') {
        setView('marketplace');
      } else if (value === 'create') {
        uiActions.setIsTeamCreatorActive(true);
        onSelect(undefined);
      } else {
        onSelect(value);
      }
    },
    [onSelect, uiActions],
  );

  const handleInstallTeam = useCallback(
    async (registryTeam: any) => {
      try {
        const targetDir = config.storage.getProjectTeamsDir();
        await installRegistryTeam(registryTeam, targetDir);
        await onRefreshTeams?.();
        // After installation, we go back to selection screen
        setView('select');
      } catch (error) {
        // Errors are currently handled by the UI feedback system via coreEvents if they bubble up
      }
    },
    [config, onRefreshTeams],
  );

  if (view === 'marketplace') {
    return (
      <Box
        borderStyle="round"
        borderColor={theme.border.default}
        flexDirection="column"
        padding={0}
        width="100%"
        height="100%"
      >
        <TeamRegistryView
          installedTeams={discoveredTeams}
          onInstall={handleInstallTeam}
          onClose={() => setView('select')}
        />
      </Box>
    );
  }

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
