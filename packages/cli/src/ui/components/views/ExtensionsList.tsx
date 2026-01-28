/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { useTranslation } from 'react-i18next';
import { useUIState } from '../../contexts/UIStateContext.js';
import { ExtensionUpdateState } from '../../state/extensions.js';
import { debugLogger, type GeminiCLIExtension } from '@google/gemini-cli-core';

interface ExtensionsList {
  extensions: readonly GeminiCLIExtension[];
}

export const ExtensionsList: React.FC<ExtensionsList> = ({ extensions }) => {
  const { t } = useTranslation(['ui', 'dialogs']);
  const { extensionsUpdateState } = useUIState();

  if (extensions.length === 0) {
    return <Text>{t('extensionsList.noExtensions')}</Text>;
  }

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text>{t('extensionsList.installedTitle')}</Text>
      <Box flexDirection="column" paddingLeft={2}>
        {extensions.map((ext) => {
          const state = extensionsUpdateState.get(ext.name);
          const isActive = ext.isActive;
          const activeString = isActive
            ? t('extensionsList.status.active')
            : t('extensionsList.status.disabled');
          const activeColor = isActive ? 'green' : 'grey';

          let stateColor = 'gray';
          let stateText = t('extensionsList.status.unknown');

          switch (state) {
            case ExtensionUpdateState.CHECKING_FOR_UPDATES:
              stateColor = 'cyan';
              stateText = t('extensionsList.updateState.checking');
              break;
            case ExtensionUpdateState.UPDATING:
              stateColor = 'cyan';
              stateText = t('extensionsList.updateState.updating');
              break;
            case ExtensionUpdateState.UPDATE_AVAILABLE:
              stateColor = 'yellow';
              stateText = t('extensionsList.updateState.updateAvailable');
              break;
            case ExtensionUpdateState.UPDATED_NEEDS_RESTART:
              stateColor = 'yellow';
              stateText = t('extensionsList.updateState.updatedNeedsRestart');
              break;
            case ExtensionUpdateState.ERROR:
              stateColor = 'red';
              stateText = t('extensionsList.updateState.error');
              break;
            case ExtensionUpdateState.UP_TO_DATE:
              stateColor = 'green';
              stateText = t('extensionsList.updateState.upToDate');
              break;
            case ExtensionUpdateState.NOT_UPDATABLE:
              stateColor = 'green';
              stateText = t('extensionsList.updateState.notUpdatable');
              break;
            case ExtensionUpdateState.UPDATED:
              stateColor = 'green';
              stateText = t('extensionsList.updateState.updated');
              break;
            case undefined:
              break;
            default:
              debugLogger.warn(`Unhandled ExtensionUpdateState ${state}`);
              break;
          }

          return (
            <Box key={ext.name} flexDirection="column" marginBottom={1}>
              <Text>
                <Text color="cyan">{`${ext.name} (v${ext.version})`}</Text>
                <Text color={activeColor}>{` - ${activeString}`}</Text>
                {state && <Text color={stateColor}>{` (${stateText})`}</Text>}
              </Text>
              {ext.resolvedSettings && ext.resolvedSettings.length > 0 && (
                <Box flexDirection="column" paddingLeft={2}>
                  <Text>{t('extensionsList.settingsLabel')}</Text>
                  {ext.resolvedSettings.map((setting) => (
                    <Text key={setting.name}>
                      - {setting.name}: {setting.value}
                      {setting.scope && (
                        <Text color="gray">
                          {' '}
                          ({t(`dialogs:scopes.${setting.scope.toLowerCase()}`)}
                          {setting.source ? ` - ${setting.source}` : ''})
                        </Text>
                      )}
                    </Text>
                  ))}
                </Box>
              )}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};
