/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { type SlashCommand, CommandKind } from '../commands/types.js';
import { KEYBOARD_SHORTCUTS_URL } from '../constants.js';
import { sanitizeForDisplay } from '../utils/textUtils.js';
import { useTranslation } from 'react-i18next';
import { renderStyledText } from '../utils/styledText.js';
import { getCommandDescription } from '../../i18n/index.js';

interface Help {
  commands: readonly SlashCommand[];
}

export const Help: React.FC<Help> = ({ commands }) => {
  const { t } = useTranslation('help');

  return (
    <Box
      flexDirection="column"
      marginBottom={1}
      borderColor={theme.border.default}
      borderStyle="round"
      padding={1}
    >
      {/* Basics */}
      <Text bold color={theme.text.primary}>
        {t('sections.basics')}
      </Text>
      <Text color={theme.text.primary}>
        {renderStyledText(
          t('basics.addContext'),
          {
            label: (
              <Text bold color={theme.text.accent}>
                {t('labels.addContext')}
              </Text>
            ),
            symbol: (
              <Text bold color={theme.text.accent}>
                @
              </Text>
            ),
            example: (
              <Text bold color={theme.text.accent}>
                @src/myFile.ts
              </Text>
            ),
          },
          theme.text.primary,
        )}
      </Text>
      <Text color={theme.text.primary}>
        {renderStyledText(
          t('basics.shellMode'),
          {
            label: (
              <Text bold color={theme.text.accent}>
                {t('labels.shellMode')}
              </Text>
            ),
            symbol: (
              <Text bold color={theme.text.accent}>
                !
              </Text>
            ),
            example: (
              <Text bold color={theme.text.accent}>
                !npm run start
              </Text>
            ),
            natural: (
              <Text bold color={theme.text.accent}>
                start server
              </Text>
            ),
          },
          theme.text.primary,
        )}
      </Text>

      <Box height={1} />

      {/* Commands */}
      <Text bold color={theme.text.primary}>
        {t('sections.commands')}
      </Text>
      {commands
        .filter((command) => command.description && !command.hidden)
        .map((command: SlashCommand) => (
          <Box key={command.name} flexDirection="column">
            <Text color={theme.text.primary}>
              <Text bold color={theme.text.accent}>
                {' '}
                /{command.name}
              </Text>
              {command.kind === CommandKind.MCP_PROMPT && (
                <Text color={theme.text.secondary}> [MCP]</Text>
              )}
              {command.description &&
                ' - ' +
                  sanitizeForDisplay(
                    getCommandDescription(command.name, command.description),
                    100,
                  )}
            </Text>
            {command.subCommands &&
              command.subCommands
                .filter((subCommand) => !subCommand.hidden)
                .map((subCommand) => (
                  <Text key={subCommand.name} color={theme.text.primary}>
                    <Text bold color={theme.text.accent}>
                      {'   '}
                      {subCommand.name}
                    </Text>
                    {subCommand.description &&
                      ' - ' +
                        sanitizeForDisplay(
                          getCommandDescription(
                            subCommand.name,
                            subCommand.description,
                            command.name,
                          ),
                          100,
                        )}
                  </Text>
                ))}
          </Box>
        ))}
      <Text color={theme.text.primary}>
        <Text bold color={theme.text.accent}>
          {' '}
          !{' '}
        </Text>
        - {t('shellCommand')}
      </Text>
      <Text color={theme.text.primary}>
        <Text color={theme.text.secondary}>[MCP]</Text> - {t('mcpCommand')}
      </Text>

      <Box height={1} />

      {/* Shortcuts */}
      <Text bold color={theme.text.primary}>
        {t('sections.shortcuts')}
      </Text>
      <Text color={theme.text.primary}>
        <Text bold color={theme.text.accent}>
          Alt+Left/Right
        </Text>{' '}
        - {t('shortcuts.altLeftRight')}
      </Text>
      <Text color={theme.text.primary}>
        <Text bold color={theme.text.accent}>
          Ctrl+C
        </Text>{' '}
        - {t('shortcuts.ctrlC')}
      </Text>
      <Text color={theme.text.primary}>
        <Text bold color={theme.text.accent}>
          {process.platform === 'win32' ? 'Ctrl+Enter' : 'Ctrl+J'}
        </Text>{' '}
        -{' '}
        {process.platform === 'linux'
          ? t('shortcuts.ctrlJLinux')
          : process.platform === 'win32'
            ? t('shortcuts.ctrlEnter')
            : t('shortcuts.ctrlJ')}
      </Text>
      <Text color={theme.text.primary}>
        <Text bold color={theme.text.accent}>
          Ctrl+L
        </Text>{' '}
        - {t('shortcuts.ctrlL')}
      </Text>
      <Text color={theme.text.primary}>
        <Text bold color={theme.text.accent}>
          Ctrl+S
        </Text>{' '}
        - {t('shortcuts.ctrlS')}
      </Text>
      <Text color={theme.text.primary}>
        <Text bold color={theme.text.accent}>
          Ctrl+X
        </Text>{' '}
        - {t('shortcuts.ctrlX')}
      </Text>
      <Text color={theme.text.primary}>
        <Text bold color={theme.text.accent}>
          Ctrl+Y
        </Text>{' '}
        - {t('shortcuts.ctrlY')}
      </Text>
      <Text color={theme.text.primary}>
        <Text bold color={theme.text.accent}>
          Enter
        </Text>{' '}
        - {t('shortcuts.enter')}
      </Text>
      <Text color={theme.text.primary}>
        <Text bold color={theme.text.accent}>
          Esc
        </Text>{' '}
        - {t('shortcuts.esc')}
      </Text>
      <Text color={theme.text.primary}>
        <Text bold color={theme.text.accent}>
          Page Up/Down
        </Text>{' '}
        - {t('shortcuts.pageUpDown')}
      </Text>
      <Text color={theme.text.primary}>
        <Text bold color={theme.text.accent}>
          Shift+Tab
        </Text>{' '}
        - {t('shortcuts.shiftTab')}
      </Text>
      <Text color={theme.text.primary}>
        <Text bold color={theme.text.accent}>
          Up/Down
        </Text>{' '}
        - {t('shortcuts.upDown')}
      </Text>
      <Box height={1} />
      <Text color={theme.text.primary}>
        {renderStyledText(
          t('shortcutsDocs'),
          {
            docsPath: (
              <Text bold color={theme.text.accent}>
                {KEYBOARD_SHORTCUTS_URL}
              </Text>
            ),
          },
          theme.text.primary,
        )}
      </Text>
    </Box>
  );
};
