/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect } from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../colors.js';
import { SlashCommand } from '../commands/types.js';
import { useTranslation } from '../../i18n/useTranslation.js';
import { getCommandDescription } from '../utils/getCommandDescription.js';

interface Help {
  commands: readonly SlashCommand[];
  language?: 'en' | 'zh' | 'fr' | 'es';
}

export const Help: React.FC<Help> = ({ commands, language = 'en' }) => {
  const { t, i18n } = useTranslation();

  // 同步语言设置
  useEffect(() => {
    if (language !== i18n.language) {
      i18n.changeLanguage(language).catch((err) => {
        console.error('Failed to change language in Help component:', err);
      });
    }
  }, [language, i18n]);

  return (
    <Box
      flexDirection="column"
      marginBottom={1}
      borderColor={Colors.Gray}
      borderStyle="round"
      padding={1}
    >
      {/* Basics */}
      <Text bold color={Colors.Foreground}>
        {t('sections.basics', { ns: 'help' })}
      </Text>
      <Text color={Colors.Foreground}>
        <Text bold color={Colors.AccentPurple}>
          {t('basics.addContext', { ns: 'help' })}
        </Text>
        : {t('basics.addContextDesc', { ns: 'help' })}
      </Text>
      <Text color={Colors.Foreground}>
        <Text bold color={Colors.AccentPurple}>
          {t('basics.shellMode', { ns: 'help' })}
        </Text>
        : {t('basics.shellModeDesc', { ns: 'help' })}
      </Text>

      <Box height={1} />

      {/* Commands */}
      <Text bold color={Colors.Foreground}>
        {t('sections.commands', { ns: 'help' })}
      </Text>
      {commands
        .filter((command) => command.description)
        .map((command: SlashCommand) => (
          <Box key={command.name} flexDirection="column">
            <Text color={Colors.Foreground}>
              <Text bold color={Colors.AccentPurple}>
                {' '}
                /{command.name}
              </Text>
              {command.description &&
                ' - ' +
                  getCommandDescription(command.name, command.description)}
            </Text>
            {command.subCommands &&
              command.subCommands.map((subCommand) => (
                <Text key={subCommand.name} color={Colors.Foreground}>
                  <Text bold color={Colors.AccentPurple}>
                    {'   '}
                    {subCommand.name}
                  </Text>
                  {subCommand.description &&
                    ' - ' +
                      getCommandDescription(
                        subCommand.name,
                        subCommand.description,
                        command.name,
                      )}
                </Text>
              ))}
          </Box>
        ))}
      <Text color={Colors.Foreground}>
        <Text bold color={Colors.AccentPurple}>
          {' '}
          !{' '}
        </Text>
        - {t('shellCommand', { ns: 'help' })}
      </Text>

      <Box height={1} />

      {/* Shortcuts */}
      <Text bold color={Colors.Foreground}>
        {t('sections.shortcuts', { ns: 'help' })}
      </Text>
      <Text color={Colors.Foreground}>
        {t('shortcuts.altLeftRight', { ns: 'help' })}
      </Text>
      <Text color={Colors.Foreground}>
        {t('shortcuts.ctrlC', { ns: 'help' })}
      </Text>
      <Text color={Colors.Foreground}>
        {process.platform === 'linux'
          ? t('shortcuts.ctrlJLinux', { key: 'Ctrl+J', ns: 'help' })
          : t('shortcuts.ctrlJ', {
              key: process.platform === 'win32' ? 'Ctrl+Enter' : 'Ctrl+J',
              ns: 'help',
            })}
      </Text>
      <Text color={Colors.Foreground}>
        {t('shortcuts.ctrlL', { ns: 'help' })}
      </Text>
      <Text color={Colors.Foreground}>
        {t('shortcuts.ctrlX', {
          key: process.platform === 'darwin' ? 'Ctrl+X / Meta+Enter' : 'Ctrl+X',
          ns: 'help',
        })}
      </Text>
      <Text color={Colors.Foreground}>
        {t('shortcuts.ctrlY', { ns: 'help' })}
      </Text>
      <Text color={Colors.Foreground}>
        {t('shortcuts.enter', { ns: 'help' })}
      </Text>
      <Text color={Colors.Foreground}>
        {t('shortcuts.esc', { ns: 'help' })}
      </Text>
      <Text color={Colors.Foreground}>
        {t('shortcuts.shiftTab', { ns: 'help' })}
      </Text>
      <Text color={Colors.Foreground}>
        {t('shortcuts.upDown', { ns: 'help' })}
      </Text>
      <Box height={1} />
      <Text color={Colors.Foreground}>
        {t('fullShortcutsDocs', {
          docsPath: 'docs/keyboard-shortcuts.md',
          ns: 'help',
        })}
      </Text>
    </Box>
  );
};
