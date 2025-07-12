/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../colors.js';
import { type Config } from '@google/gemini-cli-core';

interface ListItemProps {
  name: string;
  details?: string;
  isActive: boolean;
  inactiveText?: string;
}

const ListItem: React.FC<ListItemProps> = ({
  name,
  details,
  isActive,
  inactiveText,
}) => {
  const detailsText = details ? ` ${details}` : '';
  if (isActive) {
    return (
      <Text>
        <Text color={Colors.Foreground}>- </Text>
        <Text color={Colors.AccentBlue}>{name}</Text>
        <Text dimColor>{detailsText}</Text>
      </Text>
    );
  } else {
    return (
      <Text dimColor>
        - {name}
        {detailsText} {inactiveText}
      </Text>
    );
  }
};

interface SectionProps {
  title: string;
  children: React.ReactNode;
}

const Section: React.FC<SectionProps> = ({ title, children }) => (
  <Box flexDirection="column">
    <Text color={Colors.Foreground}>{title}: </Text>
    <Box flexDirection="column" paddingLeft={2}>
      {children}
    </Box>
  </Box>
);

export const ExtensionsSummary: React.FC<{ config: Config }> = ({ config }) => {
  const allExtensions = config.getAllExtensions();
  const mcpServers = config.getMcpServers() || {};
  const mcpServerNames = Object.keys(mcpServers);
  const blockedMcpServers = config.getBlockedMcpServers();

  const hasExtensions = allExtensions.length > 0;
  const hasMcpServers =
    mcpServerNames.length > 0 || blockedMcpServers.length > 0;

  if (!hasExtensions && !hasMcpServers) {
    return null;
  }

  return (
    <Box flexDirection="column" marginBottom={1}>
      {hasExtensions && (
        <Section title="Extensions">
          {allExtensions.map((ext) => (
            <ListItem
              key={ext.name}
              name={ext.name}
              details={`(v${ext.version})`}
              isActive={ext.isActive}
              inactiveText="(inactive)"
            />
          ))}
        </Section>
      )}
      {hasMcpServers && (
        <Section title="MCP Servers">
          {mcpServerNames.map((server) => {
            const extensionName = mcpServers[server].extensionName;
            return (
              <ListItem
                key={server}
                name={server}
                details={extensionName ? `(from ${extensionName})` : ''}
                isActive={true}
              />
            );
          })}
          {blockedMcpServers.map((server) => (
            <ListItem
              key={server.name}
              name={server.name}
              details={
                server.extensionName ? `(from ${server.extensionName})` : ''
              }
              isActive={false}
              inactiveText="(blocked)"
            />
          ))}
        </Section>
      )}
    </Box>
  );
};
