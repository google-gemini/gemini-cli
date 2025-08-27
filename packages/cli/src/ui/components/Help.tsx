/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../colors.js';
import type { SlashCommand } from '../commands/types.js';
import { CommandKind } from '../commands/types.js';

interface Help {
  commands: readonly SlashCommand[];
}

const CommandList: React.FC<{
  title: string;
  commands: readonly SlashCommand[];
}> = ({ title, commands }) => (
  <>
    <Text bold color={Colors.Foreground}>
      {title}
    </Text>

    {commands
      .filter((command) => command.description)
      .map((command: SlashCommand) => (
        <Box key={command.name} flexDirection="column" paddingLeft={1}>
          <Text color={Colors.Foreground}>
            <Text bold color={Colors.AccentPurple}>
              /{command.name}
            </Text>
            {command.description && ' - ' + command.description}
          </Text>
          {command.subCommands &&
            command.subCommands.map((subCommand) => (
              <Box key={subCommand.name} flexDirection="column" paddingLeft={2}>
                <Text color={Colors.Foreground}>
                  <Text bold color={Colors.AccentPurple}>
                    {subCommand.name}
                  </Text>
                  {subCommand.description && ' - ' + subCommand.description}
                </Text>
              </Box>
            ))}
        </Box>
      ))}
  </>
);

export const Help: React.FC<Help> = ({ commands }) => {
  const builtInCommands: SlashCommand[] = [];
  const customCommands: SlashCommand[] = [];
  for (const command of commands) {
    if (command.kind === CommandKind.BUILT_IN) {
      builtInCommands.push(command);
    } else {
      customCommands.push(command);
    }
  }

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
        Basics:
      </Text>
      <Text color={Colors.Foreground}>
        <Text bold color={Colors.AccentPurple}>
          Add context
        </Text>
        : Use{' '}
        <Text bold color={Colors.AccentPurple}>
          @
        </Text>{' '}
        to specify files for context (e.g.,{' '}
        <Text bold color={Colors.AccentPurple}>
          @src/myFile.ts
        </Text>
        ) to target specific files or folders.
      </Text>
      <Text color={Colors.Foreground}>
        <Text bold color={Colors.AccentPurple}>
          Shell mode
        </Text>
        : Execute shell commands via{' '}
        <Text bold color={Colors.AccentPurple}>
          !
        </Text>{' '}
        (e.g.,{' '}
        <Text bold color={Colors.AccentPurple}>
          !npm run start
        </Text>
        ) or use natural language (e.g.{' '}
        <Text bold color={Colors.AccentPurple}>
          start server
        </Text>
        ).
      </Text>

      {/* Commands */}
      <Box flexDirection="column" paddingTop={1}>
        <CommandList title={'Commands:'} commands={builtInCommands} />
        {/* Special case the shell command */}
        <Box key={'shellCommand'} flexDirection="column" paddingLeft={1}>
          <Text color={Colors.Foreground}>
            <Text bold color={Colors.AccentPurple}>
              !
            </Text>
            {' - shell command'}
          </Text>
        </Box>
      </Box>

      {/* Custom commands, grouped by origin */}
      {customCommands.length > 0 &&
        Object.entries(
          customCommands.reduce(
            (acc, command) => {
              const key =
                command.mcpServerName ||
                command.extensionName ||
                command.originName ||
                'Unknown Origin';
              if (!acc[key]) {
                acc[key] = [];
              }
              acc[key].push(command);
              return acc;
            },
            {} as Record<string, SlashCommand[]>,
          ),
        ).map(([origin, commands]) => {
          let title = 'Commands from unknown location:';
          if (commands[0].mcpServerName !== undefined) {
            title = `Commands from MCP server ${origin}:`;
          } else if (commands[0].extensionName !== undefined) {
            title = `Commands from extension ${origin}:`;
          } else if (commands[0].originName !== undefined) {
            title = `Commands from ${origin}:`;
          }
          return (
            <Box key={origin} flexDirection="column" paddingTop={1}>
              <CommandList title={title} commands={commands} />
            </Box>
          );
        })}

      {/* Shortcuts */}
      <Box key={'shortcuts'} flexDirection="column" paddingTop={1}>
        <Text bold color={Colors.Foreground}>
          Keyboard Shortcuts:
        </Text>
        <Box key={'keyboard-shortcuts'} flexDirection="column" paddingLeft={1}>
          <Text color={Colors.Foreground}>
            <Text bold color={Colors.AccentPurple}>
              Alt+Left/Right
            </Text>{' '}
            - Jump through words in the input
          </Text>
          <Text color={Colors.Foreground}>
            <Text bold color={Colors.AccentPurple}>
              Ctrl+C
            </Text>{' '}
            - Quit application
          </Text>
          <Text color={Colors.Foreground}>
            <Text bold color={Colors.AccentPurple}>
              {process.platform === 'win32' ? 'Ctrl+Enter' : 'Ctrl+J'}
            </Text>{' '}
            {process.platform === 'linux'
              ? '- New line (Alt+Enter works for certain linux distros)'
              : '- New line'}
          </Text>
          <Text color={Colors.Foreground}>
            <Text bold color={Colors.AccentPurple}>
              Ctrl+L
            </Text>{' '}
            - Clear the screen
          </Text>
          <Text color={Colors.Foreground}>
            <Text bold color={Colors.AccentPurple}>
              {process.platform === 'darwin' ? 'Ctrl+X / Meta+Enter' : 'Ctrl+X'}
            </Text>{' '}
            - Open input in external editor
          </Text>
          <Text color={Colors.Foreground}>
            <Text bold color={Colors.AccentPurple}>
              Ctrl+Y
            </Text>{' '}
            - Toggle YOLO mode
          </Text>
          <Text color={Colors.Foreground}>
            <Text bold color={Colors.AccentPurple}>
              Enter
            </Text>{' '}
            - Send message
          </Text>
          <Text color={Colors.Foreground}>
            <Text bold color={Colors.AccentPurple}>
              Esc
            </Text>{' '}
            - Cancel operation / Clear input (double press)
          </Text>
          <Text color={Colors.Foreground}>
            <Text bold color={Colors.AccentPurple}>
              Shift+Tab
            </Text>{' '}
            - Toggle auto-accepting edits
          </Text>
          <Text color={Colors.Foreground}>
            <Text bold color={Colors.AccentPurple}>
              Up/Down
            </Text>{' '}
            - Cycle through your prompt history
          </Text>
        </Box>
      </Box>

      {/* Footer */}
      <Box paddingTop={1}>
        <Text color={Colors.Foreground}>
          For a full list of shortcuts, see{' '}
          <Text bold color={Colors.AccentPurple}>
            docs/keyboard-shortcuts.md
          </Text>
        </Text>
      </Box>
    </Box>
  );
};
