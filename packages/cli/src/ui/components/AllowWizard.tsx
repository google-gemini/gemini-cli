/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useMemo } from 'react';
import { Box, Text } from 'ink';
import { DescriptiveRadioButtonSelect } from './shared/DescriptiveRadioButtonSelect.js';
import { TextInput } from './shared/TextInput.js';
import { useTextBuffer } from './shared/text-buffer.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import { theme } from '../semantic-colors.js';
import { useKeypress } from '../hooks/useKeypress.js';
import {
  SettingScope,
  loadSettings,
  type LoadableSettingScope,
} from '../../config/settings.js';
import type { CommandContext } from '../commands/types.js';

interface AllowWizardProps {
  context: CommandContext;
  scope: SettingScope;
  onClose: () => void;
}

export function AllowWizard({ context, scope, onClose }: AllowWizardProps) {
  const [step, setStep] = useState<'select' | 'input'>('select');
  const [type, setType] = useState<'shell' | 'other' | null>(null);
  const terminalSize = useTerminalSize();

  const buffer = useTextBuffer({
    initialText: '',
    viewport: { width: Math.max(20, terminalSize.columns - 4), height: 1 }, // Adjust width for padding/borders, ensure min width
    isValidPath: () => true, // Simple validation for now
    singleLine: true,
  });

  useKeypress(
    (key) => {
      if (key.name === 'escape') {
        onClose();
      }
    },
    { isActive: true },
  );

  const options = useMemo(
    () => [
      {
        value: 'shell',
        title: 'Shell Command',
        description: 'Allow specific shell commands (e.g. "git status")',
        key: '1',
      },
      {
        value: 'other',
        title: 'Other Tool',
        description: 'Allow other tools by name (e.g. "read_file")',
        key: '2',
      },
    ],
    [],
  );

  const handleSelect = useCallback((value: string) => {
    setType(value as 'shell' | 'other');
    setStep('input');
  }, []);

  const handleInputSubmit = useCallback(
    async (input: string) => {
      const tools = input
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      if (tools.length === 0) return;

      const settings = loadSettings(process.cwd());
      // Safe cast because we know the scope passed from allowCommand is valid for loading/saving
      // (User or Workspace)
      const loadableScope = scope as LoadableSettingScope;
      const existingSettings = settings.forScope(loadableScope).settings;
      const currentAllowed = existingSettings.tools?.allowed || [];

      const newAllowed = [...currentAllowed];
      let addedCount = 0;

      tools.forEach((tool) => {
        // If shell, wrap in run_shell_command(). If it already has it, don't double wrap.
        let finalTool = tool;
        if (type === 'shell') {
          if (
            !tool.startsWith('run_shell_command(') &&
            !tool.startsWith('ShellTool(')
          ) {
            finalTool = `run_shell_command(${tool})`;
          }
        }

        if (!newAllowed.includes(finalTool)) {
          newAllowed.push(finalTool);
          addedCount++;
        }
      });

      if (addedCount > 0) {
        settings.setValue(loadableScope, 'tools.allowed', newAllowed);

        // Update in-memory config
        if (context.services.config) {
          const reloadedSettings = loadSettings(process.cwd());
          const mergedAllowed = reloadedSettings.merged.tools?.allowed || [];
          await context.services.config.setAllowedTools(mergedAllowed);
        }

        context.ui.addItem(
          {
            type: 'info',
            text: `Added ${addedCount} tool(s) to ${scope === SettingScope.User ? 'User' : 'Workspace'} allowlist.`,
          },
          Date.now(),
        );
      } else {
        context.ui.addItem(
          {
            type: 'info',
            text: `No new tools added (duplicates or empty).`,
          },
          Date.now(),
        );
      }

      onClose();
    },
    [type, scope, context, onClose],
  );

  if (step === 'select') {
    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={theme.border.default}
        padding={1}
      >
        <Text bold>Allow Tools</Text>
        <Box marginTop={1}>
          <Text color={theme.status.warning}>
            {scope === SettingScope.Workspace
              ? 'You are modifying the Workspace (project) scope.'
              : 'You are modifying the User (global) scope.'}
          </Text>
        </Box>
        <Box marginTop={1}>
          <Text color={theme.text.secondary}>
            Select the type of tool you want to allow:
          </Text>
        </Box>
        <Box marginTop={1}>
          <DescriptiveRadioButtonSelect
            items={options}
            onSelect={handleSelect}
            showNumbers
          />
        </Box>
        <Box marginTop={1}>
          <Text color={theme.text.secondary}>(Press Esc to cancel)</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.border.default}
      padding={1}
    >
      <Text bold>Allow {type === 'shell' ? 'Shell Commands' : 'Tools'}</Text>
      <Box marginTop={1} marginBottom={1}>
        <Text>
          Enter {type === 'shell' ? 'commands' : 'tool names'} to allow,
          separated by commas.
          {type === 'shell' && (
            <Text color={theme.text.secondary}>
              {' '}
              (e.g. &quot;ls -la, git status&quot;)
            </Text>
          )}
        </Text>
      </Box>
      <TextInput
        buffer={buffer}
        placeholder="> "
        onSubmit={handleInputSubmit}
        onCancel={onClose}
      />
    </Box>
  );
}
