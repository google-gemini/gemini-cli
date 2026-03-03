/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import { useEffect, useState, useRef } from 'react';
import { useUIActions } from '../contexts/UIActionsContext.js';
import { theme } from '../semantic-colors.js';
import { type BackgroundAgent } from '@google/gemini-cli-core';
import { cpLen, cpSlice, getCachedStringWidth } from '../utils/textUtils.js';
import { Command, keyMatchers } from '../keyMatchers.js';
import { useKeypress } from '../hooks/useKeypress.js';
import { formatCommand } from '../utils/keybindingUtils.js';
import {
  ScrollableList,
  type ScrollableListRef,
} from './shared/ScrollableList.js';

import { SCROLL_TO_ITEM_END } from './shared/VirtualizedList.js';

import {
  RadioButtonSelect,
  type RadioSelectItem,
} from './shared/RadioButtonSelect.js';

interface BackgroundAgentDisplayProps {
  agents: Map<string, BackgroundAgent>;
  activeId: string;
  width: number;
  height: number;
  isFocused: boolean;
  isListOpenProp: boolean;
}

const CONTENT_PADDING_X = 1;
const BORDER_WIDTH = 2; // Left and Right border
const HEADER_HEIGHT = 3; // 2 for border, 1 for header
const TAB_DISPLAY_HORIZONTAL_PADDING = 4;

const formatAgentCommandForDisplay = (command: string, maxWidth: number) => {
  const commandFirstLine = command.split('\n')[0];
  return cpLen(commandFirstLine) > maxWidth
    ? `${cpSlice(commandFirstLine, 0, maxWidth - 3)}...`
    : commandFirstLine;
};

export const BackgroundAgentDisplay = ({
  agents,
  activeId,
  width,
  height,
  isFocused,
  isListOpenProp,
}: BackgroundAgentDisplayProps) => {
  const {
    dismissBackgroundAgent,
    setActiveBackgroundAgentId,
    setIsBackgroundAgentListOpen,
  } = useUIActions();
  const activeAgent = agents.get(activeId);
  const [highlightedId, setHighlightedId] = useState<string | null>(activeId);
  const outputRef = useRef<ScrollableListRef<unknown>>(null);

  // Sync highlightedId with activeId when list opens
  useEffect(() => {
    if (isListOpenProp) {
      setHighlightedId(activeId);
    }
  }, [isListOpenProp, activeId]);

  useKeypress(
    (key) => {
      if (!activeAgent) return;

      if (isListOpenProp) {
        if (keyMatchers[Command.BACKGROUND_SHELL_ESCAPE](key)) {
          setIsBackgroundAgentListOpen(false);
          return true;
        }

        if (keyMatchers[Command.KILL_BACKGROUND_SHELL](key)) {
          if (highlightedId) {
            dismissBackgroundAgent(highlightedId);
          }
          return true;
        }

        if (keyMatchers[Command.TOGGLE_BACKGROUND_SHELL_LIST](key)) {
          if (highlightedId) {
            setActiveBackgroundAgentId(highlightedId);
          }
          setIsBackgroundAgentListOpen(false);
          return true;
        }
        return false;
      }

      if (keyMatchers[Command.TOGGLE_BACKGROUND_AGENT](key)) {
        return false;
      }

      if (keyMatchers[Command.KILL_BACKGROUND_SHELL](key)) {
        dismissBackgroundAgent(activeAgent.id);
        return true;
      }

      if (keyMatchers[Command.TOGGLE_BACKGROUND_SHELL_LIST](key)) {
        setIsBackgroundAgentListOpen(true);
        return true;
      }

      return false;
    },
    { isActive: isFocused && !!activeAgent },
  );

  const helpTextParts = [
    { label: 'Close', command: Command.TOGGLE_BACKGROUND_AGENT },
    { label: 'Kill', command: Command.KILL_BACKGROUND_SHELL },
    { label: 'List', command: Command.TOGGLE_BACKGROUND_SHELL_LIST },
  ];

  const helpTextStr = helpTextParts
    .map((p) => `${p.label} (${formatCommand(p.command)})`)
    .join(' | ');

  const renderHelpText = () => (
    <Text>
      {helpTextParts.map((p, i) => (
        <Text key={p.label}>
          {i > 0 ? ' | ' : ''}
          {p.label} (
          <Text color={theme.text.accent}>{formatCommand(p.command)}</Text>)
        </Text>
      ))}
    </Text>
  );

  const renderTabs = () => {
    const agentList = Array.from(agents.values()).filter(
      (a) => a.status === 'running',
    );

    const idInfoWidth = getCachedStringWidth(
      ` (ID: ${activeId.slice(0, 8)}) ${isFocused ? '(Focused)' : ''}`,
    );

    const availableWidth =
      width -
      TAB_DISPLAY_HORIZONTAL_PADDING -
      getCachedStringWidth(helpTextStr) -
      idInfoWidth;

    let currentWidth = 0;
    const tabs = [];

    for (let i = 0; i < agentList.length; i++) {
      const agent = agentList[i];
      const labelOverhead = 4 + (i + 1).toString().length;
      const maxTabLabelLength = Math.max(
        1,
        Math.floor(availableWidth / agentList.length) - labelOverhead,
      );
      const truncatedName = formatAgentCommandForDisplay(
        agent.displayName,
        maxTabLabelLength,
      );
      const label = ` ${i + 1}: ${truncatedName} `;
      const labelWidth = getCachedStringWidth(label);

      if (i > 0 && currentWidth + labelWidth > availableWidth) {
        break;
      }

      const isActive = agent.id === activeId;

      tabs.push(
        <Text
          key={agent.id}
          color={isActive ? theme.text.primary : theme.text.secondary}
          bold={isActive}
        >
          {label}
        </Text>,
      );
      currentWidth += labelWidth;
    }

    if (agentList.length > tabs.length && !isListOpenProp) {
      const overflowLabel = ` ... (${formatCommand(Command.TOGGLE_BACKGROUND_SHELL_LIST)}) `;
      const overflowWidth = getCachedStringWidth(overflowLabel);
      const shouldShowOverflow =
        tabs.length > 1 || availableWidth - currentWidth >= overflowWidth;

      if (shouldShowOverflow) {
        tabs.push(
          <Text key="overflow" color={theme.status.warning} bold>
            {overflowLabel}
          </Text>,
        );
      }
    }

    return tabs;
  };

  const renderAgentList = () => {
    const maxNameLength = Math.max(
      0,
      width - BORDER_WIDTH - CONTENT_PADDING_X * 2 - 15,
    );

    const items: Array<RadioSelectItem<string>> = Array.from(
      agents.values(),
    ).map((agent, index) => {
      const truncatedName = formatAgentCommandForDisplay(
        agent.displayName,
        maxNameLength,
      );

      let label = `${index + 1}: ${truncatedName} (ID: ${agent.id.slice(0, 8)})`;
      if (agent.status !== 'running') {
        label += ` (${agent.status})`;
      }

      return {
        key: agent.id,
        value: agent.id,
        label,
      };
    });

    const initialIndex = items.findIndex((item) => item.value === activeId);

    return (
      <Box flexDirection="column" height="100%" width="100%">
        <Box flexShrink={0} marginBottom={1} paddingTop={1}>
          <Text bold>
            {`Select Agent (${formatCommand(Command.BACKGROUND_SHELL_SELECT)} to select, ${formatCommand(Command.KILL_BACKGROUND_SHELL)} to kill, ${formatCommand(Command.BACKGROUND_SHELL_ESCAPE)} to cancel):`}
          </Text>
        </Box>
        <Box flexGrow={1} width="100%">
          <RadioButtonSelect
            items={items}
            initialIndex={initialIndex >= 0 ? initialIndex : 0}
            onSelect={(id) => {
              setActiveBackgroundAgentId(id);
              setIsBackgroundAgentListOpen(false);
            }}
            onHighlight={(id) => setHighlightedId(id)}
            isFocused={isFocused}
            maxItemsToShow={Math.max(1, height - HEADER_HEIGHT - 3)}
            renderItem={(item) => {
              const agent = agents.get(item.value);
              if (!agent) return <Text>{item.label}</Text>;

              const truncatedName = formatAgentCommandForDisplay(
                agent.displayName,
                maxNameLength,
              );

              return (
                <Text>
                  {truncatedName} (ID: {agent.id.slice(0, 8)})
                  {agent.status !== 'running' ? (
                    <Text
                      color={
                        agent.status === 'completed'
                          ? theme.status.success
                          : theme.status.error
                      }
                    >
                      {' '}
                      ({agent.status})
                    </Text>
                  ) : null}
                </Text>
              );
            }}
          />
        </Box>
      </Box>
    );
  };

  const renderOutput = () => {
    if (!activeAgent) return null;

    const activity = activeAgent.output.recentActivity;

    return (
      <ScrollableList
        ref={outputRef}
        data={activity}
        renderItem={({ item }) => (
          <Box key={item.id} flexDirection="column" marginBottom={1}>
            <Box flexDirection="row">
              <Text color={theme.text.accent} bold>
                {item.type === 'thought'
                  ? '💭 Thought'
                  : `🛠️ Tool: ${item.displayName ?? item.content}`}
              </Text>
              <Text> [{item.status}]</Text>
            </Box>
            <Box paddingLeft={2}>
              <Text dimColor>{item.content}</Text>
            </Box>
          </Box>
        )}
        estimatedItemHeight={() => 3}
        keyExtractor={(item) => item.id}
        hasFocus={isFocused}
        initialScrollIndex={SCROLL_TO_ITEM_END}
      />
    );
  };

  return (
    <Box
      flexDirection="column"
      height="100%"
      width="100%"
      borderStyle="single"
      borderColor={isFocused ? theme.border.focused : undefined}
    >
      <Box
        flexDirection="row"
        justifyContent="space-between"
        borderStyle="single"
        borderBottom={false}
        borderLeft={false}
        borderRight={false}
        borderTop={false}
        paddingX={1}
        borderColor={isFocused ? theme.border.focused : undefined}
      >
        <Box flexDirection="row">
          {renderTabs()}
          <Text bold>
            {' '}
            (ID: {activeId.slice(0, 8)}) {isFocused ? '(Focused)' : ''}
          </Text>
        </Box>
        {renderHelpText()}
      </Box>
      <Box flexGrow={1} overflow="hidden" paddingX={CONTENT_PADDING_X}>
        {isListOpenProp ? renderAgentList() : renderOutput()}
      </Box>
    </Box>
  );
};
