/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../colors.js';
import {
  EDITOR_DISPLAY_NAMES,
  editorSettingsManager,
  type EditorDisplay,
} from '../editors/editorSettingsManager.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';
import { LoadedSettings, SettingScope } from '../../config/settings.js';
import { EditorType, isEditorAvailable } from '@google/gemini-cli-core';
import { useKeypress } from '../hooks/useKeypress.js';

interface EditorDialogProps {
  onSelect: (editorType: EditorType | undefined, scope: SettingScope) => void;
  settings: LoadedSettings;
  onExit: () => void;
}

export function EditorSettingsDialog({
  onSelect,
  settings,
  onExit,
}: EditorDialogProps): React.JSX.Element {
  const [selectedScope, setSelectedScope] = useState<SettingScope>(
    SettingScope.User,
  );
  const [focusedSection, setFocusedSection] = useState<'editor' | 'scope'>(
    'editor',
  );
  useKeypress(
    (key) => {
      if (key.name === 'tab') {
        setFocusedSection((prev) => (prev === 'editor' ? 'scope' : 'editor'));
      }
      if (key.name === 'escape') {
        onExit();
      }
    },
    { isActive: true },
  );

  const editorItems: EditorDisplay[] =
    editorSettingsManager.getAvailableEditorDisplays();

  const currentPreference =
    settings.forScope(selectedScope).settings.preferredEditor;
  let editorIndex = currentPreference
    ? editorItems.findIndex(
        (item: EditorDisplay) => item.type === currentPreference,
      )
    : 0;
  if (editorIndex === -1) {
    console.error(`Editor is not supported: ${currentPreference}`);
    editorIndex = 0;
  }

  const scopeItems = [
    { label: 'User Settings', value: SettingScope.User },
    { label: 'Workspace Settings', value: SettingScope.Workspace },
  ];

  const handleEditorSelect = (editorType: EditorType | 'not_set') => {
    if (editorType === 'not_set') {
      onSelect(undefined, selectedScope);
      return;
    }
    onSelect(editorType, selectedScope);
  };

  const handleScopeSelect = (scope: SettingScope) => {
    setSelectedScope(scope);
    setFocusedSection('editor');
  };

  let otherScopeModifiedMessage = '';
  const otherScope =
    selectedScope === SettingScope.User
      ? SettingScope.Workspace
      : SettingScope.User;
  if (settings.forScope(otherScope).settings.preferredEditor !== undefined) {
    otherScopeModifiedMessage =
      settings.forScope(selectedScope).settings.preferredEditor !== undefined
        ? `(Also modified in ${otherScope})`
        : `(Modified in ${otherScope})`;
  }

  let mergedEditorName = 'None';
  if (
    settings.merged.preferredEditor &&
    isEditorAvailable(settings.merged.preferredEditor)
  ) {
    mergedEditorName =
      EDITOR_DISPLAY_NAMES[settings.merged.preferredEditor as EditorType];
  }

  return (
    <Box
      borderStyle="round"
      borderColor={Colors.Gray}
      flexDirection="row"
      padding={1}
      width="100%"
    >
      <Box flexDirection="column" width="45%" paddingRight={2}>
        <Text bold={focusedSection === 'editor'}>
          {focusedSection === 'editor' ? '> ' : '  '}Select Editor{' '}
          <Text color={Colors.Gray}>{otherScopeModifiedMessage}</Text>
        </Text>
        <RadioButtonSelect
          items={editorItems.map((item) => ({
            label: item.name,
            value: item.type,
            disabled: item.disabled,
          }))}
          initialIndex={editorIndex}
          onSelect={handleEditorSelect}
          isFocused={focusedSection === 'editor'}
          key={selectedScope}
        />

        <Box marginTop={1} flexDirection="column">
          <Text bold={focusedSection === 'scope'}>
            {focusedSection === 'scope' ? '> ' : '  '}Apply To
          </Text>
          <RadioButtonSelect
            items={scopeItems}
            initialIndex={0}
            onSelect={handleScopeSelect}
            isFocused={focusedSection === 'scope'}
          />
        </Box>

        <Box marginTop={1}>
          <Text color={Colors.Gray}>
            (Use Enter to select, Tab to change focus)
          </Text>
        </Box>
      </Box>

      <Box flexDirection="column" width="55%" paddingLeft={2}>
        <Text bold>Editor Preference</Text>
        <Box flexDirection="column" gap={1} marginTop={1}>
          <Text color={Colors.Gray}>
            These editors are currently supported. Please note that some editors
            cannot be used in sandbox mode.
          </Text>
          <Text color={Colors.Gray}>
            Your preferred editor is:{' '}
            <Text
              color={
                mergedEditorName === 'None'
                  ? Colors.AccentRed
                  : Colors.AccentCyan
              }
              bold
            >
              {mergedEditorName}
            </Text>
            .
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
