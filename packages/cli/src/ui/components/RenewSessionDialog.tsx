/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import type { RadioSelectItem } from './shared/RadioButtonSelect.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';
import { useKeypress } from '../hooks/useKeypress.js';
import { theme } from '../semantic-colors.js';
import type { RenewSessionConfirmationResult } from '../types.js';

interface RenewSessionDialogProps {
  onComplete: (result: RenewSessionConfirmationResult) => void;
  maxSessionTurns: number;
  reason?: 'turn_limit' | 'topic_change';
}

export function RenewSessionDialog({
  onComplete,
  maxSessionTurns,
  reason = 'turn_limit',
}: RenewSessionDialogProps) {
  const isTopicChange = reason === 'topic_change';

  useKeypress(
    (key) => {
      if (key.name === 'escape') {
        onComplete({
          userSelection: isTopicChange
            ? 'continue_session'
            : 'compress_session',
        });
      }
    },
    { isActive: true },
  );

  const OPTIONS: Array<RadioSelectItem<RenewSessionConfirmationResult>> = [
    ...(isTopicChange
      ? [
          {
            label: 'Continue with current context',
            value: {
              userSelection: 'continue_session',
            } as RenewSessionConfirmationResult,
            key: 'continue_session',
          },
          {
            label: 'Compress conversation',
            value: {
              userSelection: 'compress_session',
            } as RenewSessionConfirmationResult,
            key: 'compress_session',
          },
        ]
      : [
          {
            label: 'Compress session',
            value: {
              userSelection: 'compress_session',
            } as RenewSessionConfirmationResult,
            key: 'compress_session',
          },
        ]),
    {
      label: 'Start a new session',
      value: {
        userSelection: 'new_session',
      } as RenewSessionConfirmationResult,
      key: 'new_session',
    },
  ];

  return (
    <Box width="100%" flexDirection="row">
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={theme.status.warning}
        flexGrow={1}
        marginLeft={1}
      >
        <Box paddingX={1} paddingY={0} flexDirection="column">
          <Box minHeight={1}>
            <Box minWidth={3}>
              <Text
                color={theme.status.warning}
                aria-label="Max turns reached:"
              >
                !
              </Text>
            </Box>
            <Box>
              <Text wrap="truncate-end">
                <Text color={theme.text.primary} bold>
                  {isTopicChange
                    ? 'Topic change detected'
                    : 'Turn limit reached'}
                </Text>{' '}
                {reason === 'turn_limit' && (
                  <Text color={theme.text.secondary}>
                    (current threshold: {maxSessionTurns} turns)
                  </Text>
                )}
              </Text>
            </Box>
          </Box>
          <Box marginTop={1}>
            <Box flexDirection="column">
              <Text color={theme.text.secondary}>
                {isTopicChange
                  ? 'Your query appears to be about a new topic. Would you like to start a new session?'
                  : "You've reached the configured maximum number of turns for this session. Choose whether to compress the conversation or start a new session."}
              </Text>
              <Box marginTop={1}>
                <RadioButtonSelect items={OPTIONS} onSelect={onComplete} />
              </Box>
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
