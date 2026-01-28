/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MCPServerConfig } from '@google/gemini-cli-core';
import { MCPServerStatus } from '@google/gemini-cli-core';
import { Box, Text } from 'ink';
import type React from 'react';
import { useTranslation } from 'react-i18next';
import { MAX_MCP_RESOURCES_TO_SHOW } from '../../constants.js';
import { theme } from '../../semantic-colors.js';
import type {
  HistoryItemMcpStatus,
  JsonMcpPrompt,
  JsonMcpResource,
  JsonMcpTool,
} from '../../types.js';

interface McpStatusProps {
  servers: Record<string, MCPServerConfig>;
  tools: JsonMcpTool[];
  prompts: JsonMcpPrompt[];
  resources: JsonMcpResource[];
  blockedServers: Array<{ name: string; extensionName: string }>;
  serverStatus: (serverName: string) => MCPServerStatus;
  authStatus: HistoryItemMcpStatus['authStatus'];
  enablementState: HistoryItemMcpStatus['enablementState'];
  discoveryInProgress: boolean;
  connectingServers: string[];
  showDescriptions: boolean;
  showSchema: boolean;
}

export const McpStatus: React.FC<McpStatusProps> = ({
  servers,
  tools,
  prompts,
  resources,
  blockedServers,
  serverStatus,
  authStatus,
  enablementState,
  discoveryInProgress,
  connectingServers,
  showDescriptions,
  showSchema,
}) => {
  const { t } = useTranslation('ui');
  const serverNames = Object.keys(servers);

  if (serverNames.length === 0 && blockedServers.length === 0) {
    return (
      <Box flexDirection="column">
        <Text>{t('mcpStatus.noServers')}</Text>
        <Text>
          {t('mcpStatus.documentationPrefix')}
          <Text color={theme.text.link}>
            https://goo.gle/gemini-cli-docs-mcp
          </Text>
          {t('mcpStatus.documentationSuffix')}
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {discoveryInProgress && (
        <Box flexDirection="column" marginBottom={1}>
          <Text color={theme.status.warning}>
            {t('mcpStatus.startingUp', { count: connectingServers.length })}
          </Text>
          <Text color={theme.text.primary}>{t('mcpStatus.startupNote')}</Text>
        </Box>
      )}

      <Text bold>{t('mcpStatus.configuredServers')}</Text>
      <Box height={1} />

      {serverNames.map((serverName) => {
        const server = servers[serverName];
        const serverTools = tools.filter(
          (tool) => tool.serverName === serverName,
        );
        const serverPrompts = prompts.filter(
          (prompt) => prompt.serverName === serverName,
        );
        const serverResources = resources.filter(
          (resource) => resource.serverName === serverName,
        );
        const originalStatus = serverStatus(serverName);
        const hasCachedItems =
          serverTools.length > 0 ||
          serverPrompts.length > 0 ||
          serverResources.length > 0;
        const status =
          originalStatus === MCPServerStatus.DISCONNECTED && hasCachedItems
            ? MCPServerStatus.CONNECTED
            : originalStatus;

        let statusIndicator = '';
        let statusText = '';
        let statusColor = theme.text.primary;

        // Check enablement state
        const serverEnablement = enablementState[serverName];
        const isDisabled = serverEnablement && !serverEnablement.enabled;

        if (isDisabled) {
          statusIndicator = '⏸️';
          statusText = serverEnablement.isSessionDisabled
            ? t('mcpStatus.status.disabledSession')
            : t('mcpStatus.status.disabled');
          statusColor = theme.text.secondary;
        } else {
          switch (status) {
            case MCPServerStatus.CONNECTED:
              statusIndicator = '🟢';
              statusText = t('mcpStatus.status.ready');
              statusColor = theme.status.success;
              break;
            case MCPServerStatus.CONNECTING:
              statusIndicator = '🔄';
              statusText = t('mcpStatus.status.starting');
              statusColor = theme.status.warning;
              break;
            case MCPServerStatus.DISCONNECTED:
            default:
              statusIndicator = '🔴';
              statusText = t('mcpStatus.status.disconnected');
              statusColor = theme.status.error;
              break;
          }
        }

        let serverDisplayName = serverName;
        if (server.extension?.name) {
          serverDisplayName += t('mcpStatus.serverFrom', {
            name: server.extension?.name,
          });
        }

        const toolCount = serverTools.length;
        const promptCount = serverPrompts.length;
        const resourceCount = serverResources.length;
        const parts = [];
        if (toolCount > 0) {
          parts.push(t('mcpStatus.counts.tool', { count: toolCount }));
        }
        if (promptCount > 0) {
          parts.push(t('mcpStatus.counts.prompt', { count: promptCount }));
        }
        if (resourceCount > 0) {
          parts.push(t('mcpStatus.counts.resource', { count: resourceCount }));
        }

        const serverAuthStatus = authStatus[serverName];
        let authStatusNode: React.ReactNode = null;
        if (serverAuthStatus === 'authenticated') {
          authStatusNode = <Text>{t('mcpStatus.auth.oauth')}</Text>;
        } else if (serverAuthStatus === 'expired') {
          authStatusNode = (
            <Text color={theme.status.error}>
              {t('mcpStatus.auth.oauthExpired')}
            </Text>
          );
        } else if (serverAuthStatus === 'unauthenticated') {
          authStatusNode = (
            <Text color={theme.status.warning}>
              {t('mcpStatus.auth.oauthNotAuthenticated')}
            </Text>
          );
        }

        return (
          <Box key={serverName} flexDirection="column" marginBottom={1}>
            <Box>
              <Text color={statusColor}>{statusIndicator} </Text>
              <Text bold>{serverDisplayName}</Text>
              <Text>
                {' - '}
                {statusText}
                {status === MCPServerStatus.CONNECTED &&
                  parts.length > 0 &&
                  ` (${parts.join(', ')})`}
              </Text>
              {authStatusNode}
            </Box>
            {status === MCPServerStatus.CONNECTING && (
              <Text>{t('mcpStatus.readyHint')}</Text>
            )}
            {status === MCPServerStatus.DISCONNECTED && toolCount > 0 && (
              <Text>{t('mcpStatus.cachedHint', { count: toolCount })}</Text>
            )}

            {showDescriptions && server?.description && (
              <Text color={theme.text.secondary}>
                {server.description.trim()}
              </Text>
            )}

            {serverTools.length > 0 && (
              <Box flexDirection="column" marginLeft={2}>
                <Text color={theme.text.primary}>
                  {t('mcpStatus.labels.tools')}
                </Text>
                {serverTools.map((tool) => {
                  const schemaContent =
                    showSchema &&
                    tool.schema &&
                    (tool.schema.parametersJsonSchema || tool.schema.parameters)
                      ? JSON.stringify(
                          tool.schema.parametersJsonSchema ??
                            tool.schema.parameters,
                          null,
                          2,
                        )
                      : null;

                  return (
                    <Box key={tool.name} flexDirection="column">
                      <Text>
                        - <Text color={theme.text.primary}>{tool.name}</Text>
                      </Text>
                      {showDescriptions && tool.description && (
                        <Box marginLeft={2}>
                          <Text color={theme.text.secondary}>
                            {tool.description.trim()}
                          </Text>
                        </Box>
                      )}
                      {schemaContent && (
                        <Box flexDirection="column" marginLeft={4}>
                          <Text color={theme.text.secondary}>
                            {t('mcpStatus.labels.parameters')}
                          </Text>
                          <Text color={theme.text.secondary}>
                            {schemaContent}
                          </Text>
                        </Box>
                      )}
                    </Box>
                  );
                })}
              </Box>
            )}

            {serverPrompts.length > 0 && (
              <Box flexDirection="column" marginLeft={2}>
                <Text color={theme.text.primary}>
                  {t('mcpStatus.labels.prompts')}
                </Text>
                {serverPrompts.map((prompt) => (
                  <Box key={prompt.name} flexDirection="column">
                    <Text>
                      - <Text color={theme.text.primary}>{prompt.name}</Text>
                    </Text>
                    {showDescriptions && prompt.description && (
                      <Box marginLeft={2}>
                        <Text color={theme.text.primary}>
                          {prompt.description.trim()}
                        </Text>
                      </Box>
                    )}
                  </Box>
                ))}
              </Box>
            )}

            {serverResources.length > 0 && (
              <Box flexDirection="column" marginLeft={2}>
                <Text color={theme.text.primary}>
                  {t('mcpStatus.labels.resources')}
                </Text>
                {serverResources
                  .slice(0, MAX_MCP_RESOURCES_TO_SHOW)
                  .map((resource, index) => {
                    const label =
                      resource.name ||
                      resource.uri ||
                      t('mcpStatus.labels.resource');
                    return (
                      <Box
                        key={`${resource.serverName}-resource-${index}`}
                        flexDirection="column"
                      >
                        <Text>
                          - <Text color={theme.text.primary}>{label}</Text>
                          {resource.uri ? ` (${resource.uri})` : ''}
                          {resource.mimeType ? ` [${resource.mimeType}]` : ''}
                        </Text>
                        {showDescriptions && resource.description && (
                          <Box marginLeft={2}>
                            <Text color={theme.text.secondary}>
                              {resource.description.trim()}
                            </Text>
                          </Box>
                        )}
                      </Box>
                    );
                  })}
                {serverResources.length > MAX_MCP_RESOURCES_TO_SHOW && (
                  <Text color={theme.text.secondary}>
                    {t('mcpStatus.labels.hidden', {
                      count: serverResources.length - MAX_MCP_RESOURCES_TO_SHOW,
                      name: t('mcpStatus.labels.resource'),
                    })}
                  </Text>
                )}
              </Box>
            )}
          </Box>
        );
      })}

      {blockedServers.map((server) => (
        <Box key={server.name} marginBottom={1}>
          <Text color={theme.status.error}>🔴 </Text>
          <Text bold>
            {server.name}
            {server.extensionName
              ? t('mcpStatus.serverFrom', { name: server.extensionName })
              : ''}
          </Text>
          <Text> - {t('mcpStatus.status.blocked')}</Text>
        </Box>
      ))}
    </Box>
  );
};
