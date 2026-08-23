/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import {
  extractWorkspaceFiles,
  extractUserPrompt,
  inferWorkspaceRoot,
} from '../utils/workspace-reconstructor.js';
import type { ConversationRecord } from '@google/gemini-cli-core';

/** Builds a minimal ConversationRecord for testing. */
function makeConversation(
  messages: ConversationRecord['messages'],
): ConversationRecord {
  return {
    sessionId: 'test-session',
    projectHash: 'abc123',
    startTime: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    messages,
  };
}

/** Builds a gemini message with tool calls. */
function geminiMsg(
  toolCalls: ConversationRecord['messages'][number] extends { type: 'gemini' }
    ? NonNullable<ConversationRecord['messages'][number]['toolCalls']>
    : never,
): ConversationRecord['messages'][number] {
  return {
    id: `msg-${Math.random().toString(36).slice(2)}`,
    timestamp: new Date().toISOString(),
    type: 'gemini',
    content: [],
    toolCalls,
  };
}

/** Builds a user message. */
function userMsg(text: string): ConversationRecord['messages'][number] {
  return {
    id: `msg-${Math.random().toString(36).slice(2)}`,
    timestamp: new Date().toISOString(),
    type: 'user',
    content: [{ text }],
  };
}

describe('extractWorkspaceFiles', () => {
  it('captures files read before any write', () => {
    const conversation = makeConversation([
      geminiMsg([
        {
          id: 'tc1',
          name: 'read_file',
          args: { path: '/project/src/app.ts' },
          result: [{ text: 'const x = 1;' }],
          status: 'complete',
          timestamp: new Date().toISOString(),
        },
      ]),
    ]);

    const result = extractWorkspaceFiles(conversation);
    expect(result.files['/project/src/app.ts']).toBe('const x = 1;');
    expect(result.readPaths).toContain('/project/src/app.ts');
  });

  it('does NOT capture files first written then read (newly created by agent)', () => {
    const conversation = makeConversation([
      geminiMsg([
        {
          id: 'tc1',
          name: 'write_file',
          args: { path: '/project/new-file.ts', content: 'export {};' },
          status: 'complete',
          timestamp: new Date().toISOString(),
        },
        {
          id: 'tc2',
          name: 'read_file',
          args: { path: '/project/new-file.ts' },
          result: [{ text: 'export {};' }],
          status: 'complete',
          timestamp: new Date().toISOString(),
        },
      ]),
    ]);

    const result = extractWorkspaceFiles(conversation);
    expect(result.files).not.toHaveProperty('/project/new-file.ts');
    expect(result.writtenPaths).toContain('/project/new-file.ts');
  });

  it('handles read_many_files tool', () => {
    const conversation = makeConversation([
      geminiMsg([
        {
          id: 'tc1',
          name: 'read_many_files',
          args: { paths: ['/project/a.ts', '/project/b.ts'] },
          result: [{ text: 'content of a and b' }],
          status: 'complete',
          timestamp: new Date().toISOString(),
        },
      ]),
    ]);

    const result = extractWorkspaceFiles(conversation);
    expect(result.readPaths).toContain('/project/a.ts');
    expect(result.readPaths).toContain('/project/b.ts');
  });

  it('skips failed (non-complete) tool calls', () => {
    const conversation = makeConversation([
      geminiMsg([
        {
          id: 'tc1',
          name: 'read_file',
          args: { path: '/project/src/app.ts' },
          result: [{ text: 'content' }],
          status: 'error',
          timestamp: new Date().toISOString(),
        },
      ]),
    ]);

    const result = extractWorkspaceFiles(conversation);
    expect(result.files).toEqual({});
  });

  it('records observed tools', () => {
    const conversation = makeConversation([
      geminiMsg([
        {
          id: 'tc1',
          name: 'read_file',
          args: { path: '/project/app.ts' },
          result: [{ text: 'x' }],
          status: 'complete',
          timestamp: new Date().toISOString(),
        },
        {
          id: 'tc2',
          name: 'write_file',
          args: { path: '/project/new.ts', content: 'y' },
          status: 'complete',
          timestamp: new Date().toISOString(),
        },
        {
          id: 'tc3',
          name: 'run_shell_command',
          args: { command: 'npm test' },
          result: [{ text: 'ok' }],
          status: 'complete',
          timestamp: new Date().toISOString(),
        },
      ]),
    ]);

    const result = extractWorkspaceFiles(conversation);
    expect(result.observedTools).toContain('read_file');
    expect(result.observedTools).toContain('write_file');
    expect(result.observedTools).toContain('run_shell_command');
  });

  it('handles conversation with no tool calls', () => {
    const conversation = makeConversation([userMsg('hello')]);
    const result = extractWorkspaceFiles(conversation);
    expect(result.files).toEqual({});
    expect(result.readPaths).toEqual([]);
    expect(result.writtenPaths).toEqual([]);
    expect(result.observedTools).toEqual([]);
  });

  it('extracts content from string result', () => {
    const conversation = makeConversation([
      geminiMsg([
        {
          id: 'tc1',
          name: 'read_file',
          args: { path: '/project/README.md' },
          result: '# My Project',
          status: 'complete',
          timestamp: new Date().toISOString(),
        },
      ]),
    ]);

    const result = extractWorkspaceFiles(conversation);
    expect(result.files['/project/README.md']).toBe('# My Project');
  });

  it('infers workspace root from common path prefix', () => {
    const base = path.join(os.tmpdir(), 'project');
    const conversation = makeConversation([
      geminiMsg([
        {
          id: 'tc1',
          name: 'read_file',
          args: { path: path.join(base, 'src', 'app.ts') },
          result: [{ text: 'x' }],
          status: 'complete',
          timestamp: new Date().toISOString(),
        },
        {
          id: 'tc2',
          name: 'write_file',
          args: { path: path.join(base, 'src', 'utils.ts'), content: 'y' },
          status: 'complete',
          timestamp: new Date().toISOString(),
        },
      ]),
    ]);

    const result = extractWorkspaceFiles(conversation);
    expect(result.workspaceRoot).toBeDefined();
    expect(
      result.workspaceRoot?.startsWith(base) || result.workspaceRoot === base,
    ).toBe(true);
  });
});

describe('extractUserPrompt', () => {
  it('extracts first user message text', () => {
    const conversation = makeConversation([userMsg('Fix the bug in app.ts')]);
    expect(extractUserPrompt(conversation)).toBe('Fix the bug in app.ts');
  });

  it('returns undefined when no user messages', () => {
    const conversation = makeConversation([]);
    expect(extractUserPrompt(conversation)).toBeUndefined();
  });

  it('extracts text from array content', () => {
    const conversation = makeConversation([
      {
        id: 'msg1',
        timestamp: new Date().toISOString(),
        type: 'user',
        content: [{ text: 'Hello ' }, { text: 'world' }],
      },
    ]);
    expect(extractUserPrompt(conversation)).toBe('Hello world');
  });

  it('skips gemini messages and finds user message', () => {
    const conversation = makeConversation([
      geminiMsg([]),
      userMsg('The real prompt'),
    ]);
    expect(extractUserPrompt(conversation)).toBe('The real prompt');
  });
});

describe('inferWorkspaceRoot', () => {
  it('returns undefined for empty array', () => {
    expect(inferWorkspaceRoot([])).toBeUndefined();
  });

  it('returns undefined for non-absolute paths', () => {
    expect(inferWorkspaceRoot(['src/app.ts', 'src/utils.ts'])).toBeUndefined();
  });

  it('finds common root of two paths', () => {
    const base = path.join(os.tmpdir(), 'user', 'project');
    const root = inferWorkspaceRoot([
      path.join(base, 'src', 'app.ts'),
      path.join(base, 'src', 'utils.ts'),
    ]);
    expect(root).toBeDefined();
    expect(root?.includes('project') || root?.includes('user')).toBe(true);
  });

  it('handles single path', () => {
    const root = inferWorkspaceRoot(['/home/user/project/src/app.ts']);
    expect(root).toBeDefined();
  });
});
