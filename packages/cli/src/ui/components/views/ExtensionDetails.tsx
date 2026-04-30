/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useState } from 'react';
import { Box, Text } from 'ink';
import type { RegistryExtension } from '../../../config/extensionRegistryClient.js';
import { useKeypress } from '../../hooks/useKeypress.js';
import { Command } from '../../key/keyMatchers.js';
import { useKeyMatchers } from '../../hooks/useKeyMatchers.js';
import { theme } from '../../semantic-colors.js';
import { ExtensionUpdateState } from '../../state/extensions.js';

export interface ExtensionDetailsProps {
  extension: RegistryExtension;
  onBack: () => void;
  onInstall: (
    requestConsentOverride: (consent: string) => Promise<boolean>,
  ) => void | Promise<void>;
  onLink: (
    requestConsentOverride: (consent: string) => Promise<boolean>,
  ) => void | Promise<void>;
  isInstalled: boolean;
  updateState?: ExtensionUpdateState;
  onUpdate?: () => void | Promise<void>;
}

export function ExtensionDetails({
  extension,
  onBack,
  onInstall,
  onLink,
  isInstalled,
  updateState,
  onUpdate,
}: ExtensionDetailsProps): React.JSX.Element {
  const keyMatchers = useKeyMatchers();
  const [consentRequest, setConsentRequest] = useState<{
    prompt: string;
    resolve: (value: boolean) => void;
  } | null>(null);
  const [isInstalling, setIsInstalling] = useState(false);

  const isLinkable =
    !extension.url.startsWith('http') &&
    !extension.url.startsWith('git@') &&
    !extension.url.startsWith('sso://');

  useKeypress(
    (key) => {
      if (consentRequest) {
        if (keyMatchers[Command.ESCAPE](key)) {
          consentRequest.resolve(false);
          setConsentRequest(null);
          setIsInstalling(false);
          return true;
        }
        if (keyMatchers[Command.RETURN](key)) {
          consentRequest.resolve(true);
          setConsentRequest(null);
          return true;
        }
        return false;
      }

      if (keyMatchers[Command.ESCAPE](key)) {
        onBack();
        return true;
      }

      if (keyMatchers[Command.RETURN](key) && !isInstalled && !isInstalling) {
        setIsInstalling(true);
        void onInstall(
          (prompt: string) =>
            new Promise((resolve) => {
              setConsentRequest({ prompt, resolve });
            }),
        );
        return true;
      }
      if (
        keyMatchers[Command.LINK_EXTENSION](key) &&
        isLinkable &&
        !isInstalled &&
        !isInstalling
      ) {
        setIsInstalling(true);
        void onLink(
          (prompt: string) =>
            new Promise((resolve) => {
              setConsentRequest({ prompt, resolve });
            }),
        );
        return true;
      }
      if (
        keyMatchers[Command.UPDATE_EXTENSION](key) &&
        updateState === ExtensionUpdateState.UPDATE_AVAILABLE &&
        !isInstalling
      ) {
        void onUpdate?.();
        return true;
      }
      return false;
    },
    { isActive: true, priority: true },
  );

  if (consentRequest) {
    return (
      <Box
        flexDirection="column"
        paddingX={1}
        paddingY={0}
        height="100%"
        borderStyle="round"
        borderColor={theme.status.warning}
      >
        <Box marginBottom={1}>
          <Text color={theme.text.primary}>{consentRequest.prompt}</Text>
        </Box>
        <Box flexGrow={1} />
        <Box flexDirection="row" justifyContent="space-between" marginTop={1}>
          <Text color={theme.text.secondary}>[Esc] Cancel</Text>
          <Text color={theme.text.primary}>[Enter] Accept</Text>
        </Box>
      </Box>
    );
  }

  if (isInstalling) {
    return (
      <Box
        flexDirection="column"
        paddingX={1}
        paddingY={0}
        height="100%"
        borderStyle="round"
        borderColor={theme.border.default}
        justifyContent="center"
        alignItems="center"
      >
        <Text color={theme.text.primary}>
          Installing {extension.extensionName}...
        </Text>
      </Box>
    );
  }

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
          {updateState === ExtensionUpdateState.UPDATE_AVAILABLE && (
            <Box marginLeft={1}>
              <Text color={theme.status.warning}>[I] Update</Text>
            </Box>
          )}
          {updateState === ExtensionUpdateState.UPDATING && (
            <Box marginLeft={1}>
              <Text color={theme.text.secondary}>[Updating...]</Text>
            </Box>
          )}
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
        {[
          extension.hasMCP && { label: 'MCP', color: theme.text.primary },
          extension.hasContext && {
            label: 'Context file',
            color: theme.status.error,
          },
          extension.hasHooks && { label: 'Hooks', color: theme.status.warning },
          extension.hasSkills && {
            label: 'Skills',
            color: theme.status.success,
          },
          extension.hasCustomCommands && {
            label: 'Commands',
            color: theme.text.primary,
          },
        ]
          .filter((f): f is { label: string; color: string } => !!f)
          .map((feature, index, array) => (
            <Box key={feature.label} flexDirection="row">
              <Text color={feature.color}>{feature.label} </Text>
              {index < array.length - 1 && (
                <Box marginRight={1}>
                  <Text color={theme.text.secondary}>|</Text>
                </Box>
              )}
            </Box>
          ))}
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
          <Box marginTop={1} flexDirection="row">
            <Box marginRight={2}>
              <Text color={theme.text.primary}>[{'Enter'}] Install</Text>
            </Box>
            {isLinkable && <Text color={theme.text.primary}>[L] Link</Text>}
          </Box>
        </Box>
      )}
      {isInstalled && updateState !== ExtensionUpdateState.UPDATING && (
        <Box flexDirection="row" marginTop={1} justifyContent="center">
          <Text color={theme.status.success}>Already Installed</Text>
        </Box>
      )}
    </Box>
  );
}
