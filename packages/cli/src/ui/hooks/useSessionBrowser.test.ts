/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook, act } from '@testing-library/react';
import { useSessionBrowser, convertSessionToHistoryFormats } from './useSessionBrowser.js';
import * as fs from 'fs/promises';
import path from 'path';
import { MessageType, ToolCallStatus } from '../types.js';
import type { ConversationRecord, MessageRecord } from '@google/gemini-cli-core';

vi.mock('fs/promises');
vi.mock('path');

const MOCKED_PROJECT_TEMP_DIR = '/test/project/temp';
const MOCKED_CHATS_DIR = path.join(MOCKED_PROJECT_TEMP_DIR, 'chats');
const MOCKED_SESSION_ID = 'test-session-123';
const MOCKED_SESSION_FILE = path.join(MOCKED_CHATS_DIR, `${MOCKED_SESSION_ID}.json`);

describe('useSessionBrowser', () => {
  const mockedFs = vi.mocked(fs);
  const mockedPath = vi.mocked(path);
  
  // Mock dependencies
  const mockConfig = {
    getProjectTempDir: vi.fn().mockReturnValue(MOCKED_PROJECT_TEMP_DIR),
    setSessionId: vi.fn(),
  };
  
  const mockChatRecordingService = {
    initialize: vi.fn(),
  };
  
  const mockOnLoadHistory = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
    
    // Mock path.join to return predictable paths
    mockedPath.join.mockImplementation((...segments) => {
      if (segments.includes('chats') && segments.includes('test-session-123.json')) {
        return '/test/project/temp/chats/test-session-123.json';
      }
      return segments.join('/');
    });
    
    // Default successful file read
    mockedFs.readFile.mockResolvedValue('{}');
  });

  describe('hook initialization', () => {
    it('should initialize with isSessionBrowserOpen set to false', () => {
      const { result } = renderHook(() => 
        useSessionBrowser(mockConfig as any, mockChatRecordingService as any, mockOnLoadHistory)
      );

      expect(result.current.isSessionBrowserOpen).toBe(false);
    });

    it('should provide all expected hook methods', () => {
      const { result } = renderHook(() => 
        useSessionBrowser(mockConfig as any, mockChatRecordingService as any, mockOnLoadHistory)
      );

      expect(result.current).toHaveProperty('isSessionBrowserOpen');
      expect(result.current).toHaveProperty('openSessionBrowser');
      expect(result.current).toHaveProperty('closeSessionBrowser');
      expect(result.current).toHaveProperty('handleResumeSession');
    });
  });

  describe('session browser open/close functionality', () => {
    it('should open session browser when openSessionBrowser is called', () => {
      const { result } = renderHook(() => 
        useSessionBrowser(mockConfig as any, mockChatRecordingService as any, mockOnLoadHistory)
      );

      act(() => {
        result.current.openSessionBrowser();
      });

      expect(result.current.isSessionBrowserOpen).toBe(true);
    });

    it('should close session browser when closeSessionBrowser is called', () => {
      const { result } = renderHook(() => 
        useSessionBrowser(mockConfig as any, mockChatRecordingService as any, mockOnLoadHistory)
      );

      // First open it
      act(() => {
        result.current.openSessionBrowser();
      });
      expect(result.current.isSessionBrowserOpen).toBe(true);

      // Then close it
      act(() => {
        result.current.closeSessionBrowser();
      });
      expect(result.current.isSessionBrowserOpen).toBe(false);
    });
  });

  describe('handleResumeSession success scenarios', () => {
    it('should successfully resume a session with basic messages', async () => {
      const mockConversation: ConversationRecord = {
        sessionId: 'existing-session-456',
        projectHash: 'project-123',
        startTime: '2025-01-01T00:00:00Z',
        lastUpdated: '2025-01-01T01:00:00Z',
        messages: [
          {
            id: 'msg-1',
            timestamp: '2025-01-01T00:01:00Z',
            content: 'Hello, world!',
            type: 'user',
          },
          {
            id: 'msg-2',
            timestamp: '2025-01-01T00:02:00Z',
            content: 'Hello! How can I help you?',
            type: 'gemini',
          },
        ] as MessageRecord[],
      };

      mockedFs.readFile.mockResolvedValue(JSON.stringify(mockConversation));

      const { result } = renderHook(() => 
        useSessionBrowser(mockConfig as any, mockChatRecordingService as any, mockOnLoadHistory)
      );

      await act(async () => {
        await result.current.handleResumeSession(MOCKED_SESSION_ID);
      });

      // Verify file was read from correct path
      expect(mockedFs.readFile).toHaveBeenCalledWith('/chats/test-session-123.json', 'utf8');
      
      // Verify config was updated with session ID
      expect(mockConfig.setSessionId).toHaveBeenCalledWith('existing-session-456');
      
      // Verify chat recording service was initialized with resumed session data
      expect(mockChatRecordingService.initialize).toHaveBeenCalledWith({
        conversation: mockConversation,
        filePath: '/chats/test-session-123.json'
      });
      
      // Verify session browser was closed
      expect(result.current.isSessionBrowserOpen).toBe(false);
      
      // Verify onLoadHistory was called
      expect(mockOnLoadHistory).toHaveBeenCalled();
    });

    it('should handle messages with tool calls', async () => {
      const mockConversation: ConversationRecord = {
        sessionId: 'session-with-tools',
        projectHash: 'project-123',
        startTime: '2025-01-01T00:00:00Z',
        lastUpdated: '2025-01-01T01:00:00Z',
        messages: [
          {
            id: 'msg-1',
            timestamp: '2025-01-01T00:01:00Z',
            content: 'Run ls command',
            type: 'user',
          },
          {
            id: 'msg-2',
            timestamp: '2025-01-01T00:02:00Z',
            content: 'I\'ll run the ls command for you.',
            type: 'gemini',
            toolCalls: [
              {
                id: 'tool-1',
                name: 'bash',
                displayName: 'Bash',
                description: 'Execute bash command',
                args: { command: 'ls' },
                status: 'success',
                timestamp: '2025-01-01T00:02:30Z',
                resultDisplay: 'file1.txt\nfile2.txt',
                renderOutputAsMarkdown: true,
              },
            ],
          },
        ] as MessageRecord[],
      };

      mockedFs.readFile.mockResolvedValue(JSON.stringify(mockConversation));

      const { result } = renderHook(() => 
        useSessionBrowser(mockConfig as any, mockChatRecordingService as any, mockOnLoadHistory)
      );

      await act(async () => {
        await result.current.handleResumeSession(MOCKED_SESSION_ID);
      });

      expect(mockOnLoadHistory).toHaveBeenCalled();
      const loadHistoryCall = mockOnLoadHistory.mock.calls[0][0];
      
      // Should contain both text message and tool group
      expect(loadHistoryCall.history).toHaveLength(3); // user message, gemini message, tool group
      expect(loadHistoryCall.history[2].type).toBe('tool_group');
      expect(loadHistoryCall.history[2].tools).toHaveLength(1);
      expect(loadHistoryCall.history[2].tools[0].name).toBe('Bash');
      expect(loadHistoryCall.history[2].tools[0].status).toBe(ToolCallStatus.Success);
    });

    it('should filter out empty messages', async () => {
      const mockConversation: ConversationRecord = {
        sessionId: 'session-with-empty',
        projectHash: 'project-123',
        startTime: '2025-01-01T00:00:00Z',
        lastUpdated: '2025-01-01T01:00:00Z',
        messages: [
          {
            id: 'msg-1',
            timestamp: '2025-01-01T00:01:00Z',
            content: 'Valid message',
            type: 'user',
          },
          {
            id: 'msg-2',
            timestamp: '2025-01-01T00:02:00Z',
            content: '',
            type: 'gemini',
          },
          {
            id: 'msg-3',
            timestamp: '2025-01-01T00:03:00Z',
            content: '   ',
            type: 'system',
          },
          {
            id: 'msg-4',
            timestamp: '2025-01-01T00:04:00Z',
            content: 'Another valid message',
            type: 'gemini',
          },
        ] as MessageRecord[],
      };

      mockedFs.readFile.mockResolvedValue(JSON.stringify(mockConversation));

      const { result } = renderHook(() => 
        useSessionBrowser(mockConfig as any, mockChatRecordingService as any, mockOnLoadHistory)
      );

      await act(async () => {
        await result.current.handleResumeSession(MOCKED_SESSION_ID);
      });

      const loadHistoryCall = mockOnLoadHistory.mock.calls[0][0];
      expect(loadHistoryCall.history).toHaveLength(2); // Only non-empty messages
      expect(loadHistoryCall.history[0].text).toBe('Valid message');
      expect(loadHistoryCall.history[1].text).toBe('Another valid message');
    });
  });

  describe('handleResumeSession error scenarios', () => {
    it('should handle file not found error gracefully', async () => {
      const error = new Error('File not found') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      mockedFs.readFile.mockRejectedValue(error);

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const { result } = renderHook(() => 
        useSessionBrowser(mockConfig as any, mockChatRecordingService as any, mockOnLoadHistory)
      );

      // Open session browser first
      act(() => {
        result.current.openSessionBrowser();
      });

      await act(async () => {
        await result.current.handleResumeSession(MOCKED_SESSION_ID);
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith('Error resuming session:', error);
      expect(result.current.isSessionBrowserOpen).toBe(false); // Should be closed on error
      expect(mockOnLoadHistory).not.toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it('should handle JSON parse error gracefully', async () => {
      mockedFs.readFile.mockResolvedValue('invalid json');

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const { result } = renderHook(() => 
        useSessionBrowser(mockConfig as any, mockChatRecordingService as any, mockOnLoadHistory)
      );

      act(() => {
        result.current.openSessionBrowser();
      });

      await act(async () => {
        await result.current.handleResumeSession(MOCKED_SESSION_ID);
      });

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(result.current.isSessionBrowserOpen).toBe(false);
      expect(mockOnLoadHistory).not.toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it('should handle missing session ID in conversation', async () => {
      const mockConversation = {
        projectHash: 'project-123',
        startTime: '2025-01-01T00:00:00Z',
        lastUpdated: '2025-01-01T01:00:00Z',
        messages: [],
        // Missing sessionId
      };

      mockedFs.readFile.mockResolvedValue(JSON.stringify(mockConversation));

      const { result } = renderHook(() => 
        useSessionBrowser(mockConfig as any, mockChatRecordingService as any, mockOnLoadHistory)
      );

      act(() => {
        result.current.openSessionBrowser();
      });

      await act(async () => {
        await result.current.handleResumeSession(MOCKED_SESSION_ID);
      });

      // The hook should attempt to use the sessionId and will call config.setSessionId(undefined)
      expect(mockConfig.setSessionId).toHaveBeenCalledWith(undefined);
      expect(result.current.isSessionBrowserOpen).toBe(false);
    });
  });

  describe('callback stability', () => {
    it('should maintain stable callback references', () => {
      const { result, rerender } = renderHook(() => 
        useSessionBrowser(mockConfig as any, mockChatRecordingService as any, mockOnLoadHistory)
      );

      const initialCallbacks = {
        openSessionBrowser: result.current.openSessionBrowser,
        closeSessionBrowser: result.current.closeSessionBrowser,
        handleResumeSession: result.current.handleResumeSession,
      };

      rerender();

      expect(result.current.openSessionBrowser).toBe(initialCallbacks.openSessionBrowser);
      expect(result.current.closeSessionBrowser).toBe(initialCallbacks.closeSessionBrowser);
      expect(result.current.handleResumeSession).toBe(initialCallbacks.handleResumeSession);
    });

    it('should update handleResumeSession callback when dependencies change', () => {
      const { result, rerender } = renderHook(
        ({ config, chatRecordingService, onLoadHistory }) => 
          useSessionBrowser(config, chatRecordingService, onLoadHistory),
        {
          initialProps: {
            config: mockConfig as any,
            chatRecordingService: mockChatRecordingService as any,
            onLoadHistory: mockOnLoadHistory,
          },
        }
      );

      const initialCallback = result.current.handleResumeSession;

      const newOnLoadHistory = vi.fn();
      rerender({
        config: mockConfig as any,
        chatRecordingService: mockChatRecordingService as any,
        onLoadHistory: newOnLoadHistory,
      });

      expect(result.current.handleResumeSession).not.toBe(initialCallback);
    });
  });
});

describe('convertSessionToHistoryFormats', () => {
  it('should convert empty messages array', () => {
    const result = convertSessionToHistoryFormats([]);
    
    expect(result.type).toBe('load_history');
    expect(result.history).toEqual([]);
    expect(result.clientHistory).toEqual([]);
  });

  it('should convert basic user and gemini messages', () => {
    const messages: MessageRecord[] = [
      {
        id: 'msg-1',
        timestamp: '2025-01-01T00:01:00Z',
        content: 'Hello',
        type: 'user',
      },
      {
        id: 'msg-2',
        timestamp: '2025-01-01T00:02:00Z',
        content: 'Hi there!',
        type: 'gemini',
      },
    ];

    const result = convertSessionToHistoryFormats(messages);
    
    expect(result.history).toHaveLength(2);
    expect(result.history[0]).toEqual({
      type: MessageType.USER,
      text: 'Hello',
    });
    expect(result.history[1]).toEqual({
      type: MessageType.GEMINI,
      text: 'Hi there!',
    });
    
    expect(result.clientHistory).toHaveLength(2);
    expect(result.clientHistory[0]).toEqual({
      role: 'user',
      parts: [{ text: 'Hello' }],
    });
    expect(result.clientHistory[1]).toEqual({
      role: 'model',
      parts: [{ text: 'Hi there!' }],
    });
  });

  it('should convert system and error messages to appropriate types', () => {
    const messages: MessageRecord[] = [
      {
        id: 'msg-1',
        timestamp: '2025-01-01T00:01:00Z',
        content: 'System message',
        type: 'system',
      },
      {
        id: 'msg-2',
        timestamp: '2025-01-01T00:02:00Z',
        content: 'Error occurred',
        type: 'error',
      },
    ];

    const result = convertSessionToHistoryFormats(messages);
    
    expect(result.history[0]).toEqual({
      type: MessageType.INFO,
      text: 'System message',
    });
    expect(result.history[1]).toEqual({
      type: MessageType.ERROR,
      text: 'Error occurred',
    });
    
    // System and error messages should not be included in client history
    expect(result.clientHistory).toEqual([]);
  });

  it('should filter out slash commands from client history', () => {
    const messages: MessageRecord[] = [
      {
        id: 'msg-1',
        timestamp: '2025-01-01T00:01:00Z',
        content: '/help',
        type: 'user',
      },
      {
        id: 'msg-2',
        timestamp: '2025-01-01T00:02:00Z',
        content: '?quit',
        type: 'user',
      },
      {
        id: 'msg-3',
        timestamp: '2025-01-01T00:03:00Z',
        content: 'Regular message',
        type: 'user',
      },
    ];

    const result = convertSessionToHistoryFormats(messages);
    
    // All messages should appear in UI history
    expect(result.history).toHaveLength(3);
    
    // Only non-slash commands should appear in client history
    expect(result.clientHistory).toHaveLength(1);
    expect(result.clientHistory[0]).toEqual({
      role: 'user',
      parts: [{ text: 'Regular message' }],
    });
  });

  it('should handle tool calls correctly', () => {
    const messages: MessageRecord[] = [
      {
        id: 'msg-1',
        timestamp: '2025-01-01T00:01:00Z',
        content: 'I\'ll help you with that.',
        type: 'gemini',
        toolCalls: [
          {
            id: 'tool-1',
            name: 'bash',
            displayName: 'Execute Command',
            description: 'Run bash command',
            args: { command: 'ls -la' },
            status: 'success',
            timestamp: '2025-01-01T00:01:30Z',
            resultDisplay: 'total 4\ndrwxr-xr-x 2 user user 4096 Jan 1 00:00 .',
            renderOutputAsMarkdown: false,
          },
          {
            id: 'tool-2',
            name: 'read',
            displayName: 'Read File',
            description: 'Read file contents',
            args: { path: '/etc/hosts' },
            status: 'error',
            timestamp: '2025-01-01T00:01:45Z',
            resultDisplay: 'Permission denied',
          },
        ],
      },
    ];

    const result = convertSessionToHistoryFormats(messages);
    
    expect(result.history).toHaveLength(2); // text message + tool group
    expect(result.history[0]).toEqual({
      type: MessageType.GEMINI,
      text: 'I\'ll help you with that.',
    });
    
    expect(result.history[1].type).toBe('tool_group');
    expect(result.history[1].tools).toHaveLength(2);
    expect(result.history[1].tools[0]).toEqual({
      callId: 'tool-1',
      name: 'Execute Command',
      description: 'Run bash command',
      renderOutputAsMarkdown: false,
      status: ToolCallStatus.Success,
      resultDisplay: 'total 4\ndrwxr-xr-x 2 user user 4096 Jan 1 00:00 .',
      confirmationDetails: undefined,
    });
    expect(result.history[1].tools[1]).toEqual({
      callId: 'tool-2',
      name: 'Read File',
      description: 'Read file contents',
      renderOutputAsMarkdown: true, // default value
      status: ToolCallStatus.Error,
      resultDisplay: 'Permission denied',
      confirmationDetails: undefined,
    });
  });

  it('should skip empty tool calls arrays', () => {
    const messages: MessageRecord[] = [
      {
        id: 'msg-1',
        timestamp: '2025-01-01T00:01:00Z',
        content: 'Message with empty tools',
        type: 'gemini',
        toolCalls: [],
      },
    ];

    const result = convertSessionToHistoryFormats(messages);
    
    expect(result.history).toHaveLength(1); // Only text message
    expect(result.history[0]).toEqual({
      type: MessageType.GEMINI,
      text: 'Message with empty tools',
    });
  });

  it('should not add tool calls for user messages', () => {
    const messages: MessageRecord[] = [
      {
        id: 'msg-1',
        timestamp: '2025-01-01T00:01:00Z',
        content: 'User message',
        type: 'user',
        // This would be invalid in real usage, but testing robustness
        toolCalls: [
          {
            id: 'tool-1',
            name: 'invalid',
            args: {},
            status: 'success',
            timestamp: '2025-01-01T00:01:30Z',
          },
        ],
      } as any,
    ];

    const result = convertSessionToHistoryFormats(messages);
    
    expect(result.history).toHaveLength(1); // Only user message, no tool group
    expect(result.history[0]).toEqual({
      type: MessageType.USER,
      text: 'User message',
    });
  });

  it('should handle missing tool call fields gracefully', () => {
    const messages: MessageRecord[] = [
      {
        id: 'msg-1',
        timestamp: '2025-01-01T00:01:00Z',
        content: 'Message with minimal tool',
        type: 'gemini',
        toolCalls: [
          {
            id: 'tool-1',
            name: 'minimal_tool',
            args: {},
            status: 'success',
            timestamp: '2025-01-01T00:01:30Z',
            // Missing optional fields
          },
        ],
      },
    ];

    const result = convertSessionToHistoryFormats(messages);
    
    expect(result.history).toHaveLength(2);
    expect(result.history[1].type).toBe('tool_group');
    expect(result.history[1].tools[0]).toEqual({
      callId: 'tool-1',
      name: 'minimal_tool', // Falls back to name when displayName missing
      description: '', // Default empty string
      renderOutputAsMarkdown: true, // Default value  
      status: ToolCallStatus.Success,
      resultDisplay: undefined,
      confirmationDetails: undefined,
    });
  });

  describe('tool calls in client history', () => {
    it('should convert tool calls to correct Gemini client history format', () => {
      const messages: MessageRecord[] = [
        {
          id: 'msg-1',
          timestamp: '2025-01-01T00:01:00Z',
          content: 'List files',
          type: 'user',
        },
        {
          id: 'msg-2',
          timestamp: '2025-01-01T00:02:00Z',
          content: 'I\'ll list the files for you.',
          type: 'gemini',
          toolCalls: [
            {
              id: 'tool-1',
              name: 'list_directory',
              args: { path: '/home/user' },
              result: { output: 'file1.txt\nfile2.txt' },
              status: 'success',
              timestamp: '2025-01-01T00:02:30Z',
            },
          ],
        },
      ];

      const result = convertSessionToHistoryFormats(messages);
      
      // Should have: user message, model with function call, user with function response
      expect(result.clientHistory).toHaveLength(3);
      
      // User message
      expect(result.clientHistory[0]).toEqual({
        role: 'user',
        parts: [{ text: 'List files' }],
      });
      
      // Model message with function call
      expect(result.clientHistory[1]).toEqual({
        role: 'model',
        parts: [
          { text: 'I\'ll list the files for you.' },
          {
            functionCall: {
              name: 'list_directory',
              args: { path: '/home/user' },
              id: 'tool-1',
            },
          },
        ],
      });
      
      // Function response
      expect(result.clientHistory[2]).toEqual({
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: 'list_directory',
              response: { output: 'file1.txt\nfile2.txt' },
            },
          },
        ],
      });
    });

    it('should handle tool calls without text content', () => {
      const messages: MessageRecord[] = [
        {
          id: 'msg-1',
          timestamp: '2025-01-01T00:01:00Z',
          content: '',
          type: 'gemini',
          toolCalls: [
            {
              id: 'tool-1',
              name: 'bash',
              args: { command: 'ls' },
              result: 'file1.txt\nfile2.txt',
              status: 'success',
              timestamp: '2025-01-01T00:01:30Z',
            },
          ],
        },
      ];

      const result = convertSessionToHistoryFormats(messages);
      
      expect(result.clientHistory).toHaveLength(2);
      
      // Model message with only function call (no text)
      expect(result.clientHistory[0]).toEqual({
        role: 'model',
        parts: [
          {
            functionCall: {
              name: 'bash',
              args: { command: 'ls' },
              id: 'tool-1',
            },
          },
        ],
      });
      
      // Function response
      expect(result.clientHistory[1]).toEqual({
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: 'bash',
              response: { output: 'file1.txt\nfile2.txt' },
            },
          },
        ],
      });
    });

    it('should handle multiple tool calls in one message', () => {
      const messages: MessageRecord[] = [
        {
          id: 'msg-1',
          timestamp: '2025-01-01T00:01:00Z',
          content: 'Running multiple commands',
          type: 'gemini',
          toolCalls: [
            {
              id: 'tool-1',
              name: 'bash',
              args: { command: 'pwd' },
              result: '/home/user',
              status: 'success',
              timestamp: '2025-01-01T00:01:30Z',
            },
            {
              id: 'tool-2',
              name: 'bash',
              args: { command: 'ls' },
              result: ['file1.txt', 'file2.txt'],
              status: 'success',
              timestamp: '2025-01-01T00:01:35Z',
            },
          ],
        },
      ];

      const result = convertSessionToHistoryFormats(messages);
      
      // Should have: model with both function calls, then two function responses
      expect(result.clientHistory).toHaveLength(3);
      
      // Model message with both function calls
      expect(result.clientHistory[0]).toEqual({
        role: 'model',
        parts: [
          { text: 'Running multiple commands' },
          {
            functionCall: {
              name: 'bash',
              args: { command: 'pwd' },
              id: 'tool-1',
            },
          },
          {
            functionCall: {
              name: 'bash',
              args: { command: 'ls' },
              id: 'tool-2',
            },
          },
        ],
      });
      
      // First function response
      expect(result.clientHistory[1]).toEqual({
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: 'bash',
              response: { output: '/home/user' },
            },
          },
        ],
      });
      
      // Second function response
      expect(result.clientHistory[2]).toEqual({
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: 'bash',
              response: ['file1.txt', 'file2.txt'],
            },
          },
        ],
      });
    });

    it('should handle Part array results from tools', () => {
      const messages: MessageRecord[] = [
        {
          id: 'msg-1',
          timestamp: '2025-01-01T00:01:00Z',
          content: 'Reading file',
          type: 'gemini',
          toolCalls: [
            {
              id: 'tool-1',
              name: 'read_file',
              args: { path: 'test.txt' },
              result: [
                { text: 'Hello' },
                { text: ' World' },
              ],
              status: 'success',
              timestamp: '2025-01-01T00:01:30Z',
            },
          ],
        },
      ];

      const result = convertSessionToHistoryFormats(messages);
      
      expect(result.clientHistory).toHaveLength(2);
      
      // Function response should extract and join text parts
      expect(result.clientHistory[1]).toEqual({
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: 'read_file',
              response: { output: 'Hello World' },
            },
          },
        ],
      });
    });

    it('should skip tool calls without results', () => {
      const messages: MessageRecord[] = [
        {
          id: 'msg-1',
          timestamp: '2025-01-01T00:01:00Z',
          content: 'Testing tool',
          type: 'gemini',
          toolCalls: [
            {
              id: 'tool-1',
              name: 'test_tool',
              args: { arg: 'value' },
              // No result field
              status: 'error',
              timestamp: '2025-01-01T00:01:30Z',
            },
          ],
        },
      ];

      const result = convertSessionToHistoryFormats(messages);
      
      // Should only have the model message with function call, no function response
      expect(result.clientHistory).toHaveLength(1);
      
      expect(result.clientHistory[0]).toEqual({
        role: 'model',
        parts: [
          { text: 'Testing tool' },
          {
            functionCall: {
              name: 'test_tool',
              args: { arg: 'value' },
              id: 'tool-1',
            },
          },
        ],
      });
    });

    it('should handle tool calls without IDs', () => {
      const messages: MessageRecord[] = [
        {
          id: 'msg-1',
          timestamp: '2025-01-01T00:01:00Z',
          content: 'Tool without ID',
          type: 'gemini',
          toolCalls: [
            {
              name: 'simple_tool',
              args: {},
              result: 'success',
              status: 'success',
              timestamp: '2025-01-01T00:01:30Z',
            } as any, // Missing id field
          ],
        },
      ];

      const result = convertSessionToHistoryFormats(messages);
      
      expect(result.clientHistory).toHaveLength(2);
      
      // Function call should not include id field when not present
      expect(result.clientHistory[0]).toEqual({
        role: 'model',
        parts: [
          { text: 'Tool without ID' },
          {
            functionCall: {
              name: 'simple_tool',
              args: {},
            },
          },
        ],
      });
    });
  });
});
