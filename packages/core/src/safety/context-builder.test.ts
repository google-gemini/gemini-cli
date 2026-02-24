/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContextBuilder } from './context-builder.js';
import type { Config } from '../config/config.js';
import type { Content, FunctionCall } from '@google/genai';

describe('ContextBuilder', () => {
  let contextBuilder: ContextBuilder;
  let mockConfig: Partial<Config>;
  let mockHistory: Content[];
  const mockCwd = '/home/user/project';
  const mockWorkspaces = ['/home/user/project'];

  beforeEach(() => {
    vi.spyOn(process, 'cwd').mockReturnValue(mockCwd);
    mockHistory = [];

    mockConfig = {
      getWorkspaceContext: vi.fn().mockReturnValue({
        getDirectories: vi.fn().mockReturnValue(mockWorkspaces),
      }),
      getQuestion: vi.fn().mockReturnValue('mock question'),
      getGeminiClient: vi.fn().mockReturnValue({
        getHistory: vi.fn().mockImplementation(() => mockHistory),
      }),
    };
    contextBuilder = new ContextBuilder(mockConfig as unknown as Config);
  });

  it('should build full context with empty history', () => {
    mockHistory = [];
    // Should inject current question
    const context = contextBuilder.buildFullContext();
    expect(context.history?.turns).toEqual([
      {
        user: { text: 'mock question' },
        model: {},
      },
    ]);
  });

  it('should build full context with existing history (User -> Model)', () => {
    mockHistory = [
      { role: 'user', parts: [{ text: 'Hello' }] },
      { role: 'model', parts: [{ text: 'Hi there' }] },
    ];
    // Should NOT inject current question if history exists
    const context = contextBuilder.buildFullContext();
    expect(context.history?.turns).toHaveLength(1);
    expect(context.history?.turns[0]).toEqual({
      user: { text: 'Hello' },
      model: { text: 'Hi there', toolCalls: [] },
    });
  });

  it('should handle history with tool calls', () => {
    const mockToolCall: FunctionCall = {
      id: 'call_1',
      name: 'list_files',
      args: { path: '.' },
    };
    mockHistory = [
      { role: 'user', parts: [{ text: 'List files' }] },
      {
        role: 'model',
        parts: [
          { text: 'Sure, listing files.' },
          { functionCall: mockToolCall },
        ],
      },
    ];

    const context = contextBuilder.buildFullContext();
    expect(context.history?.turns).toHaveLength(1);
    expect(context.history?.turns[0].model.toolCalls).toEqual([mockToolCall]);
    expect(context.history?.turns[0].model.text).toBe('Sure, listing files.');
  });

  it('should handle orphan model response (Model starts conversation)', () => {
    mockHistory = [
      { role: 'model', parts: [{ text: 'Welcome!' }] },
      { role: 'user', parts: [{ text: 'Thanks' }] },
    ];

    const context = contextBuilder.buildFullContext();
    // 1. Orphan model response -> Turn 1: User="" Model="Welcome!"
    // 2. User "Thanks" -> Turn 2: User="Thanks" Model={} (pending)
    expect(context.history?.turns).toHaveLength(2);
    expect(context.history?.turns[0]).toEqual({
      user: { text: '' },
      model: { text: 'Welcome!', toolCalls: [] },
    });
    expect(context.history?.turns[1]).toEqual({
      user: { text: 'Thanks' },
      model: {},
    });
  });

  it('should handle multiple user turns in a row', () => {
    mockHistory = [
      { role: 'user', parts: [{ text: 'Q1' }] },
      { role: 'user', parts: [{ text: 'Q2' }] },
      { role: 'model', parts: [{ text: 'A2' }] },
    ];

    const context = contextBuilder.buildFullContext();
    // 1. "Q1" -> Turn 1: User="Q1" Model={}
    // 2. "Q2" -> Turn 2: User="Q2" Model="A2"
    expect(context.history?.turns).toHaveLength(2);
    expect(context.history?.turns[0]).toEqual({
      user: { text: 'Q1' },
      model: {},
    });
    expect(context.history?.turns[1]).toEqual({
      user: { text: 'Q2' },
      model: { text: 'A2', toolCalls: [] },
    });
  });

  it('should build minimal context', () => {
    mockHistory = [{ role: 'user', parts: [{ text: 'test' }] }];
    const context = contextBuilder.buildMinimalContext(['environment']);

    expect(context).toHaveProperty('environment');
    expect(context).not.toHaveProperty('history');
  });

  it('should handle undefined parts gracefully', () => {
    mockHistory = [
      { role: 'user', parts: undefined as unknown as [] },
      { role: 'model', parts: undefined as unknown as [] },
    ];
    const context = contextBuilder.buildFullContext();
    expect(context.history?.turns).toHaveLength(1);
    expect(context.history?.turns[0]).toEqual({
      user: { text: '' },
      model: { text: '', toolCalls: [] },
    });
  });
});
