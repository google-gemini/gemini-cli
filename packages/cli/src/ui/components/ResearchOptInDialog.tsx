/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback } from 'react';
import { Box, Text } from 'ink';
import { useInput } from 'ink';
import { Colors } from '../colors.js';
import { SettingScope } from '../../config/settings.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';
import { TextInput } from './shared/TextInput.js';

export interface ResearchOptInSettings {
  enabled?: boolean;
  email?: string;
  allowUserResearch?: boolean;
  allowFeedbackCollection?: boolean;
}

export interface ResearchOptInDialogProps {
  onSelect: (
    settings: ResearchOptInSettings | undefined,
    scope: SettingScope,
  ) => void;
  settings: ResearchOptInSettings;
  onExit: () => void;
}

export function ResearchOptInDialog({
  onSelect,
  settings,
  onExit,
}: ResearchOptInDialogProps): React.JSX.Element {
  const [selectedScope, setSelectedScope] = useState<SettingScope>(
    SettingScope.User,
  );
  const [focusedSection, setFocusedSection] = useState<
    'optin' | 'email' | 'scope'
  >('optin');
  const [email, setEmail] = useState(settings.email || '');
  const [allowUserResearch, setAllowUserResearch] = useState(
    settings.allowUserResearch ?? false,
  );
  const [allowFeedbackCollection, setAllowFeedbackCollection] = useState(
    settings.allowFeedbackCollection ?? false,
  );

  useInput((_, key) => {
    if (key.tab) {
      setFocusedSection((prev) => {
        if (prev === 'optin') return 'email';
        if (prev === 'email') return 'scope';
        return 'optin';
      });
    }
    if (key.escape) {
      onExit();
    }
  });

  const handleOptInSelect = useCallback(
    (enabled: boolean) => {
      if (enabled) {
        onSelect(
          {
            enabled: true,
            email,
            allowUserResearch,
            allowFeedbackCollection,
          },
          selectedScope,
        );
      } else {
        onSelect(
          {
            enabled: false,
            email: '',
            allowUserResearch: false,
            allowFeedbackCollection: false,
          },
          selectedScope,
        );
      }
    },
    [
      onSelect,
      email,
      allowUserResearch,
      allowFeedbackCollection,
      selectedScope,
    ],
  );

  const handleEmailChange = useCallback(
    (newEmail: string) => {
      setEmail(newEmail);
      if (settings.enabled) {
        onSelect(
          {
            ...settings,
            email: newEmail,
          },
          selectedScope,
        );
      }
    },
    [settings, onSelect, selectedScope],
  );

  const handleUserResearchChange = useCallback(
    (allow: boolean) => {
      setAllowUserResearch(allow);
      if (settings.enabled) {
        onSelect(
          {
            ...settings,
            allowUserResearch: allow,
          },
          selectedScope,
        );
      }
    },
    [settings, onSelect, selectedScope],
  );

  const handleFeedbackCollectionChange = useCallback(
    (allow: boolean) => {
      setAllowFeedbackCollection(allow);
      if (settings.enabled) {
        onSelect(
          {
            ...settings,
            allowFeedbackCollection: allow,
          },
          selectedScope,
        );
      }
    },
    [settings, onSelect, selectedScope],
  );

  const handleScopeSelect = useCallback((scope: SettingScope) => {
    setSelectedScope(scope);
    setFocusedSection('optin');
  }, []);

  const optInItems = [
    { label: 'Yes, I want to participate in research', value: true },
    { label: 'No, I do not want to participate', value: false },
  ];

  const scopeItems = [
    { label: 'User Settings', value: SettingScope.User },
    { label: 'Workspace Settings', value: SettingScope.Workspace },
  ];

  const userResearchItems = [
    { label: 'Yes, allow user research contact', value: true },
    { label: 'No, do not contact me for research', value: false },
  ];

  const feedbackCollectionItems = [
    { label: 'Yes, allow feedback collection', value: true },
    { label: 'No, do not collect feedback', value: false },
  ];

  return (
    <Box
      borderStyle="round"
      borderColor={Colors.Gray}
      flexDirection="column"
      padding={1}
      width="100%"
    >
      <Text bold>Research Communication Opt-In</Text>
      <Box marginTop={1}>
        <Text>
          Help us improve Gemini CLI by participating in user research and
          providing feedback. Your participation is completely voluntary and you
          can change these settings at any time.
        </Text>
      </Box>

      <Box marginTop={1}>
        <Text bold>Scope:</Text>
      </Box>
      <Box marginTop={1}>
        <RadioButtonSelect
          items={scopeItems}
          initialIndex={scopeItems.findIndex(
            (item) => item.value === selectedScope,
          )}
          onSelect={handleScopeSelect}
          isFocused={focusedSection === 'scope'}
        />
      </Box>

      <Box marginTop={1}>
        <Text bold>Would you like to participate in Gemini CLI research?</Text>
      </Box>
      <Box marginTop={1}>
        <RadioButtonSelect
          items={optInItems}
          initialIndex={optInItems.findIndex(
            (item) => item.value === (settings.enabled ?? false),
          )}
          onSelect={handleOptInSelect}
          isFocused={focusedSection === 'optin'}
        />
      </Box>

      {settings.enabled && (
        <>
          <Box marginTop={1}>
            <Text bold>Email address (for research contact):</Text>
          </Box>
          <Box marginTop={1}>
            <TextInput
              value={email}
              onChange={handleEmailChange}
              placeholder="your.email@example.com"
              isFocused={focusedSection === 'email'}
            />
          </Box>

          <Box marginTop={1}>
            <Text bold>User Research Contact:</Text>
          </Box>
          <Box marginTop={1}>
            <RadioButtonSelect
              items={userResearchItems}
              initialIndex={userResearchItems.findIndex(
                (item) => item.value === allowUserResearch,
              )}
              onSelect={handleUserResearchChange}
              isFocused={false}
            />
          </Box>

          <Box marginTop={1}>
            <Text bold>Feedback Collection:</Text>
          </Box>
          <Box marginTop={1}>
            <RadioButtonSelect
              items={feedbackCollectionItems}
              initialIndex={feedbackCollectionItems.findIndex(
                (item) => item.value === allowFeedbackCollection,
              )}
              onSelect={handleFeedbackCollectionChange}
              isFocused={false}
            />
          </Box>
        </>
      )}

      <Box marginTop={1}>
        <Text color={Colors.Gray}>
          (Use Tab to navigate, Enter to select, Esc to exit)
        </Text>
      </Box>

      <Box marginTop={1}>
        <Text color={Colors.AccentBlue}>
          Privacy Notice:
          https://github.com/google-gemini/gemini-cli/blob/main/docs/tos-privacy.md
        </Text>
      </Box>
    </Box>
  );
}
