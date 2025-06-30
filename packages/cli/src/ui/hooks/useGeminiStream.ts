/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useCallback, useMemo } from 'react';
import { useInput } from 'ink';
import {
  Config,
  GeminiClient,
  GeminiEventType as ServerGeminiEventType,
  ServerGeminiStreamEvent as GeminiEvent,
  ServerGeminiContentEvent as ContentEvent,
  ServerGeminiErrorEvent as ErrorEvent,
  ServerGeminiChatCompressedEvent,
  getErrorMessage,
  isNodeError,
  MessageSenderType,
  ToolCallRequestInfo,
  logUserPrompt,
  GitService,
  EditorType,
  ThoughtSummary,
  UnauthorizedError,
  UserPromptEvent,
} from '@google/gemini-cli-core';
import { type Part, type PartListUnion, Content } from '@google/genai';
import {
  StreamingState,
  HistoryItem,
  HistoryItemWithoutId,
  HistoryItemToolGroup,
  MessageType,
  ToolCallStatus,
} from '../types.js';
import { isAtCommand } from '../utils/commandUtils.js';
import { parseAndFormatApiError } from '../utils/errorParsing.js';
import { useShellCommandProcessor } from './shellCommandProcessor.js';
import { findLastSafeSplitPoint } from '../utils/markdownUtilities.js';
import { useStateAndRef } from './useStateAndRef.js';
import { UseHistoryManagerReturn } from './useHistoryManager.js';
import { useLogger } from './useLogger.js';
import {
  useReactToolScheduler,
  mapToDisplay as mapTrackedToolCallsToDisplay,
  TrackedToolCall,
  TrackedCompletedToolCall,
  TrackedCancelledToolCall,
} from './useReactToolScheduler.js';
import { useSessionStats } from '../contexts/SessionContext.js';
import { handleEnhancedAtCommand } from './enhancedAtCommandProcessor.js';
import { useFileContext } from '../contexts/FileContextContext.js';

/**
 * Extract file paths from a processed query containing file content
 */
function _extractFilePathsFromProcessedQuery(processedQuery: PartListUnion): string[] {
  const filePaths: string[] = [];
  
  if (Array.isArray(processedQuery)) {
    for (const part of processedQuery) {
      if (typeof part === 'string') {
        // Look for file content markers like "--- Content from @filename ---"
        const fileContentRegex = /--- Content from @([^:]+):/g;
        let match;
        while ((match = fileContentRegex.exec(part)) !== null) {
          filePaths.push(match[1]);
        }
        
        // Also look for "Successfully read: filename1, filename2" patterns
        const successRegex = /Successfully read: (.+)/;
        const successMatch = successRegex.exec(part);
        if (successMatch) {
          const files = successMatch[1].split(',').map(f => f.trim());
          filePaths.push(...files);
        }
      }
    }
  }
  
  // Remove duplicates
  return [...new Set(filePaths)];
}

/**
 * Extract file paths from a query containing @ commands
 */
function _extractFilePathsFromQuery(query: string): string[] {
  const filePaths: string[] = [];
  const contextCommands = ['list', 'show', 'status', 'remove', 'clear', 'clear-all'];
  
  // Updated regex to handle consecutive @ commands without spaces
  // This pattern matches @ followed by non-whitespace characters, but stops at the next @
  const regex = /@([^\s@\\]+(?:\\\s[^\s@\\]+)*)/g;
  let match;
  
  while ((match = regex.exec(query)) !== null) {
    const commandContent = match[1].replace(/\\\s/g, ' '); // Unescape spaces
    
    // Check if this is a context command
    const isExactContextCommand = contextCommands.includes(commandContent);
    const isContextCommandWithArgs = contextCommands.some(cmd => 
      commandContent.startsWith(cmd + ' ')
    );
    
    // Only add to file paths if it's not a context command
    if (!isExactContextCommand && !isContextCommandWithArgs) {
      filePaths.push(commandContent);
    }
  }
  
  return filePaths;
}

export function mergePartListUnions(list: PartListUnion[]): PartListUnion {
  const resultParts: PartListUnion = [];
  for (const item of list) {
    if (Array.isArray(item)) {
      resultParts.push(...item);
    } else {
      resultParts.push(item);
    }
  }
  return resultParts;
}

enum StreamProcessingStatus {
  Completed,
  UserCancelled,
  Error,
}

/**
 * Manages the Gemini stream, including user input, command processing,
 * API interaction, and tool call lifecycle.
 */
export const useGeminiStream = (
  geminiClient: GeminiClient,
  history: HistoryItem[],
  addItem: UseHistoryManagerReturn['addItem'],
  setShowHelp: React.Dispatch<React.SetStateAction<boolean>>,
  config: Config,
  onDebugMessage: (message: string) => void,
  handleSlashCommand: (
    cmd: PartListUnion,
  ) => Promise<
    import('./slashCommandProcessor.js').SlashCommandActionReturn | boolean
  >,
  shellModeActive: boolean,
  getPreferredEditor: () => EditorType | undefined,
  onAuthError: () => void,
  performMemoryRefresh: () => Promise<void>,
) => {
  const { actions, state } = useFileContext();
  const [initError, setInitError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const turnCancelledRef = useRef(false);
  const [isResponding, setIsResponding] = useState<boolean>(false);
  const [thought, setThought] = useState<ThoughtSummary | null>(null);
  const [pendingHistoryItemRef, setPendingHistoryItem] =
    useStateAndRef<HistoryItemWithoutId | null>(null);
  const processedMemoryToolsRef = useRef<Set<string>>(new Set());
  const pendingFilesRef = useRef<Set<string>>(new Set()); // Track files pending Gemini processing
  const geminiContextFilesRef = useRef<Set<string>>(new Set()); // Track files actually in Gemini's context
  const logger = useLogger();
  const gitService = useMemo(() => {
    if (!config.getProjectRoot()) {
      return;
    }
    return new GitService(config.getProjectRoot());
  }, [config]);

  const [toolCalls, scheduleToolCalls, markToolsAsSubmitted] =
    useReactToolScheduler(
      async (completedToolCallsFromScheduler) => {
        // This onComplete is called when ALL scheduled tools for a given batch are done.
        if (completedToolCallsFromScheduler.length > 0) {
          // Add the final state of these tools to the history for display.
          addItem(
            mapTrackedToolCallsToDisplay(
              completedToolCallsFromScheduler as TrackedToolCall[],
            ),
            Date.now(),
          );

          // Handle tool response submission immediately when tools complete
          await handleCompletedTools(
            completedToolCallsFromScheduler as TrackedToolCall[],
          );
        }
      },
      config,
      setPendingHistoryItem,
      getPreferredEditor,
      history.map(item => ({ 
        role: item.type === MessageType.USER ? 'user' : 'model', 
        parts: [{ text: item.text || '' }] 
      })) as Content[],
      undefined,
    );

  const pendingToolCallGroupDisplay = useMemo(
    () =>
      toolCalls.length ? mapTrackedToolCallsToDisplay(toolCalls) : undefined,
    [toolCalls],
  );

  // Method to actually clear Gemini's chat history
  const clearGeminiContext = useCallback(async () => {
    try {
      await geminiClient.resetChat();
      geminiContextFilesRef.current.clear();
      onDebugMessage('✓ Cleared Gemini chat history');
      return true;
    } catch (error) {
      onDebugMessage(`Error clearing Gemini context: ${error}`);
      return false;
    }
  }, [geminiClient, onDebugMessage]);

  // Method to remove specific files from Gemini's context
  const removeFilesFromGeminiContext = useCallback(async (filesToRemove: string[]) => {
    try {
      // Get current history
      const currentHistory = await geminiClient.getHistory();
      
      // Filter out history entries that contain the specified files
      const filteredHistory = currentHistory.filter(content => {
        if (content.role === 'user' && content.parts) {
          const contentText = content.parts
            .map(part => part.text || '')
            .join(' ');
          
          // Check if this content contains any of the files to remove
          return !filesToRemove.some(file => 
            contentText.includes(`@${file}`) || contentText.includes(file)
          );
        }
        return true;
      });
      
      // Set the filtered history back to Gemini
      await geminiClient.setHistory(filteredHistory);
      
      // Update our tracking
      for (const file of filesToRemove) {
        geminiContextFilesRef.current.delete(file);
      }
      
      onDebugMessage(`✓ Removed ${filesToRemove.length} files from Gemini context`);
      return true;
    } catch (error) {
      onDebugMessage(`Error removing files from Gemini context: ${error}`);
      return false;
    }
  }, [geminiClient, onDebugMessage]);

  // Method to sync our tracking with Gemini's actual context
  const _syncContextWithGemini = useCallback(async () => {
    try {
      const geminiHistory = await geminiClient.getHistory();
      const filesInGeminiContext = new Set<string>();
      
      // Extract files from Gemini's history
      for (const content of geminiHistory) {
        if (content.role === 'user' && content.parts) {
          const contentText = content.parts
            .map(part => part.text || '')
            .join(' ');
          
          // Extract @file references
          const fileMatches = contentText.match(/@([^\s\\]+(?:\\\s[^\s\\]+)*)/g);
          if (fileMatches) {
            for (const match of fileMatches) {
              const filePath = match.substring(1).replace(/\\\s/g, ' ');
              filesInGeminiContext.add(filePath);
            }
          }
        }
      }
      
      geminiContextFilesRef.current = filesInGeminiContext;
      onDebugMessage(`Synced context: ${filesInGeminiContext.size} files in Gemini context`);
    } catch (error) {
      onDebugMessage(`Error syncing context with Gemini: ${error}`);
    }
  }, [geminiClient, onDebugMessage]);

  const onExec = useCallback(async (done: Promise<void>) => {
    setIsResponding(true);
    await done;
    setIsResponding(false);
  }, []);
  const { handleShellCommand } = useShellCommandProcessor(
    addItem,
    setPendingHistoryItem,
    onExec,
    onDebugMessage,
    config,
    geminiClient,
  );

  const streamingState = useMemo(() => {
    if (toolCalls.some((tc) => tc.status === 'awaiting_approval')) {
      return StreamingState.WaitingForConfirmation;
    }
    if (
      isResponding ||
      toolCalls.some(
        (tc) =>
          tc.status === 'executing' ||
          tc.status === 'scheduled' ||
          tc.status === 'validating' ||
          ((tc.status === 'success' ||
            tc.status === 'error' ||
            tc.status === 'cancelled') &&
            !(tc as TrackedCompletedToolCall | TrackedCancelledToolCall)
              .responseSubmittedToGemini),
      )
    ) {
      return StreamingState.Responding;
    }
    return StreamingState.Idle;
  }, [isResponding, toolCalls]);

  useInput((_input, key) => {
    if (streamingState === StreamingState.Responding && key.escape) {
      if (turnCancelledRef.current) {
        return;
      }
      turnCancelledRef.current = true;
      abortControllerRef.current?.abort();
      
      // Clear pending files on user cancellation
      if (pendingFilesRef.current.size > 0) {
        onDebugMessage(`Clearing ${pendingFilesRef.current.size} pending files due to user cancellation`);
        pendingFilesRef.current.clear();
      }
      
      if (pendingHistoryItemRef.current) {
        addItem(pendingHistoryItemRef.current, Date.now());
      }
      addItem(
        {
          type: MessageType.INFO,
          text: 'Request cancelled.',
        },
        Date.now(),
      );
      setPendingHistoryItem(null);
      setIsResponding(false);
    }
  });

  const prepareQueryForGemini = useCallback(
    async (
      query: PartListUnion,
      userMessageTimestamp: number,
      abortSignal: AbortSignal,
    ): Promise<{
      queryToSend: PartListUnion | null;
      shouldProceed: boolean;
    }> => {
      if (turnCancelledRef.current) {
        return { queryToSend: null, shouldProceed: false };
      }
      if (typeof query === 'string' && query.trim().length === 0) {
        return { queryToSend: null, shouldProceed: false };
      }

      let localQueryToSendToGemini: PartListUnion | null = null;

      if (typeof query === 'string') {
        const trimmedQuery = query.trim();
        logUserPrompt(
          config,
          new UserPromptEvent(trimmedQuery.length, trimmedQuery),
        );
        onDebugMessage(`User query: '${trimmedQuery}'`);
        await logger?.logMessage(MessageSenderType.USER, trimmedQuery);

        // Handle UI-only commands first
        const slashCommandResult = await handleSlashCommand(trimmedQuery);
        if (typeof slashCommandResult === 'boolean' && slashCommandResult) {
          // Command was handled, and it doesn't require a tool call from here
          return { queryToSend: null, shouldProceed: false };
        } else if (
          typeof slashCommandResult === 'object' &&
          slashCommandResult.shouldScheduleTool
        ) {
          // Slash command wants to schedule a tool call (e.g., /memory add)
          const { toolName, toolArgs } = slashCommandResult;
          if (toolName && toolArgs) {
            const toolCallRequest: ToolCallRequestInfo = {
              callId: `${toolName}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
              name: toolName,
              args: toolArgs,
              isClientInitiated: true,
            };
            scheduleToolCalls([toolCallRequest], abortSignal);
          }
          return { queryToSend: null, shouldProceed: false }; // Handled by scheduling the tool
        }

        if (shellModeActive && handleShellCommand(trimmedQuery, abortSignal)) {
          return { queryToSend: null, shouldProceed: false };
        }

        // Handle @-commands (which might involve tool calls)
        if (isAtCommand(trimmedQuery)) {
          const atCommandResult = await handleEnhancedAtCommand({
            query: trimmedQuery,
            config,
            addItem,
            onDebugMessage,
            messageId: userMessageTimestamp,
            signal: abortSignal,
          });

          // Handle context management commands
          if (atCommandResult.isContextCommand && atCommandResult.contextCommand) {
            const command = atCommandResult.contextCommand;
            const args = atCommandResult.contextArgs || [];

            switch (command) {
              case 'help': {
                // Render the ContextHelp component directly
                const helpContent = `
╭───────────────────────────────────────────────────────────────────────────────────────────────────────────╮
│ Context Management Commands:                                                                              │
│ Use @ commands to manage files in your conversation context.                                              │
│                                                                                                           │
│ File Inclusion:                                                                                          │
│ @filename - Include a specific file in context (e.g., @src/main.ts)                                      │
│ @directory/ - Include all files in a directory (e.g., @src/)                                             │
│                                                                                                           │
│ Context Management:                                                                                      │
│ @list - Show all files currently in context with sizes and token estimates                               │
│ @status - Display current context usage statistics                                                       │
│ @remove filename - Remove a specific file from context                                                   │
│ @clear - Remove all files from context                                                                   │
│                                                                                                           │
│ Tips:                                                                                                    │
│ • Files are automatically tracked when you include them with @                                           │
│ • Context is limited to ~1M tokens - use @status to monitor usage                                        │
│ • Git-ignored files are automatically excluded from context                                              │
│ • Use @list to see what files are currently in your context                                             │
╰───────────────────────────────────────────────────────────────────────────────────────────────────────────╯
                `;
                addItem(
                  { type: MessageType.INFO, text: helpContent },
                  userMessageTimestamp,
                );
                return { queryToSend: null, shouldProceed: false };
              }

              case 'list':
              case 'show': {
                // Get files from both local tracking and Gemini's actual context
                const localFiles = actions.getGeminiContextFiles();
                const geminiFiles = Array.from(geminiContextFilesRef.current);
                
                if (localFiles.length === 0 && geminiFiles.length === 0) {
                  addItem(
                    { type: MessageType.INFO, text: 'No files in context.' },
                    userMessageTimestamp,
                  );
                } else {
                  let message = '';
                  if (localFiles.length > 0) {
                    message += `Files in local tracking:\n${localFiles.map(f => `- ${f}`).join('\n')}`;
                  }
                  if (geminiFiles.length > 0) {
                    if (message) message += '\n\n';
                    message += `Files in Gemini context:\n${geminiFiles.map(f => `- ${f}`).join('\n')}`;
                  }
                  addItem(
                    { type: MessageType.INFO, text: message },
                    userMessageTimestamp,
                  );
                }
                return { queryToSend: null, shouldProceed: false };
              }

              case 'status': {
                const status = actions.getContextStatus();
                const localFilesCount = actions.getGeminiContextFiles().length;
                const geminiFilesCount = geminiContextFilesRef.current.size;
                addItem(
                  { 
                    type: MessageType.INFO, 
                    text: `Context Status: ${localFilesCount} files tracked locally, ${geminiFilesCount} files in Gemini context, ${status.tokens} tokens (${status.percentage}% of limit)` 
                  },
                  userMessageTimestamp,
                );
                return { queryToSend: null, shouldProceed: false };
              }

              case 'remove': {
                onDebugMessage(`[DEBUG] @remove command args: ${JSON.stringify(args)}`);
                onDebugMessage(`[DEBUG] Current state files count: ${state.files.size}`);
                onDebugMessage(`[DEBUG] Current state files: ${Array.from(state.files.keys()).join(', ')}`);
                
                if (args.length === 0) {
                  // Show suggestions of available files - use state directly
                  const fileEntries = Array.from(state.files.entries());
                  const availableFiles = fileEntries
                    .filter(([_, fileInfo]) => fileInfo.processedByGemini)
                    .map(([filePath, _]) => filePath);
                  const pendingFiles = fileEntries
                    .filter(([_, fileInfo]) => !fileInfo.processedByGemini)
                    .map(([filePath, _]) => filePath);
                  const allFiles = [...availableFiles, ...pendingFiles];
                  
                  onDebugMessage(`[DEBUG] Available files: ${JSON.stringify(availableFiles)}`);
                  onDebugMessage(`[DEBUG] Pending files: ${JSON.stringify(pendingFiles)}`);
                  onDebugMessage(`[DEBUG] All files: ${JSON.stringify(allFiles)}`);
                  
                  if (allFiles.length === 0) {
                    addItem(
                      { type: MessageType.INFO, text: 'No files in context to remove.' },
                      userMessageTimestamp,
                    );
                  } else {
                    let message = 'Available files for removal:\n';
                    if (availableFiles.length > 0) {
                      message += `\nProcessed files:\n${availableFiles.map(f => `  - ${f}`).join('\n')}`;
                    }
                    if (pendingFiles.length > 0) {
                      message += `\n\nPending files:\n${pendingFiles.map(f => `  - ${f}`).join('\n')}`;
                    }
                    message += '\n\nUsage: @remove <filename> (e.g., @remove package.json)';
                    
                    addItem(
                      { type: MessageType.INFO, text: message },
                      userMessageTimestamp,
                    );
                  }
                } else {
                  const filename = args[0];
                  onDebugMessage(`[DEBUG] Attempting to remove: ${filename}`);
                  
                  const wasRemoved = actions.removeFile(filename);
                  
                  // Also remove from Gemini's actual context
                  const removedFromGemini = await removeFilesFromGeminiContext([filename]);
                  
                  if (wasRemoved) {
                    addItem(
                      { type: MessageType.INFO, text: `✓ Removed '${filename}' from context tracking` },
                      userMessageTimestamp,
                    );
                  } else {
                    addItem(
                      { type: MessageType.INFO, text: `File '${filename}' was not in context tracking` },
                      userMessageTimestamp,
                    );
                  }
                  
                  if (removedFromGemini) {
                    addItem(
                      { type: MessageType.INFO, text: `✓ Removed '${filename}' from Gemini's context` },
                      userMessageTimestamp,
                    );
                  }
                }
                return { queryToSend: null, shouldProceed: false };
              }

              case 'clear':
              case 'clear-all': {
                const filesToRemove = Array.from(state.files.keys());
                actions.clearContext();
                
                // Actually clear Gemini's chat history
                const clearedGemini = await clearGeminiContext();
                
                if (filesToRemove.length > 0) {
                  addItem(
                    { 
                      type: MessageType.INFO, 
                      text: `✓ Cleared ${filesToRemove.length} files from context tracking` 
                    },
                    userMessageTimestamp,
                  );
                } else {
                  addItem(
                    { type: MessageType.INFO, text: '✓ Cleared all files from context tracking' },
                    userMessageTimestamp,
                  );
                }
                
                if (clearedGemini) {
                  addItem(
                    { type: MessageType.INFO, text: '✓ Cleared Gemini chat history' },
                    userMessageTimestamp,
                  );
                }
                return { queryToSend: null, shouldProceed: false };
              }

              default:
                addItem(
                  { type: MessageType.ERROR, text: `Unknown context command: ${command}` },
                  userMessageTimestamp,
                );
                return { queryToSend: null, shouldProceed: false };
            }
          }

          // Track files that will be processed by Gemini (but don't add to context yet)
          if (atCommandResult.shouldProceed && atCommandResult.processedQuery) {
            // Use the resolved file paths from the enhanced at command processor
            const resolvedFilePaths = atCommandResult.resolvedFilePaths || [];
            onDebugMessage(`[DEBUG] Resolved file paths from at command processor: ${JSON.stringify(resolvedFilePaths)}`);
            
            for (const filePath of resolvedFilePaths) {
              pendingFilesRef.current.add(filePath);
              onDebugMessage(`Pending ${filePath} for Gemini processing`);
            }
          }

          if (!atCommandResult.shouldProceed) {
            return { queryToSend: null, shouldProceed: false };
          }
          localQueryToSendToGemini = atCommandResult.processedQuery;
        } else {
          // Normal query for Gemini
          addItem(
            { type: MessageType.USER, text: trimmedQuery },
            userMessageTimestamp,
          );
          localQueryToSendToGemini = trimmedQuery;
        }
      } else {
        // It's a function response (PartListUnion that isn't a string)
        localQueryToSendToGemini = query;
      }

      if (localQueryToSendToGemini === null) {
        onDebugMessage(
          'Query processing resulted in null, not sending to Gemini.',
        );
        return { queryToSend: null, shouldProceed: false };
      }
      return { queryToSend: localQueryToSendToGemini, shouldProceed: true };
    },
    [
      config,
      addItem,
      onDebugMessage,
      handleShellCommand,
      handleSlashCommand,
      logger,
      shellModeActive,
      scheduleToolCalls,
      state,
      actions,
      clearGeminiContext,
      removeFilesFromGeminiContext,
    ],
  );

  // --- Stream Event Handlers ---

  const handleContentEvent = useCallback(
    (
      eventValue: ContentEvent['value'],
      currentGeminiMessageBuffer: string,
      userMessageTimestamp: number,
    ): string => {
      if (turnCancelledRef.current) {
        // Prevents additional output after a user initiated cancel.
        return '';
      }
      let newGeminiMessageBuffer = currentGeminiMessageBuffer + eventValue;
      if (
        pendingHistoryItemRef.current?.type !== 'gemini' &&
        pendingHistoryItemRef.current?.type !== 'gemini_content'
      ) {
        if (pendingHistoryItemRef.current) {
          addItem(pendingHistoryItemRef.current, userMessageTimestamp);
        }
        setPendingHistoryItem({ type: 'gemini', text: '' });
        newGeminiMessageBuffer = eventValue;
      }
      // Split large messages for better rendering performance. Ideally,
      // we should maximize the amount of output sent to <Static />.
      const splitPoint = findLastSafeSplitPoint(newGeminiMessageBuffer);
      if (splitPoint === newGeminiMessageBuffer.length) {
        // Update the existing message with accumulated content
        setPendingHistoryItem((item) => ({
          type: item?.type as 'gemini' | 'gemini_content',
          text: newGeminiMessageBuffer,
        }));
      } else {
        // This indicates that we need to split up this Gemini Message.
        // Splitting a message is primarily a performance consideration. There is a
        // <Static> component at the root of App.tsx which takes care of rendering
        // content statically or dynamically. Everything but the last message is
        // treated as static in order to prevent re-rendering an entire message history
        // multiple times per-second (as streaming occurs). Prior to this change you'd
        // see heavy flickering of the terminal. This ensures that larger messages get
        // broken up so that there are more "statically" rendered.
        const beforeText = newGeminiMessageBuffer.substring(0, splitPoint);
        const afterText = newGeminiMessageBuffer.substring(splitPoint);
        addItem(
          {
            type: pendingHistoryItemRef.current?.type as
              | 'gemini'
              | 'gemini_content',
            text: beforeText,
          },
          userMessageTimestamp,
        );
        setPendingHistoryItem({ type: 'gemini_content', text: afterText });
        newGeminiMessageBuffer = afterText;
      }
      return newGeminiMessageBuffer;
    },
    [addItem, pendingHistoryItemRef, setPendingHistoryItem],
  );

  const handleUserCancelledEvent = useCallback(
    (userMessageTimestamp: number) => {
      if (turnCancelledRef.current) {
        return;
      }
      if (pendingHistoryItemRef.current) {
        if (pendingHistoryItemRef.current.type === 'tool_group') {
          const updatedTools = pendingHistoryItemRef.current.tools.map(
            (tool) =>
              tool.status === ToolCallStatus.Pending ||
              tool.status === ToolCallStatus.Confirming ||
              tool.status === ToolCallStatus.Executing
                ? { ...tool, status: ToolCallStatus.Canceled }
                : tool,
          );
          const pendingItem: HistoryItemToolGroup = {
            ...pendingHistoryItemRef.current,
            tools: updatedTools,
          };
          addItem(pendingItem, userMessageTimestamp);
        } else {
          addItem(pendingHistoryItemRef.current, userMessageTimestamp);
        }
        setPendingHistoryItem(null);
      }
      addItem(
        { type: MessageType.INFO, text: 'User cancelled the request.' },
        userMessageTimestamp,
      );
      setIsResponding(false);
    },
    [addItem, pendingHistoryItemRef, setPendingHistoryItem],
  );

  const handleErrorEvent = useCallback(
    (eventValue: ErrorEvent['value'], userMessageTimestamp: number) => {
      if (pendingHistoryItemRef.current) {
        addItem(pendingHistoryItemRef.current, userMessageTimestamp);
        setPendingHistoryItem(null);
      }
      addItem(
        {
          type: MessageType.ERROR,
          text: parseAndFormatApiError(
            eventValue.error,
            config.getContentGeneratorConfig().authType,
          ),
        },
        userMessageTimestamp,
      );
    },
    [addItem, pendingHistoryItemRef, setPendingHistoryItem, config],
  );

  const handleChatCompressionEvent = useCallback(
    (eventValue: ServerGeminiChatCompressedEvent['value']) =>
      addItem(
        {
          type: 'info',
          text:
            `IMPORTANT: This conversation approached the input token limit for ${config.getModel()}. ` +
            `A compressed context will be sent for future messages (compressed from: ` +
            `${eventValue?.originalTokenCount ?? 'unknown'} to ` +
            `${eventValue?.newTokenCount ?? 'unknown'} tokens).`,
        },
        Date.now(),
      ),
    [addItem, config],
  );

  const processGeminiStreamEvents = useCallback(
    async (
      stream: AsyncIterable<GeminiEvent>,
      userMessageTimestamp: number,
      signal: AbortSignal,
    ): Promise<StreamProcessingStatus> => {
      let geminiMessageBuffer = '';
      const toolCallRequests: ToolCallRequestInfo[] = [];
      for await (const event of stream) {
        switch (event.type) {
          case ServerGeminiEventType.Thought:
            setThought(event.value);
            break;
          case ServerGeminiEventType.Content:
            geminiMessageBuffer = handleContentEvent(
              event.value,
              geminiMessageBuffer,
              userMessageTimestamp,
            );
            break;
          case ServerGeminiEventType.ToolCallRequest:
            toolCallRequests.push(event.value);
            break;
          case ServerGeminiEventType.UserCancelled:
            handleUserCancelledEvent(userMessageTimestamp);
            break;
          case ServerGeminiEventType.Error:
            handleErrorEvent(event.value, userMessageTimestamp);
            break;
          case ServerGeminiEventType.ChatCompressed:
            handleChatCompressionEvent(event.value);
            break;
          case ServerGeminiEventType.ToolCallConfirmation:
          case ServerGeminiEventType.ToolCallResponse:
            // do nothing
            break;
          default: {
            // enforces exhaustive switch-case
            const unreachable: never = event;
            return unreachable;
          }
        }
      }
      if (toolCallRequests.length > 0) {
        scheduleToolCalls(toolCallRequests, signal);
      }
      return StreamProcessingStatus.Completed;
    },
    [
      handleContentEvent,
      handleUserCancelledEvent,
      handleErrorEvent,
      scheduleToolCalls,
      handleChatCompressionEvent,
    ],
  );

  const submitQuery = useCallback(
    async (query: PartListUnion, options?: { isContinuation: boolean }) => {
      if (
        (streamingState === StreamingState.Responding ||
          streamingState === StreamingState.WaitingForConfirmation) &&
        !options?.isContinuation
      )
        return;

      const userMessageTimestamp = Date.now();
      setShowHelp(false);

      abortControllerRef.current = new AbortController();
      const abortSignal = abortControllerRef.current.signal;
      turnCancelledRef.current = false;

      const { queryToSend, shouldProceed } = await prepareQueryForGemini(
        query,
        userMessageTimestamp,
        abortSignal,
      );

      if (!shouldProceed || queryToSend === null) {
        return;
      }

      setIsResponding(true);
      setInitError(null);

      try {
        const stream = geminiClient.sendMessageStream(queryToSend, abortSignal);
        const processingStatus = await processGeminiStreamEvents(
          stream,
          userMessageTimestamp,
          abortSignal,
        );

        if (processingStatus === StreamProcessingStatus.UserCancelled) {
          return;
        }

        if (pendingHistoryItemRef.current) {
          addItem(pendingHistoryItemRef.current, userMessageTimestamp);
          setPendingHistoryItem(null);
        }

        // Finalize pending files after successful Gemini processing
        if (pendingFilesRef.current.size > 0) {
          const pendingFiles = Array.from(pendingFilesRef.current);
          onDebugMessage(`[DEBUG] Marking as processed: ${JSON.stringify(pendingFiles)}`);
          for (const filePath of pendingFiles) {
            try {
              const result = await actions.addFile(filePath);
              if (result.success) {
                onDebugMessage(`✓ Added ${filePath} to context (${result.info?.estimatedTokens} tokens)`);
                actions.markFileAsProcessedByGemini(filePath);
              } else {
                onDebugMessage(`Failed to add ${filePath} to context: ${result.error}`);
              }
            } catch (error) {
              onDebugMessage(`Error adding ${filePath} to context: ${error}`);
            }
          }
          pendingFilesRef.current.clear();
        }
      } catch (error: unknown) {
        // Clear pending files on error/cancellation
        if (pendingFilesRef.current.size > 0) {
          onDebugMessage(`Clearing ${pendingFilesRef.current.size} pending files due to error/cancellation`);
          pendingFilesRef.current.clear();
        }
        if (error instanceof UnauthorizedError) {
          onAuthError();
        } else if (!isNodeError(error) || error.name !== 'AbortError') {
          addItem(
            {
              type: MessageType.ERROR,
              text: parseAndFormatApiError(
                getErrorMessage(error) || 'Unknown error',
                config.getContentGeneratorConfig().authType,
              ),
            },
            userMessageTimestamp,
          );
        }
      } finally {
        setIsResponding(false);
      }
    },
    [
      streamingState,
      setShowHelp,
      prepareQueryForGemini,
      processGeminiStreamEvents,
      pendingHistoryItemRef,
      addItem,
      setPendingHistoryItem,
      setInitError,
      geminiClient,
      onAuthError,
      config,
      actions,
      onDebugMessage,
    ],
  );

  const handleCompletedTools = useCallback(
    async (completedToolCallsFromScheduler: TrackedToolCall[]) => {
      if (isResponding) {
        return;
      }

      const completedAndReadyToSubmitTools =
        completedToolCallsFromScheduler.filter(
          (
            tc: TrackedToolCall,
          ): tc is TrackedCompletedToolCall | TrackedCancelledToolCall => {
            const isTerminalState =
              tc.status === 'success' ||
              tc.status === 'error' ||
              tc.status === 'cancelled';

            if (isTerminalState) {
              const completedOrCancelledCall = tc as
                | TrackedCompletedToolCall
                | TrackedCancelledToolCall;
              return (
                completedOrCancelledCall.response?.responseParts !== undefined
              );
            }
            return false;
          },
        );

      // Finalize any client-initiated tools as soon as they are done.
      const clientTools = completedAndReadyToSubmitTools.filter(
        (t) => t.request.isClientInitiated,
      );
      if (clientTools.length > 0) {
        markToolsAsSubmitted(clientTools.map((t) => t.request.callId));
      }

      // Identify new, successful save_memory calls that we haven't processed yet.
      const newSuccessfulMemorySaves = completedAndReadyToSubmitTools.filter(
        (t) =>
          t.request.name === 'save_memory' &&
          t.status === 'success' &&
          !processedMemoryToolsRef.current.has(t.request.callId),
      );

      if (newSuccessfulMemorySaves.length > 0) {
        // Perform the refresh only if there are new ones.
        void performMemoryRefresh();
        // Mark them as processed so we don't do this again on the next render.
        newSuccessfulMemorySaves.forEach((t) =>
          processedMemoryToolsRef.current.add(t.request.callId),
        );
      }

      const geminiTools = completedAndReadyToSubmitTools.filter(
        (t) => !t.request.isClientInitiated,
      );

      if (geminiTools.length === 0) {
        return;
      }

      // If all the tools were cancelled, don't submit a response to Gemini.
      const allToolsCancelled = geminiTools.every(
        (tc) => tc.status === 'cancelled',
      );

      if (allToolsCancelled) {
        if (geminiClient) {
          // We need to manually add the function responses to the history
          // so the model knows the tools were cancelled.
          const responsesToAdd = geminiTools.flatMap(
            (toolCall) => toolCall.response.responseParts,
          );
          for (const response of responsesToAdd) {
            let parts: Part[];
            if (Array.isArray(response)) {
              parts = response;
            } else if (typeof response === 'string') {
              parts = [{ text: response }];
            } else {
              parts = [response];
            }
            geminiClient.addHistory({
              role: 'user',
              parts,
            });
          }
        }

        const callIdsToMarkAsSubmitted = geminiTools.map(
          (toolCall) => toolCall.request.callId,
        );
        markToolsAsSubmitted(callIdsToMarkAsSubmitted);
        return;
      }

      const responsesToSend: PartListUnion[] = geminiTools.map(
        (toolCall) => toolCall.response.responseParts,
      );
      const callIdsToMarkAsSubmitted = geminiTools.map(
        (toolCall) => toolCall.request.callId,
      );

      markToolsAsSubmitted(callIdsToMarkAsSubmitted);
      submitQuery(mergePartListUnions(responsesToSend), {
        isContinuation: true,
      });
    },
    [
      isResponding,
      submitQuery,
      markToolsAsSubmitted,
      geminiClient,
      performMemoryRefresh,
    ],
  );

  const pendingHistoryItems = [
    pendingHistoryItemRef.current,
    pendingToolCallGroupDisplay,
  ].filter((i) => i !== undefined && i !== null);

  return {
    streamingState,
    submitQuery,
    initError,
    pendingHistoryItems,
    thought,
  };
};