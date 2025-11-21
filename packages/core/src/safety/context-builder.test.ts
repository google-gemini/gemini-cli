/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContextBuilder } from './context-builder.js';
import type { Config } from '../config/config.js';
import type { ConversationTurn } from './protocol.js';

describe('ContextBuilder', () => {
  let contextBuilder: ContextBuilder;
  let mockConfig: Config;
  const mockHistory: ConversationTurn[] = [
    { user: { text: 'hello' }, model: { text: 'hi' } },
  ];
  const mockCwd = '/home/user/project';
  const mockWorkspaces = ['/home/user/project'];

  beforeEach(() => {
    vi.spyOn(process, 'cwd').mockReturnValue(mockCwd);
    mockConfig = {
      getWorkspaceContext: vi.fn().mockReturnValue({
        getDirectories: vi.fn().mockReturnValue(mockWorkspaces),
      }),
      apiKey: 'secret-api-key',
      somePublicConfig: 'public-value',
      nested: {
        secretToken: 'hidden',
        public: 'visible',
      },
    } as unknown as Config;
    contextBuilder = new ContextBuilder(mockConfig, mockHistory);
  });

  it('should build full context with all fields', () => {
    const context = contextBuilder.buildFullContext();
    expect(context.environment.cwd).toBe(mockCwd);
    expect(context.environment.workspaces).toEqual(mockWorkspaces);
    expect(context.history?.turns).toEqual(mockHistory);
  });

  it('should build minimal context with only required keys', () => {
    const context = contextBuilder.buildMinimalContext(['environment']);
    expect(context).toHaveProperty('environment');
    expect(context).not.toHaveProperty('config');
    expect(context).not.toHaveProperty('history');
  });

  it('should handle missing history', () => {
    contextBuilder = new ContextBuilder(mockConfig);
    const context = contextBuilder.buildFullContext();
    expect(context.history?.turns).toEqual([]);
  });
});
