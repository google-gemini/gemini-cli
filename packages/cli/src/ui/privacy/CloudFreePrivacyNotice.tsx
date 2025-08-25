/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Newline, Text } from 'ink';
import { RadioButtonSelect } from '../components/shared/RadioButtonSelect.js';
import { usePrivacySettings } from '../hooks/usePrivacySettings.js';
import { CloudPaidPrivacyNotice } from './CloudPaidPrivacyNotice.js';
import type { Config } from '@google/gemini-cli-core';
import { Colors } from '../colors.js';
import { useKeypress } from '../hooks/useKeypress.js';

interface CloudFreePrivacyNoticeProps {
  config: Config;
  onExit: () => void;
}

export const CloudFreePrivacyNotice = ({
  config,
  onExit,
}: CloudFreePrivacyNoticeProps) => {
  const { privacyState, updateDataCollectionOptIn } =
    usePrivacySettings(config);

  useKeypress(
    (key) => {
      if (privacyState.error && key.name === 'escape') {
        onExit();
      }
    },
    { isActive: true },
  );

  if (privacyState.isLoading) {
    return <Text color={Colors.Gray}>Loading...</Text>;
  }

  if (privacyState.error) {
    return (
      <Box flexDirection="column" marginY={1}>
        <Text color={Colors.AccentRed}>
          Error loading Opt-in settings: {privacyState.error}
        </Text>
        <Text color={Colors.Gray}>Press Esc to exit.</Text>
      </Box>
    );
  }

  if (privacyState.isFreeTier === false) {
    return <CloudPaidPrivacyNotice onExit={onExit} />;
  }

  const items = [
    { label: 'Yes', value: true },
    { label: 'No', value: false },
  ];

  return (
    <Box flexDirection="column" marginY={1}>
      <Text bold color={Colors.AccentPurple}>
        Gemini Code Assist for Individuals Privacy Notice
      </Text>
      <Newline />
      <Text>
        This notice and our Privacy Policy
        <Text color={Colors.AccentBlue}>[1]</Text> describe how Gemini Code
        Assist handles your data. Please read them carefully.
      </Text>
      <Newline />
      <Text>
        When you use Gemini Code Assist for individuals with Gemini CLI, Google
        collects your prompts, related code, generated output, code edits,
        related feature usage information, and your feedback to provide,
        improve, and develop Google products and services and machine learning
        technologies.
      </Text>
      <Newline />
      <Text>
        To help with quality and improve our products (such as generative
        machine-learning models), human reviewers may read, annotate, and
        process the data collected above. We take steps to protect your privacy
        as part of this process. This includes disconnecting the data from your
        Google Account before reviewers see or annotate it, and storing those
        disconnected copies for up to 18 months. Please don&apos;t submit
        confidential information or any data you wouldn&apos;t want a reviewer
        to see or Google to use to improve our products, services and
        machine-learning technologies.
      </Text>
      <Newline />
      <Box flexDirection="column">
        <Text>
          Allow Google to use this data to develop and improve our products?
        </Text>
        <RadioButtonSelect
          items={items}
          initialIndex={privacyState.dataCollectionOptIn ? 0 : 1}
          onSelect={(value) => {
            updateDataCollectionOptIn(value);
            // Only exit if there was no error.
            if (!privacyState.error) {
              onExit();
            }
          }}
        />
      </Box>
      <Newline />
      <Text>
        <Text color={Colors.AccentBlue}>[1]</Text>{' '}
        https://policies.google.com/privacy
      </Text>
      <Newline />
      <Text color={Colors.Gray}>Press Enter to choose an option and exit.</Text>
    </Box>
  );
};
