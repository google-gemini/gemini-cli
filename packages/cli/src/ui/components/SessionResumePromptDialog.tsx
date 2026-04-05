/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import type React from 'react';
import { useCallback } from 'react';
import { theme } from '../semantic-colors.js';
import {
  RadioButtonSelect,
  type RadioSelectItem,
} from './shared/RadioButtonSelect.js';
import { Colors } from '../colors.js';
import { formatRelativeTime } from '../../utils/sessionUtils.js';
import type { SessionResumePromptRequest } from '../contexts/UIStateContext.js';

interface SessionResumePromptDialogProps {
  request: SessionResumePromptRequest;
  onSelect: (resume: boolean) => void;
}

export const SessionResumePromptDialog: React.FC<
  SessionResumePromptDialogProps
> = ({ request, onSelect }) => {
  const { matchedSession } = request;

  const options: Array<RadioSelectItem<boolean>> = [
    {
      label: 'Resume previous session',
      value: true,
      key: 'resume',
    },
    {
      label: 'Send as new request',
      value: false,
      key: 'new',
    },
  ];

  const handleSelect = useCallback(
    (value: boolean) => {
      onSelect(value);
    },
    [onSelect],
  );

  return (
    <Box
      borderStyle="double"
      borderColor={theme.ui.active}
      flexDirection="column"
      paddingX={1}
      paddingY={1}
    >
      <Box marginBottom={1}>
        <Text bold color={theme.ui.active}>
          Session Match Found
        </Text>
      </Box>
      <Box marginBottom={1}>
        <Text>
          A previous session exactly matches your first prompt. Would you like
          to resume it?
        </Text>
      </Box>
      <Box
        flexDirection="column"
        paddingX={1}
        paddingY={0.5}
        borderStyle="round"
        borderColor={Colors.Gray}
        marginBottom={1}
      >
        <Text color={Colors.Gray}>Previous Session:</Text>
        <Text italic color={theme.text.link}>
          {`"${matchedSession.firstUserMessage}"`}
        </Text>
        <Box marginTop={0.5}>
          <Text dimColor>
            {matchedSession.messageCount} messages · Last updated{' '}
            {formatRelativeTime(matchedSession.lastUpdated)}
          </Text>
        </Box>
      </Box>
      <RadioButtonSelect
        items={options}
        onSelect={handleSelect}
        showNumbers={true}
      />
    </Box>
  );
};
