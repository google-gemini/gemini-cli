/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text, useInput } from 'ink';
import type { GeminiCLIExtension } from '@google/gemini-cli-core';
import { performWorkspaceExtensionMigration } from '../../config/extension.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';
import { theme } from '../semantic-colors.js';
import { useState } from 'react';

export function WorkspaceMigrationDialog(props: {
  workspaceExtensions: GeminiCLIExtension[];
  onOpen: () => void;
  onClose: () => void;
}) {
  const { workspaceExtensions, onOpen, onClose } = props;
  const [migrationComplete, setMigrationComplete] = useState(false);
  const [failedExtensions, setFailedExtensions] = useState<string[]>([]);
  onOpen();
  const onMigrate = async () => {
    const failed = await performWorkspaceExtensionMigration(
      workspaceExtensions,
      // We aren't updating extensions, just moving them around, don't need to ask for consent.
      async (_) => true,
    );
    setFailedExtensions(failed);
    setMigrationComplete(true);
  };

  useInput((input) => {
    if (migrationComplete && input === 'q') {
      process.exit(0);
    }
  });

  if (migrationComplete) {
    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={theme.border.default}
        padding={1}
      >
        {failedExtensions.length > 0 ? (
          <>
            <Text color={theme.text.primary}>
              The following extensions failed to migrate. Please try installing
              them manually. To see other changes, Gemini CLI must be restarted.
              Press &apos;q&apos; to quit.
            </Text>
            <Box flexDirection="column" marginTop={1} marginLeft={2}>
              {failedExtensions.map((failed) => (
                <Text key={failed}>- {failed}</Text>
              ))}
            </Box>
          </>
        ) : (
          <Text color={theme.text.primary}>
            Migration complete. To see changes, Gemini CLI must be restarted.
            Press &apos;q&apos; to quit.
          </Text>
        )}
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
      <Text bold color={theme.text.primary}>
        Workspace-level extensions are deprecated{'\n'}
      </Text>
      <Text color={theme.text.primary}>
        Would you like to install them at the user level?
      </Text>
      <Text color={theme.text.primary}>
        The extension definition will remain in your workspace directory.
      </Text>
      <Text color={theme.text.primary}>
        If you opt to skip, you can install them manually using the extensions
        install command.
      </Text>

      <Box flexDirection="column" marginTop={1} marginLeft={2}>
        {workspaceExtensions.map((extension) => (
          <Text key={extension.name}>- {extension.name}</Text>
        ))}
      </Box>
      <Box marginTop={1}>
        <RadioButtonSelect
          items={[
            { label: 'Install all', value: 'migrate', key: 'migrate' },
            { label: 'Skip', value: 'skip', key: 'skip' },
          ]}
          onSelect={(value: string) => {
            if (value === 'migrate') {
              onMigrate();
            } else {
              onClose();
            }
          }}
        />
      </Box>
    </Box>
  );
}
