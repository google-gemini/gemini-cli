/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useRef, useCallback, useState, useMemo, useEffect } from 'react';
import { Box, Text } from 'ink';
import { TextInput } from './shared/TextInput.js';
import { theme } from '../semantic-colors.js';
import type { ConsoleMessageItem } from '../types.js';
import {
  ScrollableList,
  type ScrollableListRef,
} from './shared/ScrollableList.js';
import { useKeypress, type Key } from '../hooks/useKeypress.js';
import { KeypressPriority } from '../contexts/KeypressContext.js';
import { useConsoleMessages } from '../hooks/useConsoleMessages.js';
import { useConfig } from '../contexts/ConfigContext.js';
import type { TextBuffer } from './shared/text-buffer.js';

interface DetailedMessagesDisplayProps {
  maxHeight: number | undefined;
  width: number;
  hasFocus: boolean;
  searchBuffer?: TextBuffer;
}

enum LogLevelLabels {
  all = 'all',
  log = 'log',
  info = 'info',
  warn = 'warn',
  error = 'error',
  debug = 'debug',
}

type DisplayedLogLevel = Exclude<ConsoleMessageItem['type'], 'group'>;
type MessagePresentation = {
  color: string;
  icon: string;
};
type FilterButtonConfig = {
  key: LogLevelLabels;
  label: string;
  color: string;
};

const iconBoxWidth = 3;
const LEVEL_COUNTS_INITIAL_STATE: Record<LogLevelLabels, number> = {
  [LogLevelLabels.all]: 0,
  [LogLevelLabels.log]: 0,
  [LogLevelLabels.info]: 0,
  [LogLevelLabels.warn]: 0,
  [LogLevelLabels.error]: 0,
  [LogLevelLabels.debug]: 0,
};

function getFilterButtons(): readonly FilterButtonConfig[] {
  return [
    {
      key: LogLevelLabels.all,
      label: 'All',
      color: theme.text.primary,
    },
    {
      key: LogLevelLabels.log,
      label: 'Log',
      color: theme.logLevels.log,
    },
    {
      key: LogLevelLabels.info,
      label: 'Info',
      color: theme.logLevels.info,
    },
    {
      key: LogLevelLabels.warn,
      label: 'Warn',
      color: theme.logLevels.warn,
    },
    {
      key: LogLevelLabels.error,
      label: 'Error',
      color: theme.logLevels.error,
    },
    {
      key: LogLevelLabels.debug,
      label: 'Debug',
      color: theme.logLevels.debug,
    },
  ] as const;
}

function getFilterShortcuts(): Record<string, LogLevelLabels> {
  return {
    '1': LogLevelLabels.all,
    '2': LogLevelLabels.log,
    '3': LogLevelLabels.info,
    '4': LogLevelLabels.warn,
    '5': LogLevelLabels.error,
    '6': LogLevelLabels.debug,
  };
}

function getMessagePresentation(type: DisplayedLogLevel): MessagePresentation {
  const messagePresentations: Record<DisplayedLogLevel, MessagePresentation> = {
    log: {
      color: theme.logLevels.log,
      icon: 'ℹ',
    },
    info: {
      color: theme.logLevels.info,
      icon: 'ℹ',
    },
    warn: {
      color: theme.logLevels.warn,
      icon: '⚠',
    },
    error: {
      color: theme.logLevels.error,
      icon: '✖',
    },
    debug: {
      color: theme.logLevels.debug,
      icon: '🔍',
    },
  };

  return (
    messagePresentations[type] ?? {
      color: theme.logLevels.info,
      icon: 'ℹ',
    }
  );
}

export function getLevelFilterShortcut<T extends string>(
  key: Key,
  filterShortcuts: Record<string, T>,
): T | undefined {
  if (!key.alt || key.ctrl || key.cmd) {
    return undefined;
  }

  return filterShortcuts[key.name];
}

export const DetailedMessagesDisplay: React.FC<
  DetailedMessagesDisplayProps
> = ({ maxHeight, width, hasFocus, searchBuffer }) => {
  const scrollableListRef = useRef<ScrollableListRef<ConsoleMessageItem>>(null);
  const [levelFilter, setLevelFilter] = useState<LogLevelLabels>(
    LogLevelLabels.all,
  );
  const [activeSection, setActiveSection] = useState<'list' | 'search'>('list');
  const activeSectionRef = useRef(activeSection);

  useEffect(() => {
    activeSectionRef.current = activeSection;
  }, [activeSection]);

  const filterButtons = useMemo(() => getFilterButtons(), []);
  const filterShortcuts = useMemo(() => getFilterShortcuts(), []);

  const consoleMessages = useConsoleMessages();
  const config = useConfig();

  const messages = useMemo(() => {
    if (config.getDebugMode()) {
      return consoleMessages;
    }
    return consoleMessages.filter((msg) => msg.type !== 'debug');
  }, [consoleMessages, config]);

  const borderAndPadding = 3;
  const normalizedSearchText = searchBuffer?.text.trim().toLowerCase() ?? '';
  const filteredMessages = useMemo(
    () =>
      messages.filter((msg) => {
        if (levelFilter !== LogLevelLabels.all && msg.type !== levelFilter) {
          return false;
        }

        if (normalizedSearchText) {
          return msg.content.toLowerCase().includes(normalizedSearchText);
        }

        return true;
      }),
    [messages, levelFilter, normalizedSearchText],
  );

  const levelCounts = useMemo(() => {
    const counts = { ...LEVEL_COUNTS_INITIAL_STATE };

    for (const msg of messages) {
      counts[msg.type]++;
    }

    counts[LogLevelLabels.all] = messages.length;

    return counts;
  }, [messages]);

  const handleKeypress = useCallback(
    (key: Key): boolean | void => {
      const section = activeSectionRef.current;

      if (key.name === 'f4' && !key.ctrl && !key.alt) {
        setActiveSection(section === 'list' ? 'search' : 'list');
        return true;
      }

      if (key.name === 'escape' && section === 'search') {
        setActiveSection('list');
        return true;
      }

      const shortcutTarget = getLevelFilterShortcut(key, filterShortcuts);
      if (shortcutTarget) {
        setLevelFilter(shortcutTarget);
        return true;
      }
    },
    [filterShortcuts],
  );

  useKeypress(handleKeypress, {
    isActive: hasFocus,
    priority: KeypressPriority.Critical,
  });

  const estimatedItemHeight = useCallback(
    (index: number) => {
      const msg = filteredMessages[index];
      if (!msg) {
        return 1;
      }
      const textWidth = width - borderAndPadding - iconBoxWidth;
      if (textWidth <= 0) {
        return 1;
      }
      const lines = Math.ceil((msg.content?.length || 1) / textWidth);
      return Math.max(1, lines);
    },
    [width, filteredMessages],
  );

  if (messages.length === 0) {
    return null;
  }

  return (
    <Box
      flexDirection="column"
      marginTop={1}
      borderStyle="round"
      borderColor={theme.border.default}
      paddingLeft={1}
      width={width}
      height={maxHeight}
      flexShrink={0}
      flexGrow={0}
      overflow="hidden"
    >
      <Box marginBottom={1}>
        <Text bold color={theme.text.primary}>
          Debug Console{' '}
          <Text color={theme.text.secondary}>
            (F12 to close |{' '}
            <Text
              color={
                activeSection !== 'list'
                  ? theme.status.success
                  : theme.text.secondary
              }
            >
              F4 {activeSection === 'list' ? 'to search' : 'esc search'}
            </Text>
            )
          </Text>
        </Text>
      </Box>
      <Box flexDirection="row" marginBottom={1}>
        {filterButtons.map(({ key, label, color }) => (
          <Box key={key} marginRight={1}>
            <Text
              color={color}
              bold={levelFilter === key}
              underline={levelFilter === key}
            >
              {label}({levelCounts[key]}){levelFilter === key ? '* ' : ' '}
            </Text>
          </Box>
        ))}
      </Box>
      <Box marginBottom={1}>
        <Text color={theme.text.secondary}>Alt+1-6 to filter by level</Text>
      </Box>
      {searchBuffer && activeSection === 'search' && (
        <Box flexDirection="row" alignItems="center" marginBottom={1}>
          <Box
            flexGrow={1}
            minWidth={0}
            borderStyle="round"
            borderColor={theme.border.default}
            paddingX={1}
            height={3}
          >
            <TextInput
              buffer={searchBuffer}
              placeholder="Filter logs"
              focus={hasFocus && activeSection === 'search'}
              priority={KeypressPriority.Critical}
            />
          </Box>
        </Box>
      )}
      <Box height={maxHeight} width={width - borderAndPadding}>
        {filteredMessages.length > 0 ? (
          <ScrollableList
            ref={scrollableListRef}
            data={filteredMessages}
            renderItem={({ item: msg }: { item: ConsoleMessageItem }) => {
              const { color: textColor, icon } = getMessagePresentation(
                msg.type,
              );

              return (
                <Box flexDirection="row">
                  <Box minWidth={iconBoxWidth} flexShrink={0}>
                    <Text color={textColor}>{icon}</Text>
                  </Box>
                  <Text color={textColor} wrap="wrap">
                    {msg.content}
                    {msg.count && msg.count > 1 && (
                      <Text color={theme.text.secondary}> (x{msg.count})</Text>
                    )}
                  </Text>
                </Box>
              );
            }}
            keyExtractor={(item) => item.id}
            estimatedItemHeight={estimatedItemHeight}
            hasFocus={hasFocus && activeSection === 'list'}
            initialScrollIndex={Number.MAX_SAFE_INTEGER}
          />
        ) : (
          <Box>
            <Text color={theme.text.secondary}>
              {normalizedSearchText || levelFilter !== LogLevelLabels.all
                ? 'No messages match the filter'
                : 'No messages'}
            </Text>
          </Box>
        )}
      </Box>
    </Box>
  );
};
