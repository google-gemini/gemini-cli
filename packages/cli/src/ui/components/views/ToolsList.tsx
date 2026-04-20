/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../../semantic-colors.js';
import { type ToolDefinition } from '../../types.js';
import { MarkdownDisplay } from '../../utils/MarkdownDisplay.js';

interface ToolsListProps {
  tools: readonly ToolDefinition[];
  showDescriptions: boolean;
  terminalWidth: number;
}

/** Maps a tool kind value to a human-readable label. */
function formatKind(kind?: string): string {
  if (!kind) return '';
  const labels: Record<string, string> = {
    read: 'read',
    edit: 'edit',
    delete: 'delete',
    move: 'move',
    search: 'search',
    execute: 'execute',
    think: 'think',
    agent: 'agent',
    fetch: 'fetch',
    communicate: 'communicate',
    plan: 'plan',
    switch_mode: 'switch-mode',
    other: 'other',
  };
  return labels[kind] ?? kind;
}

/** Groups tools by their source category. */
function groupTools(tools: readonly ToolDefinition[]) {
  const builtin: ToolDefinition[] = [];
  const extension: ToolDefinition[] = [];
  const discovered: ToolDefinition[] = [];
  const mcpByServer: Map<string, ToolDefinition[]> = new Map();

  for (const tool of tools) {
    switch (tool.source) {
      case 'mcp': {
        const server = tool.serverName ?? 'unknown';
        if (!mcpByServer.has(server)) {
          mcpByServer.set(server, []);
        }
        mcpByServer.get(server)!.push(tool);
        break;
      }
      case 'discovered':
        discovered.push(tool);
        break;
      case 'extension':
        extension.push(tool);
        break;
      default:
        builtin.push(tool);
        break;
    }
  }

  return { builtin, extension, discovered, mcpByServer };
}

const ToolEntry: React.FC<{
  tool: ToolDefinition;
  showDescriptions: boolean;
  terminalWidth: number;
}> = ({ tool, showDescriptions, terminalWidth }) => (
  <Box flexDirection="row" marginLeft={2}>
    <Text color={theme.text.secondary}>{'  '}</Text>
    <Box flexDirection="column">
      <Box flexDirection="row">
        <Text bold color={theme.text.accent}>
          {tool.displayName}
        </Text>
        <Text color={theme.text.secondary}> ({tool.name})</Text>
        {tool.kind && (
          <Text color={theme.ui.comment}> [{formatKind(tool.kind)}]</Text>
        )}
        {tool.isReadOnly && (
          <Text color={theme.status.success}> [read-only]</Text>
        )}
      </Box>
      {showDescriptions && tool.description && (
        <Box marginLeft={2} marginBottom={1}>
          <MarkdownDisplay
            terminalWidth={terminalWidth - 6}
            text={tool.description}
            isPending={false}
          />
        </Box>
      )}
    </Box>
  </Box>
);

const SectionHeader: React.FC<{
  title: string;
  count: number;
  color?: string;
}> = ({ title, count, color }) => (
  <Box flexDirection="row" marginTop={1}>
    <Text bold color={color ?? theme.text.primary}>
      {title}
    </Text>
    <Text color={theme.text.secondary}> ({count})</Text>
  </Box>
);

const Separator: React.FC = () => (
  <Box marginTop={0}>
    <Text color={theme.ui.dark}>{'  ' + '-'.repeat(40)}</Text>
  </Box>
);

export const ToolsList: React.FC<ToolsListProps> = ({
  tools,
  showDescriptions,
  terminalWidth,
}) => {
  if (tools.length === 0) {
    return (
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color={theme.text.primary}>
          Available Tools
        </Text>
        <Box height={1} />
        <Text color={theme.text.secondary}> No tools available</Text>
      </Box>
    );
  }

  const { builtin, extension, discovered, mcpByServer } = groupTools(tools);
  const sections: React.ReactNode[] = [];

  if (builtin.length > 0) {
    sections.push(
      <Box key="builtin" flexDirection="column">
        <SectionHeader
          title="Built-in Tools"
          count={builtin.length}
          color={theme.ui.active}
        />
        {builtin.map((tool) => (
          <ToolEntry
            key={tool.name}
            tool={tool}
            showDescriptions={showDescriptions}
            terminalWidth={terminalWidth}
          />
        ))}
      </Box>,
    );
  }

  if (extension.length > 0) {
    sections.push(
      <Box key="extension" flexDirection="column">
        <Separator />
        <SectionHeader
          title="Extension Tools"
          count={extension.length}
          color={theme.text.link}
        />
        {extension.map((tool) => (
          <ToolEntry
            key={tool.name}
            tool={tool}
            showDescriptions={showDescriptions}
            terminalWidth={terminalWidth}
          />
        ))}
      </Box>,
    );
  }

  if (discovered.length > 0) {
    sections.push(
      <Box key="discovered" flexDirection="column">
        <Separator />
        <SectionHeader
          title="Discovered Tools"
          count={discovered.length}
          color={theme.status.warning}
        />
        {discovered.map((tool) => (
          <ToolEntry
            key={tool.name}
            tool={tool}
            showDescriptions={showDescriptions}
            terminalWidth={terminalWidth}
          />
        ))}
      </Box>,
    );
  }

  if (mcpByServer.size > 0) {
    const sortedServers = Array.from(mcpByServer.entries()).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    let totalMcpTools = 0;
    for (const [, serverTools] of sortedServers) {
      totalMcpTools += serverTools.length;
    }
    sections.push(
      <Box key="mcp" flexDirection="column">
        <Separator />
        <SectionHeader
          title="MCP Tools"
          count={totalMcpTools}
          color={theme.text.accent}
        />
        {sortedServers.map(([serverName, serverTools]) => (
          <Box key={serverName} flexDirection="column" marginLeft={2}>
            <Box flexDirection="row" marginTop={1}>
              <Text bold color={theme.text.link}>
                {serverName}
              </Text>
              <Text color={theme.text.secondary}> ({serverTools.length})</Text>
            </Box>
            {serverTools.map((tool) => (
              <ToolEntry
                key={tool.name}
                tool={tool}
                showDescriptions={showDescriptions}
                terminalWidth={terminalWidth}
              />
            ))}
          </Box>
        ))}
      </Box>,
    );
  }

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold color={theme.text.primary}>
        {'Available Tools'}{' '}
        <Text color={theme.text.secondary}>({tools.length} total)</Text>
      </Text>
      {!showDescriptions && (
        <Text color={theme.text.secondary} dimColor>
          {'  Tip: use /tools desc to show tool descriptions'}
        </Text>
      )}
      {sections}
    </Box>
  );
};
