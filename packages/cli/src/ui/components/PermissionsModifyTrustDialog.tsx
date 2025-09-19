/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import type React from 'react';
import { TrustLevel } from '../../config/trustedFolders.js';
import { useKeypress } from '../hooks/useKeypress.js';
import { usePermissionsModifyTrust } from '../hooks/usePermissionsModifyTrust.js';
import { theme } from '../semantic-colors.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';
import Spinner from 'ink-spinner';

interface PermissionsModifyTrustDialogProps {
  onExit: () => void;
}

const TRUST_LEVEL_ITEMS = [
  {
    label: 'Trust this folder',
    value: TrustLevel.TRUST_FOLDER,
  },
  {
    label: 'Trust parent folder',
    value: TrustLevel.TRUST_PARENT,
  },
  {
    label: "Don't trust",
    value: TrustLevel.DO_NOT_TRUST,
  },
];

export function PermissionsModifyTrustDialog({
  onExit,
}: PermissionsModifyTrustDialogProps): React.JSX.Element {
  const {
    cwd,
    loading,
    currentTrustLevel,
    isInheritedTrust,
    needsRestart,
    updateTrustLevel,
  } = usePermissionsModifyTrust(onExit);

  useKeypress(
    (key) => {
      if (key.name === 'escape') {
        onExit();
      }
    },
    { isActive: true },
  );

  if (loading) {
    return (
      <Box>
        <Text color={theme.text.secondary}>
          <Spinner /> Loading...
        </Text>
      </Box>
    );
  }

  const index = TRUST_LEVEL_ITEMS.findIndex(
    (item) => item.value === currentTrustLevel,
  );
  const initialIndex = index === -1 ? 0 : index;

  return (
    <>
      <Box
        borderStyle="round"
        borderColor={theme.border.default}
        flexDirection="column"
        padding={1}
      >
        <Box flexDirection="column" paddingBottom={1}>
          <Text bold>{'> '}Modify Trust Level</Text>
          <Box marginTop={1} />
          <Text>Folder: {cwd}</Text>
          <Text>
            Current Level: <Text bold>{currentTrustLevel || 'Not Set'}</Text>
          </Text>
          {isInheritedTrust && (
            <Text color={theme.text.secondary}>
              Note: This folder appears trusted because a parent folder is
              trusted. You can override this by setting an explicit trust level
              for this folder.
            </Text>
          )}
        </Box>

        <RadioButtonSelect
          items={TRUST_LEVEL_ITEMS}
          onSelect={updateTrustLevel}
          isFocused={true}
          initialIndex={initialIndex}
        />
        <Box marginTop={1}>
          <Text color={theme.text.secondary}>(Use Enter to select)</Text>
        </Box>
      </Box>
      {needsRestart && (
        <Box marginLeft={1} marginTop={1}>
          <Text color={theme.status.warning}>
            <Spinner /> Restarting Gemini CLI to apply trust changes...
          </Text>
        </Box>
      )}
    </>
  );
}
