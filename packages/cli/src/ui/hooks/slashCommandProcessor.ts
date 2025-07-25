/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useMemo, useEffect, useState } from 'react';
import { type PartListUnion } from '@google/genai';
import process from 'node:process';
import { UseHistoryManagerReturn } from './useHistoryManager.js';
import { useStateAndRef } from './useStateAndRef.js';
import { Config, GitService, Logger } from '@google/gemini-cli-core';
import { useSessionStats } from '../contexts/SessionContext.js';
import {
  Message,
  MessageType,
  HistoryItemWithoutId,
  HistoryItem,
  SlashCommandProcessorResult,
} from '../types.js';
import { LoadedSettings } from '../../config/settings.js';
import { type CommandContext, type SlashCommand } from '../commands/types.js';
import { CommandService } from '../../services/CommandService.js';
import { BuiltinCommandLoader } from '../../services/BuiltinCommandLoader.js';
import { FileCommandLoader } from '../../services/FileCommandLoader.js';

/**
 * Hook to define and process slash commands (e.g., /help, /clear).
 */
export const useSlashCommandProcessor = (
  config: Config | null,
  settings: LoadedSettings,
  addItem: UseHistoryManagerReturn['addItem'],
  clearItems: UseHistoryManagerReturn['clearItems'],
  loadHistory: UseHistoryManagerReturn['loadHistory'],
  refreshStatic: () => void,
  setShowHelp: React.Dispatch<React.SetStateAction<boolean>>,
  onDebugMessage: (message: string) => void,
  openThemeDialog: () => void,
  openAuthDialog: () => void,
  openEditorDialog: () => void,
  toggleCorgiMode: () => void,
  setQuittingMessages: (message: HistoryItem[]) => void,
  openPrivacyNotice: () => void,
) => {
  const session = useSessionStats();
  const [commands, setCommands] = useState<readonly SlashCommand[]>([]);
  const gitService = useMemo(() => {
    if (!config?.getProjectRoot()) {
      return;
    }
    return new GitService(config.getProjectRoot());
  }, [config]);

  const logger = useMemo(() => {
    const l = new Logger(config?.getSessionId() || '');
    // The logger's initialize is async, but we can create the instance
    // synchronously. Commands that use it will await its initialization.
    return l;
  }, [config]);

  const [pendingCompressionItemRef, setPendingCompressionItem] =
    useStateAndRef<HistoryItemWithoutId | null>(null);

  const pendingHistoryItems = useMemo(() => {
    const items: HistoryItemWithoutId[] = [];
    if (pendingCompressionItemRef.current != null) {
      items.push(pendingCompressionItemRef.current);
    }
    return items;
  }, [pendingCompressionItemRef]);

  const addMessage = useCallback(
    (message: Message) => {
      // Convert Message to HistoryItemWithoutId
      let historyItemContent: HistoryItemWithoutId;
      if (message.type === MessageType.ABOUT) {
        historyItemContent = {
          type: 'about',
          cliVersion: message.cliVersion,
          osVersion: message.osVersion,
          sandboxEnv: message.sandboxEnv,
          modelVersion: message.modelVersion,
          selectedAuthType: message.selectedAuthType,
          gcpProject: message.gcpProject,
        };
      } else if (message.type === MessageType.STATS) {
        historyItemContent = {
          type: 'stats',
          duration: message.duration,
        };
      } else if (message.type === MessageType.MODEL_STATS) {
        historyItemContent = {
          type: 'model_stats',
        };
      } else if (message.type === MessageType.TOOL_STATS) {
        historyItemContent = {
          type: 'tool_stats',
        };
      } else if (message.type === MessageType.QUIT) {
        historyItemContent = {
          type: 'quit',
          duration: message.duration,
        };
      } else if (message.type === MessageType.COMPRESSION) {
        historyItemContent = {
          type: 'compression',
          compression: message.compression,
        };
      } else {
        historyItemContent = {
          type: message.type,
          text: message.content,
        };
      }
      addItem(historyItemContent, message.timestamp.getTime());
    },
    [addItem],
  );

  const commandContext = useMemo(
    (): CommandContext => ({
      services: {
        config,
        settings,
        git: gitService,
        logger,
      },
      ui: {
        addItem,
        clear: () => {
          clearItems();
          console.clear();
          refreshStatic();
        },
        loadHistory,
        setDebugMessage: onDebugMessage,
        pendingItem: pendingCompressionItemRef.current,
        setPendingItem: setPendingCompressionItem,
        toggleCorgiMode,
      },
      session: {
        stats: session.stats,
      },
    }),
    [
      config,
      settings,
      gitService,
      logger,
      loadHistory,
      addItem,
      clearItems,
      refreshStatic,
      session.stats,
      onDebugMessage,
      pendingCompressionItemRef,
      setPendingCompressionItem,
      toggleCorgiMode,
    ],
  );

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      const loaders = [
        new BuiltinCommandLoader(config),
        new FileCommandLoader(config),
      ];
      const commandService = await CommandService.create(
        loaders,
        controller.signal,
      );
      setCommands(commandService.getCommands());
    };

    load();

    return () => {
      controller.abort();
    };
  }, [config]);

  const handleSlashCommand = useCallback(
    async (
      rawQuery: PartListUnion,
    ): Promise<SlashCommandProcessorResult | false> => {
      if (typeof rawQuery !== 'string') {
        return false;
      }

      const trimmed = rawQuery.trim();
      if (!trimmed.startsWith('/') && !trimmed.startsWith('?')) {
        return false;
      }

      const userMessageTimestamp = Date.now();
      addItem({ type: MessageType.USER, text: trimmed }, userMessageTimestamp);

      const parts = trimmed.substring(1).trim().split(/\s+/);
      const commandPath = parts.filter((p) => p); // The parts of the command, e.g., ['memory', 'add']

      let currentCommands = commands;
      let commandToExecute: SlashCommand | undefined;
      let pathIndex = 0;

      for (const part of commandPath) {
        // TODO: For better performance and architectural clarity, this two-pass
        // search could be replaced. A more optimal approach would be to
        // pre-compute a single lookup map in `CommandService.ts` that resolves
        // all name and alias conflicts during the initial loading phase. The
        // processor would then perform a single, fast lookup on that map.

        // First pass: check for an exact match on the primary command name.
        let foundCommand = currentCommands.find((cmd) => cmd.name === part);

        // Second pass: if no primary name matches, check for an alias.
        if (!foundCommand) {
          foundCommand = currentCommands.find((cmd) =>
            cmd.altNames?.includes(part),
          );
        }

        if (foundCommand) {
          commandToExecute = foundCommand;
          pathIndex++;
          if (foundCommand.subCommands) {
            currentCommands = foundCommand.subCommands;
          } else {
            break;
          }
        } else {
          break;
        }
      }

      if (commandToExecute) {
        const args = parts.slice(pathIndex).join(' ');

        if (commandToExecute.action) {
          const fullCommandContext: CommandContext = {
            ...commandContext,
            invocation: {
              raw: trimmed,
              name: commandToExecute.name,
              args,
            },
          };
          const result = await commandToExecute.action(
            fullCommandContext,
            args,
          );

          if (result) {
            switch (result.type) {
              case 'tool':
                return {
                  type: 'schedule_tool',
                  toolName: result.toolName,
                  toolArgs: result.toolArgs,
                };
              case 'message':
                addItem(
                  {
                    type:
                      result.messageType === 'error'
                        ? MessageType.ERROR
                        : MessageType.INFO,
                    text: result.content,
                  },
                  Date.now(),
                );
                return { type: 'handled' };
              case 'dialog':
                switch (result.dialog) {
                  case 'help':
                    setShowHelp(true);
                    return { type: 'handled' };
                  case 'auth':
                    openAuthDialog();
                    return { type: 'handled' };
                  case 'theme':
                    openThemeDialog();
                    return { type: 'handled' };
                  case 'editor':
                    openEditorDialog();
                    return { type: 'handled' };
                  case 'privacy':
                    openPrivacyNotice();
                    return { type: 'handled' };
                  default: {
                    const unhandled: never = result.dialog;
                    throw new Error(
                      `Unhandled slash command result: ${unhandled}`,
                    );
                  }
                }
              case 'load_history': {
                await config
                  ?.getGeminiClient()
                  ?.setHistory(result.clientHistory);
                fullCommandContext.ui.clear();
                result.history.forEach((item, index) => {
                  fullCommandContext.ui.addItem(item, index);
                });
                return { type: 'handled' };
              }
              case 'quit':
                setQuittingMessages(result.messages);
                setTimeout(() => {
                  process.exit(0);
                }, 100);
                return { type: 'handled' };

              case 'submit_prompt':
                return {
                  type: 'submit_prompt',
                  content: result.content,
                };
              default: {
                const unhandled: never = result;
                throw new Error(`Unhandled slash command result: ${unhandled}`);
              }
            }
          }

          return { type: 'handled' };
        } else if (commandToExecute.subCommands) {
          const helpText = `Command '/${commandToExecute.name}' requires a subcommand. Available:\n${commandToExecute.subCommands
            .map((sc) => `  - ${sc.name}: ${sc.description || ''}`)
            .join('\n')}`;
          addMessage({
            type: MessageType.INFO,
            content: helpText,
            timestamp: new Date(),
          });
          return { type: 'handled' };
        }
      }

      addMessage({
        type: MessageType.ERROR,
        content: `Unknown command: ${trimmed}`,
        timestamp: new Date(),
      });
      return { type: 'handled' };
    },
    [
      config,
      addItem,
      setShowHelp,
      openAuthDialog,
      commands,
      commandContext,
      addMessage,
      openThemeDialog,
      openPrivacyNotice,
      openEditorDialog,
      setQuittingMessages,
    ],
  );

  return {
    handleSlashCommand,
    slashCommands: commands,
    pendingHistoryItems,
    commandContext,
  };
};
