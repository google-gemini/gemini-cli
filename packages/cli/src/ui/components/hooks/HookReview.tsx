/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import type { HookEventName } from '@google/gemini-cli-core';
import { theme } from '../../semantic-colors.js';
import { RadioButtonSelect } from '../shared/RadioButtonSelect.js';
import { useKeypress } from '../../hooks/useKeypress.js';
import { DEFAULT_HOOK_TIMEOUT, HOOK_EVENTS } from './types.js';

export interface HookReviewProps {
  event: HookEventName;
  matcher?: string;
  command: string;
  name?: string;
  description?: string;
  timeout?: number;
  onConfirm: () => void;
  onEdit: (step: 'event' | 'matcher' | 'details') => void;
  onCancel: () => void;
  isFocused?: boolean;
}

type ReviewAction =
  | 'save'
  | 'edit-event'
  | 'edit-matcher'
  | 'edit-details'
  | 'cancel';

export function HookReview({
  event,
  matcher,
  command,
  name,
  description,
  timeout,
  onConfirm,
  onEdit,
  onCancel,
  isFocused = true,
}: HookReviewProps): React.JSX.Element {
  useKeypress(
    (key) => {
      if (key.name === 'escape') {
        onCancel();
      }
    },
    { isActive: isFocused },
  );

  const eventInfo = HOOK_EVENTS.find((e) => e.event === event);

  const options: Array<{ label: string; value: ReviewAction; key: string }> = [
    { label: '✓ Save & Exit', value: 'save', key: 'save' },
    { label: '✎ Edit Event', value: 'edit-event', key: 'edit-event' },
    { label: '✎ Edit Matcher', value: 'edit-matcher', key: 'edit-matcher' },
    { label: '✎ Edit Details', value: 'edit-details', key: 'edit-details' },
    { label: '✗ Cancel', value: 'cancel', key: 'cancel' },
  ];

  const handleSelect = (action: ReviewAction) => {
    switch (action) {
      case 'save':
        onConfirm();
        break;
      case 'edit-event':
        onEdit('event');
        break;
      case 'edit-matcher':
        onEdit('matcher');
        break;
      case 'edit-details':
        onEdit('details');
        break;
      case 'cancel':
        onCancel();
        break;
      default:
        break;
    }
  };

  const renderConfigItem = (label: string, value: string | undefined) => (
    <Box>
      <Box width={14}>
        <Text color={theme.text.secondary}>{label}:</Text>
      </Box>
      <Text color={theme.text.primary}>{value || '(not set)'}</Text>
    </Box>
  );

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color={theme.text.primary}>
          Step 5: Review Configuration
        </Text>
      </Box>

      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={theme.border.default}
        paddingX={2}
        paddingY={1}
        marginBottom={1}
      >
        <Box marginBottom={1}>
          <Text bold color={theme.text.accent}>
            Hook Configuration Summary
          </Text>
        </Box>

        {renderConfigItem('Event', eventInfo?.title)}
        {eventInfo?.description && (
          <Box marginLeft={14} marginBottom={1}>
            <Text color={theme.text.secondary} dimColor>
              {eventInfo.description}
            </Text>
          </Box>
        )}

        {renderConfigItem('Matcher', matcher || '*')}
        {renderConfigItem('Command', command)}
        {renderConfigItem('Name', name)}
        {renderConfigItem('Description', description)}
        {renderConfigItem('Timeout', `${timeout || DEFAULT_HOOK_TIMEOUT}ms`)}

        <Box marginTop={1} />
        <Box>
          <Box width={14}>
            <Text color={theme.text.secondary}>Saves to:</Text>
          </Box>
          <Text color={theme.text.primary}>.gemini/settings.json</Text>
        </Box>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <RadioButtonSelect<ReviewAction>
          items={options}
          onSelect={handleSelect}
          isFocused={isFocused}
          showNumbers={true}
        />
      </Box>

      <Box>
        <Text color={theme.text.secondary}>
          (Enter to select, Esc to cancel)
        </Text>
      </Box>
    </Box>
  );
}
