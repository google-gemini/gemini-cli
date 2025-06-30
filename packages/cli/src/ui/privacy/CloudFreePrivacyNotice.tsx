/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import _React, { useState } from 'react';
import { Box, Newline, Text, useInput } from 'ink';
import { Colors } from '../colors.js';
import { usePrivacySettings } from '../hooks/usePrivacySettings.js';
import { type LoadedSettings } from '../../config/settings.js';
import { SettingScope } from '../../config/settings.js';

interface CloudFreePrivacyNoticeProps {
  _config: unknown;
  onExit: () => void;
  settings: LoadedSettings;
}

export const CloudFreePrivacyNotice = ({
  _config,
  onExit,
  settings,
}: CloudFreePrivacyNoticeProps) => {
  const { usageStatisticsEnabled, setUsageStatisticsEnabled } =
    usePrivacySettings(settings);
  const [selectedScope, setSelectedScope] = useState<SettingScope>(
    SettingScope.User,
  );
  const [showOptOut, setShowOptOut] = useState(false);

  useInput((input, key) => {
    if (key.escape) {
      onExit();
    } else if (key.return && !showOptOut) {
      setShowOptOut(true);
    } else if (key.return && showOptOut) {
      setUsageStatisticsEnabled(usageStatisticsEnabled, selectedScope);
      onExit();
    } else if (showOptOut && (input === '1' || input === '2')) {
      setSelectedScope(
        input === '1' ? SettingScope.User : SettingScope.Workspace,
      );
    } else if (showOptOut && input === ' ') {
      setUsageStatisticsEnabled(!usageStatisticsEnabled, selectedScope);
    }
  });

  if (!showOptOut) {
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
          When you use Gemini Code Assist for individuals with Gemini CLI,
          Google collects your prompts, related code, generated output, code
          edits, related feature usage information, and your feedback to
          provide, improve, and develop Google products and services and machine
          learning technologies.
        </Text>
        <Newline />
        <Text>
          To help with quality and improve our products (such as generative
          machine-learning models), human reviewers may read, annotate, and
          process the data collected above. We take steps to protect your
          privacy as part of this process. This includes disconnecting the data
          from your Google Account before reviewers see or annotate it, and
          storing those disconnected copies for up to 18 months. Please
          don&apos;t submit confidential information or any data you
          wouldn&apos;t want a reviewer to see or Google to use to improve our
          products, services and machine-learning technologies.
        </Text>
        <Newline />
        <Text>
          <Text color={Colors.AccentBlue}>[1]</Text>{' '}
          https://policies.google.com/privacy
        </Text>
        <Newline />
        <Text color={Colors.Gray}>
          Press Enter to configure data collection settings.
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginY={1}>
      <Text bold color={Colors.AccentPurple}>
        Data Collection Settings
      </Text>
      <Newline />
      <Text>
        You can control whether Gemini CLI collects usage statistics to help
        improve the tool.
      </Text>
      <Newline />
      <Text>
        <Text bold>Current setting:</Text> Usage statistics collection is{' '}
        <Text
          color={usageStatisticsEnabled ? Colors.AccentGreen : Colors.AccentRed}
        >
          {usageStatisticsEnabled ? 'ENABLED' : 'DISABLED'}
        </Text>
      </Text>
      <Newline />
      <Text>
        <Text bold>Scope:</Text>{' '}
        {selectedScope === SettingScope.User
          ? 'User (global)'
          : 'Workspace (project-specific)'}
      </Text>
      <Newline />
      <Text>
        Press <Text color={Colors.AccentYellow}>1</Text> for User settings
        (global) or <Text color={Colors.AccentYellow}>2</Text> for Workspace
        settings (project-specific)
      </Text>
      <Newline />
      <Text>
        Press <Text color={Colors.AccentYellow}>Space</Text> to toggle data
        collection{' '}
        <Text color={Colors.AccentYellow}>
          (currently {usageStatisticsEnabled ? 'ON' : 'OFF'})
        </Text>
      </Text>
      <Newline />
      <Text color={Colors.Gray}>Press Enter to save and continue.</Text>
    </Box>
  );
};
