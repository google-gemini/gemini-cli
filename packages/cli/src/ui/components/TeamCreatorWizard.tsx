/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useState, useMemo, useCallback } from 'react';
import { Box, Text, useStdin } from 'ink';
import {
  type ScaffoldTeamAgent,
  scaffoldTeam,
} from '@google/gemini-cli-core';
import { theme } from '../semantic-colors.js';
import { TextInput } from './shared/TextInput.js';
import { useTextBuffer } from './shared/text-buffer.js';
import { BaseSelectionList } from './shared/BaseSelectionList.js';
import { DialogFooter } from './shared/DialogFooter.js';
import { useConfig } from '../contexts/ConfigContext.js';
import { useKeypress } from '../hooks/useKeypress.js';
import { Command } from '../key/keyMatchers.js';
import { useKeyMatchers } from '../hooks/useKeyMatchers.js';
import { type SelectionListItem } from '../hooks/useSelectionList.js';
import { formatCommand } from '../key/keybindingUtils.js';
import { ProviderTag, PROVIDER_COLORS } from './shared/ProviderTag.js';

interface TeamCreatorWizardProps {
  onComplete: () => void;
  onCancel: () => void;
}

type WizardStep =
  | 'identity'
  | 'roster'
  | 'objective'
  | 'confirmation'
  | 'success';

const EXTERNAL_TEMPLATES: RosterListItem[] = [
  {
    name: 'claude-coder',
    kind: 'external',
    provider: 'claude-code',
    description: 'Expert Claude coder focused on direct action.',
    logoColor: PROVIDER_COLORS['claude-code'],
  },
  {
    name: 'codex-architect',
    kind: 'external',
    provider: 'codex',
    description: 'Specialized code generation and architectural patterns.',
    logoColor: PROVIDER_COLORS['codex'],
  },
  {
    name: 'antigravity-creative',
    kind: 'external',
    provider: 'antigravity',
    description: 'Creative problem solving and unconventional solutions.',
    logoColor: PROVIDER_COLORS['antigravity'],
  },
  {
    name: 'gemma-helper',
    kind: 'external',
    provider: 'gemma',
    description: 'Lightweight and efficient general purpose assistant.',
    logoColor: PROVIDER_COLORS['gemma'],
  },
];

interface RosterListItem {
  name: string;
  kind: 'local' | 'external';
  provider?: string;
  description?: string;
  sourcePath?: string;
  logo?: string;
  logoColor?: string;
}

export function TeamCreatorWizard({
  onComplete,
  onCancel,
}: TeamCreatorWizardProps): React.JSX.Element {
  const config = useConfig();
  const keyMatchers = useKeyMatchers();
  const [step, setStep] = useState<WizardStep>('identity');
  const [teamName, setTeamName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState('');
  const [selectedAgents, setSelectedAgents] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdPath, setCreatedPath] = useState<string | null>(null);
  const [rosterMode] = useState<'list' | 'action'>('list');

  const localAgents = useMemo(
    () =>
      config
        ?.getAgentRegistry()
        .getAllDiscoveredDefinitions()
        .filter((a) => a.kind === 'local') || [],
    [config],
  );

  const allAvailableAgents = useMemo((): RosterListItem[] => {
    const local: RosterListItem[] = localAgents.map((a) => {
      let logo = '✦'; // Default Gemini Icon
      let logoColor = PROVIDER_COLORS['gemini'];

      if (a.name === 'codebase-investigator') {
        logo = '🔍';
        logoColor = '#87D7D7'; // Cyan
      } else if (a.name === 'cli-help') {
        logo = '󰞋';
        logoColor = '#FBBC04'; // Yellow
      } else if (a.name === 'generalist') {
        logoColor = '#4285F4'; // Google Blue
      }

      return {
        name: a.name,
        kind: 'local' as const,
        description: a.description,
        sourcePath: (a as any).sourcePath,
        logo,
        logoColor,
      };
    });

    const external: RosterListItem[] = EXTERNAL_TEMPLATES;

    return [...local, ...external];
  }, [localAgents]);

  const teamProviders = useMemo(() => {
    const providers = new Set<string>();
    for (const name of selectedAgents) {
      const agent = allAvailableAgents.find((a) => a.name === name);
      if (agent?.provider) {
        providers.add(agent.provider);
      } else {
        providers.add('gemini');
      }
    }
    return Array.from(providers).sort();
  }, [selectedAgents, allAvailableAgents]);

  const handleNext = useCallback(() => {
    if (step === 'identity') {
      if (!teamName || !displayName) {
        setError('Team ID and Display Name are required.');
        return;
      }
      setStep('roster');
    } else if (step === 'roster') {
      setStep('objective');
    } else if (step === 'objective') {
      if (!instructions) {
        setError('Team mission instructions are required.');
        return;
      }
      setStep('confirmation');
    } else if (step === 'confirmation') {
      void handleSubmit();
    }
  }, [step, teamName, displayName, instructions]);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      const agents: ScaffoldTeamAgent[] = Array.from(selectedAgents).map(
        (name) => {
          const agent = allAvailableAgents.find((a) => a.name === name)!;
          return {
            name,
            kind: agent.kind,
            provider: agent.provider,
            description: agent.description,
            sourcePath: agent.sourcePath,
          };
        },
      );

      const path = await scaffoldTeam({
        name: teamName,
        displayName,
        description,
        instructions,
        agents,
        targetDir: config.storage.getProjectTeamsDir(),
      });

      setCreatedPath(path);
      setStep('success');
    } catch (e: any) {
      setError(e.message || 'Failed to create team.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBack = useCallback(() => {
    if (step === 'roster') setStep('identity');
    else if (step === 'objective') setStep('roster');
    else if (step === 'confirmation') setStep('objective');
  }, [step]);

  const nameBuffer = useTextBuffer({
    initialText: teamName,
    viewport: { width: 100, height: 100 },
    onChange: setTeamName,
  });
  const displayNameBuffer = useTextBuffer({
    initialText: displayName,
    viewport: { width: 100, height: 100 },
    onChange: setDisplayName,
  });
  const descriptionBuffer = useTextBuffer({
    initialText: description,
    viewport: { width: 100, height: 100 },
    onChange: setDescription,
  });
  const instructionsBuffer = useTextBuffer({
    initialText: instructions,
    viewport: { width: 100, height: 100 },
    onChange: setInstructions,
  });

  const { stdin } = useStdin();
  useKeypress(
    (key) => {
      if (keyMatchers[Command.ESCAPE](key)) {
        onCancel();
        return true;
      }
      if (key.name === 'b' && !stdin.isPaused()) {
        handleBack();
        return true;
      }
      return false;
    },
    { isActive: step !== 'identity' && step !== 'success' },
  );

  const handleToggleAgent = useCallback((name: string) => {
    setSelectedAgents((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  if (step === 'identity') {
    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={theme.border.default}
        padding={1}
        width="100%"
      >
        <Text bold color={theme.text.primary}>
          Step 1: Team Identity
        </Text>
        <Box marginTop={1} flexDirection="column">
          <Text color={theme.text.secondary}>Unique Team ID (slug):</Text>
          <Box borderStyle="single" borderColor={theme.ui.comment} paddingX={1}>
            <TextInput buffer={nameBuffer} placeholder="e.g. frontend-team" />
          </Box>

          <Box marginTop={1}>
            <Text color={theme.text.secondary}>Display Name:</Text>
          </Box>
          <Box borderStyle="single" borderColor={theme.ui.comment} paddingX={1}>
            <TextInput
              buffer={displayNameBuffer}
              placeholder="e.g. Frontend Experts"
            />
          </Box>

          <Box marginTop={1}>
            <Text color={theme.text.secondary}>Description (Optional):</Text>
          </Box>
          <Box borderStyle="single" borderColor={theme.ui.comment} paddingX={1}>
            <TextInput
              buffer={descriptionBuffer}
              placeholder="Briefly describe the team's purpose"
              onSubmit={handleNext}
            />
          </Box>
        </Box>

        {error && (
          <Box marginTop={1}>
            <Text color={theme.status.error}>Error: {error}</Text>
          </Box>
        )}

        <DialogFooter
          primaryAction="Enter to continue"
          cancelAction="Esc to cancel"
        />
      </Box>
    );
  }

  if (step === 'roster') {
    const items: SelectionListItem<RosterListItem>[] = allAvailableAgents.map(
      (a) => ({
        key: a.name,
        label: a.name,
        value: a,
      }),
    );

    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={theme.border.default}
        padding={1}
        width="100%"
      >
        <Text bold color={theme.text.primary}>
          Step 2: Team Roster
        </Text>
        <Box marginBottom={1}>
          <Text color={theme.text.secondary}>
            Select the agents that will participate in this team.
          </Text>
        </Box>

        <Box height={12} width="100%">
          <BaseSelectionList<RosterListItem>
            items={items}
            onSelect={(value) => handleToggleAgent(value.name)}
            renderItem={(item, context) => {
              const value = item.value;
              return (
                <Box flexDirection="column" width="100%">
                  <Box flexDirection="row" width="100%">
                    <Box width={2} flexShrink={0}>
                      <Text color={theme.text.accent}>
                        {selectedAgents.has(value.name) ? '☑' : '☐'}
                      </Text>
                    </Box>
                    <Box flexDirection="row" flexShrink={0}>
                      <Text
                        color={
                          context.isSelected && rosterMode === 'list'
                            ? theme.text.accent
                            : theme.text.primary
                        }
                      >
                        {' '}
                        {value.logo && (
                          <Text color={value.logoColor || theme.text.accent}>
                            {value.logo}{' '}
                          </Text>
                        )}
                        {value.name}
                      </Text>
                      <Box marginLeft={1}>
                        <ProviderTag provider={value.provider || 'gemini'} />
                      </Box>
                    </Box>
                    {value.description && (
                      <Text color={theme.text.secondary} italic wrap="truncate">
                        {'    '}
                        {value.description}
                      </Text>
                    )}
                  </Box>
                </Box>
              );
            }}
            isFocused={rosterMode === 'list'}
          />
        </Box>

        <Box
          marginTop={1}
        >
          <Text
            bold
            color={
              rosterMode === 'action' ? theme.text.accent : theme.text.primary
            }
          >
            {rosterMode === 'action' ? '> ' : '  '}
            [ Done - Continue to Objective ]
          </Text>
        </Box>

        <DialogFooter
          primaryAction={
            rosterMode === 'list' ? 'Enter to toggle agent' : 'Enter to continue'
          }
          navigationActions={
            rosterMode === 'list' ? 'Tab to continue' : 'Tab to select agents'
          }
          extraParts={['[B]ack to Step 1']}
        />
      </Box>
    );
  }

  if (step === 'objective') {
    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={theme.border.default}
        padding={1}
        width="100%"
      >
        <Text bold color={theme.text.primary}>
          Step 3: Team Objective
        </Text>
        <Box marginTop={1} flexDirection="column">
          <Text color={theme.text.secondary}>
            Define what this team does and how it should work.
          </Text>
          {selectedAgents.size > 0 && (
            <Box marginTop={1} flexDirection="column">
              <Box flexDirection="row" flexWrap="wrap">
                <Text color={theme.text.secondary}>Providers: </Text>
                {teamProviders.map((p, i) => (
                  <Box key={p} marginLeft={i === 0 ? 0 : 1}>
                    <ProviderTag provider={p} />
                  </Box>
                ))}
              </Box>
              <Box marginTop={1} flexDirection="row" flexWrap="wrap">
                <Text color={theme.ui.comment}>Referencing agents: </Text>
                {Array.from(selectedAgents).map((name, i) => {
                  const agent = allAvailableAgents.find((a) => a.name === name);
                  return (
                    <Box key={name} flexDirection="row">
                      {agent?.logo && (
                        <Text color={agent.logoColor || theme.text.accent}>
                          {agent.logo}{' '}
                        </Text>
                      )}
                      <Text color={theme.ui.comment}>
                        @{name}{' '}
                      </Text>
                      <ProviderTag provider={agent?.provider || 'gemini'} />
                      {i < selectedAgents.size - 1 && (
                        <Text color={theme.ui.comment}>, </Text>
                      )}
                    </Box>
                  );
                })}
              </Box>
            </Box>
          )}
          <Box
            marginTop={1}
            borderStyle="single"
            borderColor={theme.ui.comment}
            paddingX={1}
          >
            <TextInput buffer={instructionsBuffer} onSubmit={handleNext} />
          </Box>
        </Box>

        {error && (
          <Box marginTop={1}>
            <Text color={theme.status.error}>Error: {error}</Text>
          </Box>
        )}

        <DialogFooter
          primaryAction="Enter to continue"
          navigationActions={`Tab to go back · ${formatCommand(Command.OPEN_EXTERNAL_EDITOR)} for full editor`}
          cancelAction="Esc to cancel"
        />
      </Box>
    );
  }

  if (step === 'confirmation') {
    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={theme.border.default}
        padding={1}
        width="100%"
      >
        <Text bold color={theme.text.primary}>
          Step 4: Confirm Team Configuration
        </Text>
        <Box marginTop={1} flexDirection="column">
          <Text color={theme.text.secondary}>
            Name:{' '}
            <Text color={theme.text.primary}>
              {displayName} ({teamName})
            </Text>
          </Text>
          <Box marginTop={1}>
            <Text color={theme.text.secondary}>
              Description: <Text color={theme.text.primary}>{description}</Text>
            </Text>
          </Box>
          <Box marginTop={1}>
            <Text color={theme.text.secondary}>Roster:</Text>
          </Box>
          {Array.from(selectedAgents).map((name) => {
            const agent = allAvailableAgents.find((a) => a.name === name);
            return (
              <Box key={name} flexDirection="row">
                <Text color={theme.text.primary}>- </Text>
                {agent?.logo && (
                  <Text color={agent.logoColor || theme.text.accent}>
                    {agent.logo}{' '}
                  </Text>
                )}
                <Text color={theme.text.primary}>
                  {name}{' '}
                </Text>
                <ProviderTag provider={agent?.provider || 'gemini'} />
              </Box>
            );
          })}
          {selectedAgents.size === 0 && (
            <Text color={theme.status.warning} italic>
              No agents selected (Gemini CLI expert will be used by default)
            </Text>
          )}
        </Box>

        {isSubmitting && (
          <Box marginTop={1}>
            <Text color={theme.text.accent}>Creating team...</Text>
          </Box>
        )}

        {error && (
          <Box marginTop={1}>
            <Text color={theme.status.error}>Error: {error}</Text>
          </Box>
        )}

        <DialogFooter
          primaryAction="Enter to create team"
          cancelAction="Esc to cancel"
          extraParts={['[B]ack to Objective']}
        />
      </Box>
    );
  }

  if (step === 'success') {
    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={theme.status.success}
        padding={1}
        width="100%"
      >
        <Text bold color={theme.status.success}>
          Success! Team Created
        </Text>
        <Box marginTop={1} flexDirection="column">
          <Text color={theme.text.primary}>
            Team {displayName} has been saved to:
          </Text>
          <Text color={theme.text.accent}>{createdPath}</Text>
          <Box marginTop={1}>
            <Text color={theme.text.secondary}>
              You can now select this team from the main team selection menu.
            </Text>
          </Box>
        </Box>
        <Box marginTop={1}>
          <Text color={theme.text.primary}>[Enter] Finish</Text>
        </Box>
      </Box>
    );
  }

  return <Box />;
}
