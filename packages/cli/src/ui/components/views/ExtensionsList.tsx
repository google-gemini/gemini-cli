/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import { useUIState } from '../../contexts/UIStateContext.js';
import { ExtensionUpdateState } from '../../state/extensions.js';

export const ExtensionsList = () => {
  const { commandContext, extensionsUpdateState } = useUIState();
  const allExtensions = commandContext.services.config!.getExtensions();

  if (allExtensions.length === 0) {
    return <Text>No extensions installed.</Text>;
  }

  return (
    <Box flexDirection="column" marginTop={1} marginBottom={1}>
      <Text>Installed extensions:</Text>
      <Box flexDirection="column" paddingLeft={2}>
        {allExtensions.map((ext) => {
          const state = extensionsUpdateState.get(ext.name);
          const isActive = ext.isActive;
          const activeString = isActive ? 'active' : 'disabled';
          const activeColor = isActive ? 'green' : 'grey';

          let stateColor = 'gray';
          const stateText = state || 'unknown state';

          switch (state) {
            case ExtensionUpdateState.CHECKING_FOR_UPDATES:
            case ExtensionUpdateState.UPDATING:
              stateColor = 'cyan';
              break;
            case ExtensionUpdateState.UPDATE_AVAILABLE:
            case ExtensionUpdateState.UPDATED_NEEDS_RESTART:
              stateColor = 'yellow';
              break;
            case ExtensionUpdateState.ERROR:
              stateColor = 'red';
              break;
            case ExtensionUpdateState.UP_TO_DATE:
            case ExtensionUpdateState.NOT_UPDATABLE:
              stateColor = 'green';
              break;
            default:
              console.error(`Unhandled ExtensionUpdateState ${state}`);
              break;
          }

          return (
            <Box key={ext.name}>
              <Text>
                <Text color="cyan">{`${ext.name} (v${ext.version})`}</Text>
                <Text color={activeColor}>{` - ${activeString}`}</Text>
                {<Text color={stateColor}>{` (${stateText})`}</Text>}
              </Text>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};
