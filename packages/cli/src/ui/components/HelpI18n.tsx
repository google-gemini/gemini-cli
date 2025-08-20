/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../colors.js';
import { SlashCommand } from '../commands/types.js';
import { useTranslation } from '../../i18n/useTranslation.js';

interface HelpI18nProps {
  commands: readonly SlashCommand[];
  language?: 'en' | 'zh';
}

export const HelpI18n: React.FC<HelpI18nProps> = ({ commands, language = 'en' }) => {
  const { t, i18n } = useTranslation();
  const { t: tCmd } = useTranslation('commands');
  
  // Switch language if specified
  React.useEffect(() => {
    if (language !== i18n.language) {
      i18n.changeLanguage(language);
    }
  }, [language, i18n]);

  // Helper function to get localized command description
  const getCommandDescription = (command: SlashCommand): string => {
    // Map command names to translation keys
    const commandKeyMap: Record<string, string> = {
      'help': 'help',
      'clear': 'clear',
      'settings': 'settings',
      'auth': 'auth',
      'theme': 'theme',
      'about': 'about',
      'quit': 'quit',
      'stats': 'stats',
      'copy': 'copy',
      'memory': 'memory',
      'docs': 'docs',
      'ide': 'ide',
      'mcp': 'mcp',
      'tools': 'tools',
      'extensions': 'extensions',
      'init': 'init',
    };

    // Try to get description from the descriptions object first
    const descKey = `descriptions.${command.name}`;
    const translatedDesc = tCmd(descKey);
    if (translatedDesc !== descKey) {
      return translatedDesc;
    }
    
    // Fallback to command-specific description
    const translationKey = commandKeyMap[command.name];
    if (translationKey) {
      const cmdDesc = tCmd(`${translationKey}.description`);
      if (cmdDesc !== `${translationKey}.description`) {
        return cmdDesc;
      }
    }
    
    // Fall back to original description if no translation found
    return command.description || '';
  };

  // Helper function to get localized subcommand description
  const getSubCommandDescription = (parentCommand: SlashCommand, subCommand: SlashCommand): string => {
    // Try to get translation for specific subcommands
    const subCmdKey = `${parentCommand.name}.${subCommand.name}`;
    const translatedSubDesc = tCmd(subCmdKey);
    if (translatedSubDesc !== subCmdKey) {
      return translatedSubDesc;
    }
    
    // Fall back to original description if no translation found
    return subCommand.description || '';
  };

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
        {t('sections.basics')}
      </Text>
      <Text color={Colors.Foreground}>
        <Text bold color={Colors.AccentPurple}>
          {t('basics.addContext')}
        </Text>
        : {t('basics.addContextDesc')}
      </Text>
      <Text color={Colors.Foreground}>
        <Text bold color={Colors.AccentPurple}>
          {t('basics.shellMode')}
        </Text>
        : {t('basics.shellModeDesc')}
      </Text>

      <Box height={1} />

      {/* Commands */}
      <Text bold color={Colors.Foreground}>
        {t('sections.commands')}
      </Text>
      {commands
        .filter((command) => command.description)
        .map((command: SlashCommand) => {
          const localizedDescription = getCommandDescription(command);
          return (
            <Box key={command.name} flexDirection="column">
              <Text color={Colors.Foreground}>
                <Text bold color={Colors.AccentPurple}>
                  {' '}
                  /{command.name}
                </Text>
                {localizedDescription && ' - ' + localizedDescription}
              </Text>
              {command.subCommands &&
                command.subCommands.map((subCommand) => {
                  const localizedSubDescription = getSubCommandDescription(command, subCommand);
                  return (
                    <Text key={subCommand.name} color={Colors.Foreground}>
                      <Text bold color={Colors.AccentPurple}>
                        {'   '}
                        {subCommand.name}
                      </Text>
                      {localizedSubDescription && ' - ' + localizedSubDescription}
                    </Text>
                  );
                })}
            </Box>
          );
        })}
      <Text color={Colors.Foreground}>
        <Text bold color={Colors.AccentPurple}>
          {' '}
          !{' '}
        </Text>
        - {t('shellCommand')}
      </Text>

      <Box height={1} />

      {/* Shortcuts */}
      <Text bold color={Colors.Foreground}>
        {t('sections.shortcuts')}
      </Text>
      <Text color={Colors.Foreground}>
        <Text bold color={Colors.AccentPurple}>
          Alt+Left/Right
        </Text>{' '}
        - {t('shortcuts.altLeftRight')}
      </Text>
      <Text color={Colors.Foreground}>
        <Text bold color={Colors.AccentPurple}>
          Ctrl+C
        </Text>{' '}
        - {t('shortcuts.ctrlC')}
      </Text>
      <Text color={Colors.Foreground}>
        <Text bold color={Colors.AccentPurple}>
          {process.platform === 'win32' ? 'Ctrl+Enter' : 'Ctrl+J'}
        </Text>{' '}
        - {process.platform === 'linux'
          ? t('shortcuts.ctrlJLinux', { key: 'Ctrl+J' })
          : t('shortcuts.ctrlJ', { key: process.platform === 'win32' ? 'Ctrl+Enter' : 'Ctrl+J' })}
      </Text>
      <Text color={Colors.Foreground}>
        <Text bold color={Colors.AccentPurple}>
          Ctrl+L
        </Text>{' '}
        - {t('shortcuts.ctrlL')}
      </Text>
      <Text color={Colors.Foreground}>
        <Text bold color={Colors.AccentPurple}>
          {process.platform === 'darwin' ? 'Ctrl+X / Meta+Enter' : 'Ctrl+X'}
        </Text>{' '}
        - {t('shortcuts.ctrlX', { key: process.platform === 'darwin' ? 'Ctrl+X / Meta+Enter' : 'Ctrl+X' })}
      </Text>
      <Text color={Colors.Foreground}>
        <Text bold color={Colors.AccentPurple}>
          Ctrl+Y
        </Text>{' '}
        - {t('shortcuts.ctrlY')}
      </Text>
      <Text color={Colors.Foreground}>
        <Text bold color={Colors.AccentPurple}>
          Enter
        </Text>{' '}
        - {t('shortcuts.enter')}
      </Text>
      <Text color={Colors.Foreground}>
        <Text bold color={Colors.AccentPurple}>
          Esc
        </Text>{' '}
        - {t('shortcuts.esc')}
      </Text>
      <Text color={Colors.Foreground}>
        <Text bold color={Colors.AccentPurple}>
          Shift+Tab
        </Text>{' '}
        - {t('shortcuts.shiftTab')}
      </Text>
      <Text color={Colors.Foreground}>
        <Text bold color={Colors.AccentPurple}>
          Up/Down
        </Text>{' '}
        - {t('shortcuts.upDown')}
      </Text>
      <Box height={1} />
      <Text color={Colors.Foreground}>
        {t('fullShortcutsDocs', { docsPath: 'docs/keyboard-shortcuts.md' })}
      </Text>

    </Box>
  );
};