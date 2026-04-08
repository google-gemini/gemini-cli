/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useState, useMemo, useCallback, useEffect } from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { useKeypress } from '../hooks/useKeypress.js';
import { Command } from '../key/keyMatchers.js';
import { useKeyMatchers } from '../hooks/useKeyMatchers.js';
import { BaseSelectionList } from './shared/BaseSelectionList.js';
import type { SelectionListItem } from '../hooks/useSelectionList.js';
import { DialogFooter } from './shared/DialogFooter.js';
import {
  type Config,
  type InboxSkill,
  type InboxSkillDestination,
  getErrorMessage,
  listInboxSkills,
  moveInboxSkill,
  dismissInboxSkill,
} from '@google/gemini-cli-core';

type Phase = 'list' | 'action';

interface DestinationChoice {
  destination: InboxSkillDestination | 'dismiss';
  label: string;
  description: string;
}

const DESTINATION_CHOICES: DestinationChoice[] = [
  {
    destination: 'global',
    label: 'Global',
    description: '~/.gemini/skills — available in all projects',
  },
  {
    destination: 'project',
    label: 'Project',
    description: '.gemini/skills — available in this workspace',
  },
  {
    destination: 'dismiss',
    label: 'Dismiss',
    description: 'Delete from inbox',
  },
];

function formatDate(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return isoString;
  }
}

interface SkillInboxDialogProps {
  config: Config;
  onClose: () => void;
  onReloadSkills: () => Promise<void>;
}

export const SkillInboxDialog: React.FC<SkillInboxDialogProps> = ({
  config,
  onClose,
  onReloadSkills,
}) => {
  const keyMatchers = useKeyMatchers();
  const isTrustedFolder = config.isTrustedFolder();
  const [phase, setPhase] = useState<Phase>('list');
  const [skills, setSkills] = useState<InboxSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSkill, setSelectedSkill] = useState<InboxSkill | null>(null);
  const [feedback, setFeedback] = useState<{
    text: string;
    isError: boolean;
  } | null>(null);

  // Load inbox skills on mount
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await listInboxSkills(config);
        if (!cancelled) {
          setSkills(result);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setSkills([]);
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [config]);

  const skillItems: Array<SelectionListItem<InboxSkill>> = useMemo(
    () =>
      skills.map((skill) => ({
        key: skill.dirName,
        value: skill,
      })),
    [skills],
  );

  const destinationItems: Array<SelectionListItem<DestinationChoice>> = useMemo(
    () =>
      DESTINATION_CHOICES.map((choice) => {
        if (choice.destination === 'project' && !isTrustedFolder) {
          return {
            key: choice.destination,
            value: {
              ...choice,
              description:
                '.gemini/skills — unavailable until this workspace is trusted',
            },
            disabled: true,
          };
        }

        return {
          key: choice.destination,
          value: choice,
        };
      }),
    [isTrustedFolder],
  );

  const handleSelectSkill = useCallback((skill: InboxSkill) => {
    setSelectedSkill(skill);
    setFeedback(null);
    setPhase('action');
  }, []);

  const handleSelectDestination = useCallback(
    (choice: DestinationChoice) => {
      if (!selectedSkill) return;

      if (choice.destination === 'project' && !config.isTrustedFolder()) {
        setFeedback({
          text: 'Project skills are unavailable until this workspace is trusted.',
          isError: true,
        });
        return;
      }

      setFeedback(null);

      void (async () => {
        try {
          let result: { success: boolean; message: string };
          if (choice.destination === 'dismiss') {
            result = await dismissInboxSkill(config, selectedSkill.dirName);
          } else {
            result = await moveInboxSkill(
              config,
              selectedSkill.dirName,
              choice.destination,
            );
          }

          setFeedback({ text: result.message, isError: !result.success });

          if (!result.success) {
            return;
          }

          // Remove the skill from the local list.
          setSkills((prev) =>
            prev.filter((skill) => skill.dirName !== selectedSkill.dirName),
          );
          setSelectedSkill(null);
          setPhase('list');

          if (choice.destination === 'dismiss') {
            return;
          }

          try {
            await onReloadSkills();
          } catch (error) {
            setFeedback({
              text: `${result.message} Failed to reload skills: ${getErrorMessage(error)}`,
              isError: true,
            });
          }
        } catch (error) {
          const operation =
            choice.destination === 'dismiss'
              ? 'dismiss skill'
              : 'install skill';
          setFeedback({
            text: `Failed to ${operation}: ${getErrorMessage(error)}`,
            isError: true,
          });
        }
      })();
    },
    [config, selectedSkill, onReloadSkills],
  );

  useKeypress(
    (key) => {
      if (keyMatchers[Command.ESCAPE](key)) {
        if (phase === 'action') {
          setPhase('list');
          setSelectedSkill(null);
          setFeedback(null);
        } else {
          onClose();
        }
        return true;
      }
      return false;
    },
    { isActive: true, priority: true },
  );

  if (loading) {
    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={theme.border.default}
        paddingX={2}
        paddingY={1}
      >
        <Text>Loading inbox…</Text>
      </Box>
    );
  }

  if (skills.length === 0 && !feedback) {
    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={theme.border.default}
        paddingX={2}
        paddingY={1}
      >
        <Text bold>Skill Inbox</Text>
        <Box marginTop={1}>
          <Text color={theme.text.secondary}>
            No extracted skills in inbox.
          </Text>
        </Box>
        <DialogFooter primaryAction="Esc to close" cancelAction="" />
      </Box>
    );
  }

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.border.default}
      paddingX={2}
      paddingY={1}
      width="100%"
    >
      {phase === 'list' ? (
        <>
          <Text bold>
            Skill Inbox ({skills.length} skill{skills.length !== 1 ? 's' : ''})
          </Text>
          <Text color={theme.text.secondary}>
            Skills extracted from past sessions. Select one to move or dismiss.
          </Text>

          <Box flexDirection="column" marginTop={1}>
            <BaseSelectionList<InboxSkill>
              items={skillItems}
              onSelect={handleSelectSkill}
              isFocused={true}
              showNumbers={true}
              showScrollArrows={true}
              maxItemsToShow={8}
              renderItem={(item, { titleColor }) => (
                <Box flexDirection="column" minHeight={2}>
                  <Text color={titleColor} bold>
                    {item.value.name}
                  </Text>
                  <Box flexDirection="row">
                    <Text color={theme.text.secondary} wrap="wrap">
                      {item.value.description}
                    </Text>
                    {item.value.extractedAt && (
                      <Text color={theme.text.secondary}>
                        {' · '}
                        {formatDate(item.value.extractedAt)}
                      </Text>
                    )}
                  </Box>
                </Box>
              )}
            />
          </Box>

          {feedback && (
            <Box marginTop={1}>
              <Text
                color={
                  feedback.isError ? theme.status.error : theme.status.success
                }
              >
                {feedback.isError ? '✗ ' : '✓ '}
                {feedback.text}
              </Text>
            </Box>
          )}

          <DialogFooter
            primaryAction="Enter to select"
            cancelAction="Esc to close"
          />
        </>
      ) : (
        <>
          <Text bold>Move &quot;{selectedSkill?.name}&quot;</Text>
          <Text color={theme.text.secondary}>
            Choose where to install this skill.
          </Text>

          <Box flexDirection="column" marginTop={1}>
            <BaseSelectionList<DestinationChoice>
              items={destinationItems}
              onSelect={handleSelectDestination}
              isFocused={true}
              showNumbers={true}
              renderItem={(item, { titleColor }) => (
                <Box flexDirection="column" minHeight={2}>
                  <Text color={titleColor} bold>
                    {item.value.label}
                  </Text>
                  <Text color={theme.text.secondary}>
                    {item.value.description}
                  </Text>
                </Box>
              )}
            />
          </Box>

          {feedback && (
            <Box marginTop={1}>
              <Text
                color={
                  feedback.isError ? theme.status.error : theme.status.success
                }
              >
                {feedback.isError ? '✗ ' : '✓ '}
                {feedback.text}
              </Text>
            </Box>
          )}

          <DialogFooter
            primaryAction="Enter to confirm"
            cancelAction="Esc to go back"
          />
        </>
      )}
    </Box>
  );
};
