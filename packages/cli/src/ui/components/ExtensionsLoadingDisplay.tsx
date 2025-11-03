/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { appEvents } from './../../utils/events.js';
import { Box, Text } from 'ink';
import { useConfig } from '../contexts/ConfigContext.js';
import {
  type ExtensionsStartingEvent,
  type ExtensionsStoppingEvent,
} from '@google/gemini-cli-core';
import { GeminiSpinner } from './GeminiRespondingSpinner.js';
import { theme } from '../semantic-colors.js';

export const ExtensionsLoadingDisplay = () => {
  const config = useConfig();
  const [extensionsStartingMessage, setExtensionsStartingMessage] =
    useState<string>();
  const [extensionsStoppingMessage, setExtensionsStoppingMessage] =
    useState<string>();

  useEffect(() => {
    const onChange = (info: ExtensionsStartingEvent) => {
      setExtensionsStartingMessage(
        info.completed === info.total
          ? undefined
          : `Starting extensions... (${info.completed}/${info.total})`,
      );
    };
    appEvents.on('extensionsStarting', onChange);
    return () => {
      appEvents.off('extensionsStarting', onChange);
    };
  }, [config]);

  useEffect(() => {
    const onChange = (info: ExtensionsStoppingEvent) => {
      setExtensionsStoppingMessage(
        info.completed === info.total
          ? undefined
          : `Stopping extensions... (${info.completed}/${info.total})`,
      );
    };
    appEvents.on('extensionsStopping', onChange);
    return () => {
      appEvents.off('extensionsStopping', onChange);
    };
  }, [config]);

  return (
    <Box>
      {extensionsStartingMessage && (
        <Box marginTop={1}>
          <Text>
            <GeminiSpinner />{' '}
            <Text color={theme.text.primary}>{extensionsStartingMessage}</Text>
          </Text>
        </Box>
      )}
      {extensionsStoppingMessage && (
        <Box marginTop={1}>
          <Text>
            <GeminiSpinner />{' '}
            <Text color={theme.text.primary}>{extensionsStartingMessage}</Text>
          </Text>
        </Box>
      )}
    </Box>
  );
};
