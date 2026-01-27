/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import type React from 'react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import * as process from 'node:process';
import * as path from 'node:path';
import { TrustLevel } from '../../config/trustedFolders.js';
import { useKeypress } from '../hooks/useKeypress.js';
import { usePermissionsModifyTrust } from '../hooks/usePermissionsModifyTrust.js';
import { theme } from '../semantic-colors.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';
import { relaunchApp } from '../../utils/processUtils.js';
import { type UseHistoryManagerReturn } from '../hooks/useHistoryManager.js';

export interface PermissionsDialogProps {
  targetDirectory?: string;
}

interface PermissionsModifyTrustDialogProps extends PermissionsDialogProps {
  onExit: () => void;
  addItem: UseHistoryManagerReturn['addItem'];
}

export function PermissionsModifyTrustDialog({
  onExit,
  addItem,
  targetDirectory,
}: PermissionsModifyTrustDialogProps): React.JSX.Element {
  const { t } = useTranslation('dialogs');
  const currentDirectory = targetDirectory ?? process.cwd();
  const dirName = path.basename(currentDirectory);
  const parentFolder = path.basename(path.dirname(currentDirectory));

  const trustLevelItems = useMemo(
    () => [
      {
        label: t('permissions.trustThisFolder', { dirName }),
        value: TrustLevel.TRUST_FOLDER,
        key: TrustLevel.TRUST_FOLDER,
      },
      {
        label: t('permissions.trustParentFolder', { parentFolder }),
        value: TrustLevel.TRUST_PARENT,
        key: TrustLevel.TRUST_PARENT,
      },
      {
        label: t('permissions.dontTrust'),
        value: TrustLevel.DO_NOT_TRUST,
        key: TrustLevel.DO_NOT_TRUST,
      },
    ],
    [t, dirName, parentFolder],
  );

  const {
    cwd,
    currentTrustLevel,
    isInheritedTrustFromParent,
    isInheritedTrustFromIde,
    needsRestart,
    updateTrustLevel,
    commitTrustLevelChange,
  } = usePermissionsModifyTrust(onExit, addItem, currentDirectory);

  useKeypress(
    (key) => {
      if (key.name === 'escape') {
        onExit();
        return true;
      }
      if (needsRestart && key.name === 'r') {
        const success = commitTrustLevelChange();
        if (success) {
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          relaunchApp();
        } else {
          onExit();
        }
        return true;
      }
      return false;
    },
    { isActive: true },
  );

  const index = trustLevelItems.findIndex(
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
          <Text bold>
            {'> '}
            {t('permissions.title')}
          </Text>
          <Box marginTop={1} />
          <Text>{t('permissions.folder', { cwd })}</Text>
          <Text>
            {t('permissions.currentLevel')}
            <Text bold>{currentTrustLevel || t('permissions.notSet')}</Text>
          </Text>
          {isInheritedTrustFromParent && (
            <Text color={theme.text.secondary}>
              {t('permissions.inheritedFromParent')}
            </Text>
          )}
          {isInheritedTrustFromIde && (
            <Text color={theme.text.secondary}>
              {t('permissions.inheritedFromIde')}
            </Text>
          )}
        </Box>

        <RadioButtonSelect
          items={trustLevelItems}
          onSelect={updateTrustLevel}
          isFocused={true}
          initialIndex={initialIndex}
        />
        <Box marginTop={1}>
          <Text color={theme.text.secondary}>
            {t('permissions.instructions')}
          </Text>
        </Box>
      </Box>
      {needsRestart && (
        <Box marginLeft={1} marginTop={1}>
          <Text color={theme.status.warning}>
            {t('permissions.restartPrompt')}
          </Text>
        </Box>
      )}
    </>
  );
}
