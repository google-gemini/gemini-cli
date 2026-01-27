/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import {
  editorSettingsManager,
  type EditorDisplay,
} from '../editors/editorSettingsManager.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';
import type {
  LoadableSettingScope,
  LoadedSettings,
} from '../../config/settings.js';
import { SettingScope } from '../../config/settings.js';
import {
  type EditorType,
  isEditorAvailable,
  EDITOR_DISPLAY_NAMES,
} from '@google/gemini-cli-core';
import { useKeypress } from '../hooks/useKeypress.js';
import { coreEvents } from '@google/gemini-cli-core';

interface EditorDialogProps {
  onSelect: (
    editorType: EditorType | undefined,
    scope: LoadableSettingScope,
  ) => void;
  settings: LoadedSettings;
  onExit: () => void;
}

export function EditorSettingsDialog({
  onSelect,
  settings,
  onExit,
}: EditorDialogProps): React.JSX.Element {
  const { t } = useTranslation('dialogs');
  const [selectedScope, setSelectedScope] = useState<LoadableSettingScope>(
    SettingScope.User,
  );
  const [focusedSection, setFocusedSection] = useState<'editor' | 'scope'>(
    'editor',
  );
  useKeypress(
    (key) => {
      if (key.name === 'tab') {
        setFocusedSection((prev) => (prev === 'editor' ? 'scope' : 'editor'));
        return true;
      }
      if (key.name === 'escape') {
        onExit();
        return true;
      }
      return false;
    },
    { isActive: true },
  );

  const editorItems: EditorDisplay[] =
    editorSettingsManager.getAvailableEditorDisplays();

  const currentPreference =
    settings.forScope(selectedScope).settings.general?.preferredEditor;
  let editorIndex = currentPreference
    ? editorItems.findIndex(
        (item: EditorDisplay) => item.type === currentPreference,
      )
    : 0;
  if (editorIndex === -1) {
    coreEvents.emitFeedback(
      'error',
      t('editor.unsupported', { preference: currentPreference }),
    );
    editorIndex = 0;
  }

  const scopeItems = useMemo<
    Array<{
      label: string;
      value: LoadableSettingScope;
      key: string;
    }>
  >(
    () => [
      {
        label: t('editor.userSettings'),
        value: SettingScope.User,
        key: SettingScope.User,
      },
      {
        label: t('editor.workspaceSettings'),
        value: SettingScope.Workspace,
        key: SettingScope.Workspace,
      },
    ],
    [t],
  );

  const handleEditorSelect = (editorType: EditorType | 'not_set') => {
    if (editorType === 'not_set') {
      onSelect(undefined, selectedScope);
      return;
    }
    onSelect(editorType, selectedScope);
  };

  const handleScopeSelect = (scope: LoadableSettingScope) => {
    setSelectedScope(scope);
    setFocusedSection('editor');
  };

  let otherScopeModifiedMessage = '';
  const otherScope =
    selectedScope === SettingScope.User
      ? SettingScope.Workspace
      : SettingScope.User;
  if (
    settings.forScope(otherScope).settings.general?.preferredEditor !==
    undefined
  ) {
    otherScopeModifiedMessage =
      settings.forScope(selectedScope).settings.general?.preferredEditor !==
      undefined
        ? t('editor.alsoModifiedIn', { scope: otherScope })
        : t('editor.modifiedIn', { scope: otherScope });
  }

  let mergedEditorName = t('editor.none');
  if (
    settings.merged.general.preferredEditor &&
    isEditorAvailable(settings.merged.general.preferredEditor)
  ) {
    mergedEditorName =
      EDITOR_DISPLAY_NAMES[
        settings.merged.general.preferredEditor as EditorType
      ];
  }

  return (
    <Box
      borderStyle="round"
      borderColor={theme.border.default}
      flexDirection="row"
      padding={1}
      width="100%"
    >
      <Box flexDirection="column" width="45%" paddingRight={2}>
        <Text bold={focusedSection === 'editor'}>
          {focusedSection === 'editor' ? '> ' : '  '}
          {t('editor.title')}{' '}
          <Text color={theme.text.secondary}>{otherScopeModifiedMessage}</Text>
        </Text>
        <RadioButtonSelect
          items={editorItems.map((item) => ({
            label: item.name,
            value: item.type,
            disabled: item.disabled,
            key: item.type,
          }))}
          initialIndex={editorIndex}
          onSelect={handleEditorSelect}
          isFocused={focusedSection === 'editor'}
          key={selectedScope}
        />

        <Box marginTop={1} flexDirection="column">
          <Text bold={focusedSection === 'scope'}>
            {focusedSection === 'scope' ? '> ' : '  '}
            {t('editor.applyTo')}
          </Text>
          <RadioButtonSelect
            items={scopeItems}
            initialIndex={0}
            onSelect={handleScopeSelect}
            isFocused={focusedSection === 'scope'}
          />
        </Box>

        <Box marginTop={1}>
          <Text color={theme.text.secondary}>{t('editor.instructions')}</Text>
        </Box>
      </Box>

      <Box flexDirection="column" width="55%" paddingLeft={2}>
        <Text bold color={theme.text.primary}>
          {t('editor.preferenceTitle')}
        </Text>
        <Box flexDirection="column" gap={1} marginTop={1}>
          <Text color={theme.text.secondary}>{t('editor.description')}</Text>
          <Text color={theme.text.secondary}>
            {t('editor.currentPreference')}{' '}
            <Text
              color={
                mergedEditorName === t('editor.none')
                  ? theme.status.error
                  : theme.text.link
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
