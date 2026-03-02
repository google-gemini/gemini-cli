/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import type { RegistryExtension } from '../../../config/extensionRegistryClient.js';
import { useKeypress } from '../../hooks/useKeypress.js';
import { keyMatchers, Command } from '../../keyMatchers.js';
import { theme } from '../../semantic-colors.js';

export interface ExtensionDetailsProps {
  extension: RegistryExtension;
  onBack: () => void;
  onInstall: () => void;
  isInstalled: boolean;
}

export function ExtensionDetails({
  extension,
  onBack,
  onInstall,
  isInstalled,
}: ExtensionDetailsProps): React.JSX.Element {
  useKeypress(
    (key) => {
      if (keyMatchers[Command.ESCAPE](key)) {
        onBack();
        return true;
      }
      if (keyMatchers[Command.RETURN](key) && !isInstalled) {
        onInstall();
        return true;
      }
      return false;
    },
    { isActive: true, priority: true },
  );

  return (
    <Box
      flexDirection="column"
      paddingX={1}
      paddingY={0}
      height="100%"
      borderStyle="round"
      borderColor={theme.border.default}
    >
      {/* Header Row */}
      <Box flexDirection="row" justifyContent="space-between" marginBottom={1}>
        <Box>
          <Text color={theme.text.secondary}>
            {'>'} Extensions {'>'}{' '}
          </Text>
          <Text color={theme.text.primary} bold>
            {extension.extensionName}
          </Text>
        </Box>
        <Box flexDirection="row">
          <Text color={theme.text.secondary}>
            {extension.extensionVersion ? `v${extension.extensionVersion}` : ''}{' '}
            |{' '}
          </Text>
          <Text color={theme.status.warning}>⭐ </Text>
          <Text color={theme.text.secondary}>
            {String(extension.stars || 0)} |{' '}
          </Text>
          {extension.isGoogleOwned && (
            <Text color={theme.text.primary}>[G] </Text>
          )}
          <Text color={theme.text.primary}>{extension.fullName}</Text>
        </Box>
      </Box>

      {/* Description */}
      <Box marginBottom={1}>
        <Text color={theme.text.primary}>
          {extension.extensionDescription || extension.repoDescription}
        </Text>
      </Box>

      {/* Features List */}
      <Box flexDirection="row" marginBottom={1}>
        {extension.hasMCP && (
          <Box marginRight={1}>
            <Text color={theme.text.primary}>MCP </Text>
            <Text color={theme.text.secondary}>|</Text>
          </Box>
        )}
        {extension.hasContext && (
          <Box marginRight={1}>
            <Text color={theme.status.error}>Context file </Text>
            <Text color={theme.text.secondary}>|</Text>
          </Box>
        )}
        {extension.hasHooks && (
          <Box marginRight={1}>
            <Text color={theme.status.warning}>Hooks </Text>
            <Text color={theme.text.secondary}>|</Text>
          </Box>
        )}
        {extension.hasSkills && (
          <Box marginRight={1}>
            <Text color={theme.status.success}>Skills </Text>
            <Text color={theme.text.secondary}>|</Text>
          </Box>
        )}
        {extension.hasCustomCommands && (
          <Box marginRight={1}>
            <Text color={theme.text.primary}>Commands</Text>
          </Box>
        )}
      </Box>

      {/* Details about MCP / Context */}
      {extension.hasMCP && (
        <Box flexDirection="column" marginBottom={1}>
          <Text color={theme.text.primary}>
            This extension will run the following MCP servers:
          </Text>
          <Box marginLeft={2}>
            <Text color={theme.text.primary}>
              * {extension.extensionName} (local)
            </Text>
          </Box>
        </Box>
      )}

      {extension.hasContext && (
        <Box flexDirection="column" marginBottom={1}>
          <Text color={theme.text.primary}>
            This extension will append info to your gemini.md context using
            gemini.md
          </Text>
        </Box>
      )}

      {/* Spacer to push warning to bottom */}
      <Box flexGrow={1} />

      {/* Warning Box */}
      {!isInstalled && (
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor={theme.status.warning}
          paddingX={1}
          paddingY={0}
        >
          <Text color={theme.text.primary}>
            The extension you are about to install may have been created by a
            third-party developer and sourced{'\n'}
            from a public repository. Google does not vet, endorse, or guarantee
            the functionality or security{'\n'}
            of extensions. Please carefully inspect any extension and its source
            code before installing to{'\n'}
            understand the permissions it requires and the actions it may
            perform.
          </Text>
          <Box marginTop={1}>
            <Text color={theme.text.primary}>[{'Enter'}] Install</Text>
          </Box>
        </Box>
      )}
      {isInstalled && (
        <Box flexDirection="row" marginTop={1} justifyContent="center">
          <Text color={theme.status.success}>Already Installed</Text>
        </Box>
      )}
    </Box>
  );
}
