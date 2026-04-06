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
  type EditorType,
} from '@google/gemini-cli-core';
import { theme } from '../semantic-colors.js';
import { TextInput } from './shared/TextInput.js';
import { useTextBuffer } from './shared/text-buffer.js';
import { BaseSelectionList } from './shared/BaseSelectionList.js';
import { DialogFooter } from './shared/DialogFooter.js';
import { useConfig } from '../contexts/ConfigContext.js';
import { useUIActions } from '../contexts/UIActionsContext.js';
import { useKeypress, type Key } from '../hooks/useKeypress.js';
import { Command } from '../key/keyMatchers.js';
import { useKeyMatchers } from '../hooks/useKeyMatchers.js';
import { type SelectionListItem } from '../hooks/useSelectionList.js';
import { useSettingsStore } from '../contexts/SettingsContext.js';
import { formatCommand } from '../key/keybindingUtils.js';

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

const PROVIDER_COLORS: Record<string, string> = {
  'claude-code': '#C15F3C', // Claude Orange (Exact)
  codex: '#FFFFFF', // Codex White
  gemini: '#A855F7', // Gemini Purple
  antigravity: '#93C5FD', // Antigravity Light Blue
  gemma: '#60A5FA', // Gemma Blue
};

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
  kind: 'local' | 'external' | 'meta';
  provider?: string;
  description?: string;
  sourcePath?: string;
  logo?: string;
  logoColor?: string;
}

function ProviderTag({ provider }: { provider: string }) {
  const label =
    provider === 'claude-code'
      ? 'Claude Code'
      : provider === 'codex'
        ? 'Codex'
        : provider === 'antigravity'
          ? 'Antigravity'
          : provider === 'gemma'
            ? 'Gemma'
            : 'Gemini CLI';
  const color = PROVIDER_COLORS[provider] || theme.ui.comment;
  return (
    <Text color={color} bold>
      [{label}]
    </Text>
  );
}

export function TeamCreatorWizard({
  onComplete,
  onCancel,
}: TeamCreatorWizardProps): React.JSX.Element {
  const config = useConfig();
  const { handleTeamSelect } = useUIActions();
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
  const [rosterMode, setRosterMode] = useState<'list' | 'action'>('list');

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
        sourcePath: a.metadata?.filePath,
        logo: !a.metadata?.filePath ? logo : undefined, // Only for built-ins
        logoColor: !a.metadata?.filePath ? logoColor : undefined,
      };
    });
    const external: RosterListItem[] = EXTERNAL_TEMPLATES.map((a) => ({
      name: a.name,
      kind: 'external' as const,
      provider: a.provider,
      description: a.description,
      logo: a.logo,
      logoColor: a.logoColor,
    }));
    return [...local, ...external];
  }, [localAgents]);

  const { settings } = useSettingsStore();
  const { stdin, setRawMode } = useStdin();
  const getPreferredEditor = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    () => settings.merged.general.preferredEditor as EditorType,
    [settings.merged.general.preferredEditor],
  );

  const handleNext = useCallback(() => {
    if (step === 'identity') {
      if (!teamName.trim()) {
        setError('Slug is required');
        return;
      }
      if (!displayName.trim()) {
        setError('Display Name is required');
        return;
      }
      setError(null);
      setStep('roster');
    } else if (step === 'roster') {
      setStep('objective');
    } else if (step === 'objective') {
      if (!instructions.trim()) {
        setError('Objective/Instructions are required');
        return;
      }
      setError(null);
      setStep('confirmation');
    }
  }, [step, teamName, displayName, instructions]);

  const handleBack = useCallback(() => {
    if (step === 'roster') {
      setStep('identity');
      setRosterMode('list'); // Reset roster mode when going back
    } else if (step === 'objective') {
      setStep('roster');
    } else if (step === 'confirmation') {
      setStep('objective');
    } else if (step === 'identity') {
      onCancel();
    } else if (step === 'success') {
      onComplete();
    }
  }, [step, onCancel, onComplete]);

  const handleToggleAgent = (name: string) => {
    const next = new Set(selectedAgents);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    setSelectedAgents(next);
  };

  const handleCreate = useCallback(async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      const agentsToScaffold: ScaffoldTeamAgent[] = allAvailableAgents
        .filter((a) => selectedAgents.has(a.name) && a.kind !== 'meta')
        .map((a) => ({
          name: a.name,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
          kind: a.kind as 'local' | 'external',
          provider: a.provider,
          description: a.description,
          sourcePath: a.sourcePath,
        }));
      const path = await scaffoldTeam({
        name: teamName,
        displayName,
        description,
        instructions,
        agents: agentsToScaffold,
        targetDir: config.storage.getProjectTeamsDir(),
      });
      setCreatedPath(path);
      await config.getTeamRegistry().reload();
      setStep('success');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setIsSubmitting(false);
    }
  }, [
    allAvailableAgents,
    selectedAgents,
    teamName,
    displayName,
    description,
    instructions,
    config,
  ]);

  // Identity Step Buffers
  const nameBuffer = useTextBuffer({
    initialText: teamName,
    viewport: { width: 40, height: 1 },
    onChange: setTeamName,
    singleLine: true,
  });
  const displayNameBuffer = useTextBuffer({
    initialText: displayName,
    viewport: { width: 40, height: 1 },
    onChange: setDisplayName,
    singleLine: true,
  });
  const descBuffer = useTextBuffer({
    initialText: description,
    viewport: { width: 80, height: 1 },
    onChange: setDescription,
    singleLine: true,
  });

  // Objective Step Buffer
  const instructionsBuffer = useTextBuffer({
    initialText: instructions,
    viewport: { width: 80, height: 5 },
    onChange: setInstructions,
    stdin,
    setRawMode,
    getPreferredEditor,
  });

  const [activeIdentityField, setActiveIdentityField] = useState<0 | 1 | 2>(0);

  const handleIdentityKeyPress = useCallback(
    (key: Key) => {
      const isNext =
        keyMatchers[Command.DIALOG_NAVIGATION_DOWN](key) ||
        (key.name === 'tab' && !key.shift);
      const isPrev =
        keyMatchers[Command.DIALOG_NAVIGATION_UP](key) ||
        (key.name === 'tab' && key.shift);

      if (isNext) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        setActiveIdentityField(((activeIdentityField + 1) % 3) as 0 | 1 | 2);
        return true;
      }
      if (isPrev) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        setActiveIdentityField(((activeIdentityField + 2) % 3) as 0 | 1 | 2);
        return true;
      }
      if (keyMatchers[Command.ESCAPE](key)) {
        onCancel();
        return true;
      }
      return false;
    },
    [activeIdentityField, keyMatchers, onCancel],
  );

  // Handle Tab for "Back" and any key for success exit
  const handleGlobalKeys = useCallback(
    (key: Key) => {
      if (step === 'success') {
        if (key.sequence?.toLowerCase() === 'y') {
          void handleTeamSelect(teamName);
        }
        onComplete();
        return true;
      }
      if (key.name === 'tab') {
        if (step === 'roster') {
          setRosterMode((prev) => (prev === 'list' ? 'action' : 'list'));
          return true;
        }
        handleBack();
        return true;
      }
      return false;
    },
    [step, handleBack, onComplete, handleTeamSelect, teamName],
  );

  useKeypress(handleGlobalKeys, { isActive: true, priority: true });

  useKeypress(handleIdentityKeyPress, {
    isActive: step === 'identity',
    priority: true,
  });

  const handleRosterKeyPress = useCallback(
    (key: Key) => {
      if (key.sequence?.toLowerCase() === 'b') {
        handleBack();
        return true;
      }
      if (rosterMode === 'action') {
        if (keyMatchers[Command.RETURN](key)) {
          handleNext();
          return true;
        }
      }
      if (keyMatchers[Command.ESCAPE](key)) {
        onCancel();
        return true;
      }
      return false;
    },
    [handleNext, handleBack, onCancel, rosterMode, keyMatchers],
  );

  useKeypress(handleRosterKeyPress, {
    isActive: step === 'roster',
    priority: true,
  });

  const handleObjectiveKeyPress = useCallback(
    (key: Key) => {
      if (keyMatchers[Command.OPEN_EXTERNAL_EDITOR](key)) {
        void instructionsBuffer.openInExternalEditor();
        return true;
      }
      if (keyMatchers[Command.ESCAPE](key)) {
        onCancel();
        return true;
      }
      return false;
    },
    [instructionsBuffer, keyMatchers, onCancel],
  );

  useKeypress(handleObjectiveKeyPress, {
    isActive: step === 'objective',
    priority: true,
  });

  const handleConfirmationKeyPress = useCallback(
    (key: Key) => {
      if (keyMatchers[Command.RETURN](key)) {
        void handleCreate();
        return true;
      }
      if (keyMatchers[Command.ESCAPE](key)) {
        onCancel();
        return true;
      }
      return false;
    },
    [handleCreate, keyMatchers, onCancel],
  );

  useKeypress(handleConfirmationKeyPress, {
    isActive: step === 'confirmation' && !isSubmitting,
    priority: true,
  });

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
          <Text color={theme.text.secondary}>
            Slug Name (e.g., coding-team):
          </Text>
          <TextInput
            buffer={nameBuffer}
            focus={activeIdentityField === 0}
            onSubmit={() => setActiveIdentityField(1)}
          />

          <Box marginTop={1} flexDirection="column">
            <Text color={theme.text.secondary}>
              Display Name (e.g., The Coding Team):
            </Text>
            <TextInput
              buffer={displayNameBuffer}
              focus={activeIdentityField === 1}
              onSubmit={() => setActiveIdentityField(2)}
            />
          </Box>

          <Box marginTop={1} flexDirection="column">
            <Text color={theme.text.secondary}>Short Description:</Text>
            <TextInput
              buffer={descBuffer}
              focus={activeIdentityField === 2}
              onSubmit={handleNext}
            />
          </Box>
        </Box>
        <DialogFooter
          primaryAction="Enter to continue"
          navigationActions="Tab or ↑/↓ to switch fields"
          cancelAction="Esc to cancel"
        />
      </Box>
    );
  }

  if (step === 'roster') {
    const rosterItems: Array<SelectionListItem<RosterListItem>> =
      allAvailableAgents.map((a) => ({
        key: a.name,
        value: a,
      }));

    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={theme.border.default}
        padding={1}
        width="100%"
      >
        <Box flexDirection="row" justifyContent="space-between">
          <Text bold color={theme.text.primary}>
            Step 2: Team Roster
          </Text>
          <Box>
            <Text color={theme.text.secondary}>
              Selected: {selectedAgents.size}
            </Text>
          </Box>
        </Box>

        <Box marginTop={1} flexDirection="column">
          <Text color={theme.text.secondary}>
            {rosterMode === 'list'
              ? 'Select agents to include in your team:'
              : 'Switch back to the list if you need to select more agents:'}
          </Text>
        </Box>

        <Box marginTop={1} marginBottom={1} flexDirection="column">
          <BaseSelectionList<RosterListItem>
            items={rosterItems}
            onSelect={(item) => handleToggleAgent(item.name)}
            maxItemsToShow={5}
            showScrollArrows={true}
            isFocused={rosterMode === 'list'}
            renderItem={(item, context) => {
              const value = item.value;
              const isChecked = selectedAgents.has(value.name);
              return (
                <Box flexDirection="column" paddingLeft={1}>
                  <Box flexDirection="row">
                    <Text
                      color={
                        isChecked ? theme.status.success : theme.text.secondary
                      }
                    >
                      [{isChecked ? 'x' : ' '}]
                    </Text>
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
                    {(() => {
                      const p = value.provider || 'gemini';
                      const label =
                        p === 'claude-code'
                          ? 'Claude Code'
                          : p === 'codex'
                            ? 'Codex'
                            : p === 'antigravity'
                              ? 'Antigravity'
                              : p === 'gemma'
                                ? 'Gemma'
                                : 'Gemini CLI';
                      const color = PROVIDER_COLORS[p] || theme.ui.comment;
                      return (
                        <Text color={color} bold>
                          {' '}
                          [{label}]
                        </Text>
                      );
                    })()}
                  </Box>
                  {value.description && (
                    <Text color={theme.text.secondary} italic wrap="truncate">
                      {'    '}
                      {value.description}
                    </Text>
                  )}
                </Box>
              );
            }}
          />
        </Box>

        <Box
          paddingX={1}
          paddingY={0}
          borderStyle="round"
          borderColor={
            rosterMode === 'action' ? theme.text.accent : theme.border.default
          }
          justifyContent="center"
        >
          <Text
            bold
            color={
              rosterMode === 'action' ? theme.text.accent : theme.text.primary
            }
          >
            {rosterMode === 'action' ? '> ' : '  '}[ Done - Continue to
            Objective ]
          </Text>
        </Box>

        <DialogFooter
          primaryAction={
            rosterMode === 'list'
              ? 'Enter to toggle agent'
              : 'Enter to continue'
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
                      <Text color={theme.ui.comment}>@{name} </Text>
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
          Step 4: Confirm Team Creation
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
                <Text color={theme.text.primary}>{name} </Text>
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

        {error && (
          <Box marginTop={1}>
            <Text color={theme.status.error}>Error: {error}</Text>
          </Box>
        )}

        <Box marginTop={1}>
          {isSubmitting ? (
            <Text color={theme.text.accent}>Creating team...</Text>
          ) : (
            <DialogFooter
              primaryAction="Enter to create team"
              navigationActions="Tab to go back"
              cancelAction="Esc to cancel"
            />
          )}
        </Box>
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
          Team Created Successfully!
        </Text>
        <Box marginTop={1} flexDirection="column">
          <Text color={theme.text.primary}>
            Your new team &quot;{displayName}&quot; is now ready to use.
          </Text>
          {createdPath && (
            <Box marginTop={1}>
              <Text color={theme.text.secondary}>Created at: </Text>
              <Text color={theme.text.primary}>{createdPath}</Text>
            </Box>
          )}
        </Box>
        <Box marginTop={1}>
          <Text color={theme.text.accent}>
            Would you like to switch to this team now? (y/N)
          </Text>
        </Box>
        <Box marginTop={1}>
          <Text color={theme.text.secondary}>
            Press any other key to finish...
          </Text>
        </Box>
      </Box>
    );
  }

  return <Box />;
}
