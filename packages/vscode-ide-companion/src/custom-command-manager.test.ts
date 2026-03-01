/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { CustomCommandManager } from './custom-command-manager.js';
import { sanitizeInput } from './sanitize-input.js';
import type { CustomCommand } from './types.js';

// Mock VS Code API
vi.mock('vscode', () => ({
  window: { showInformationMessage: vi.fn() },
  commands: { registerCommand: vi.fn(() => ({ dispose: vi.fn() })) },
  workspace: {
    createFileSystemWatcher: vi.fn(() => ({
      onDidCreate: vi.fn(),
      onDidChange: vi.fn(),
      onDidDelete: vi.fn(),
      dispose: vi.fn(),
    })),
  },
  RelativePattern: vi.fn(),
}));

vi.mock('./command-scanner.js', () => ({
  CommandScanner: vi.fn().mockImplementation(() => ({
    scanCommands: vi.fn(async () => ({ commands: [], errors: [] })),
    watchCommands: vi.fn(() => ({ dispose: vi.fn() })),
    dispose: vi.fn(),
  })),
}));

vi.mock('@google/gemini-cli-core', () => ({
  homedir: () => '/mock/home',
}));

// Helper to access private members for testing
interface ManagerForTesting {
  detectCollisions: (commands: CustomCommand[]) => void;
  commandsNeedingHash: Set<string>;
}

describe('CustomCommandManager - Collision Detection', () => {
  const createCommand = (name: string, filePath: string): CustomCommand => ({
    name,
    displayName: name,
    prompt: 'test',
    filePath,
    isNested: name.includes(':'),
  });

  it('no collisions for unique names', () => {
    const manager = new CustomCommandManager(
      vi.fn(),
    ) as unknown as ManagerForTesting;
    manager.detectCollisions([
      createCommand('explain', '/commands/explain.toml'),
      createCommand('fix', '/commands/fix.toml'),
    ]);
    expect(manager.commandsNeedingHash.size).toBe(0);
  });

  it('detects collision: test-run vs test:run', () => {
    const manager = new CustomCommandManager(
      vi.fn(),
    ) as unknown as ManagerForTesting;
    manager.detectCollisions([
      createCommand('test-run', '/commands/test-run.toml'),
      createCommand('test:run', '/commands/test/run.toml'),
    ]);
    expect(manager.commandsNeedingHash.size).toBe(2);
  });

  it('detects collision: a.b vs a:b vs a@b', () => {
    const manager = new CustomCommandManager(
      vi.fn(),
    ) as unknown as ManagerForTesting;
    manager.detectCollisions([
      createCommand('a.b', '/commands/a.b.toml'),
      createCommand('a:b', '/commands/a/b.toml'),
      createCommand('a@b', '/commands/a@b.toml'),
    ]);
    expect(manager.commandsNeedingHash.size).toBe(3);
  });

  it('mixed: only colliding commands get hash', () => {
    const manager = new CustomCommandManager(
      vi.fn(),
    ) as unknown as ManagerForTesting;
    manager.detectCollisions([
      createCommand('explain', '/commands/explain.toml'),
      createCommand('test-run', '/commands/test-run.toml'),
      createCommand('test:run', '/commands/test/run.toml'),
      createCommand('fix', '/commands/fix.toml'),
    ]);

    expect(manager.commandsNeedingHash.size).toBe(2);
    expect(manager.commandsNeedingHash.has('/commands/test-run.toml')).toBe(
      true,
    );
    expect(manager.commandsNeedingHash.has('/commands/test/run.toml')).toBe(
      true,
    );
    expect(manager.commandsNeedingHash.has('/commands/explain.toml')).toBe(
      false,
    );
  });
});

describe('Input Sanitization', () => {
  // These tests validate the production sanitization logic to prevent
  // prompt injection and backslash bypass attacks

  it('escapes backslash to prevent bypass attacks', () => {
    expect(sanitizeInput('\\!{malicious}')).toBe('\\\\\\!{malicious}');
    expect(sanitizeInput('\\@{/etc/passwd}')).toBe('\\\\\\@{/etc/passwd}');
    expect(sanitizeInput('\\\\{{args}}')).toBe('\\\\\\\\\\{{args}}');
  });

  it('escapes Gemini CLI special sequences', () => {
    expect(sanitizeInput('!{rm -rf /}')).toBe('\\!{rm -rf /}');
    expect(sanitizeInput('@{/etc/passwd}')).toBe('\\@{/etc/passwd}');
    expect(sanitizeInput('{{malicious_args}}')).toBe('\\{{malicious_args}}');
  });

  it('escapes HTML-like tag characters', () => {
    expect(sanitizeInput('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert("xss")&lt;/script&gt;',
    );
    expect(sanitizeInput('a < b && c > d')).toBe('a &lt; b && c &gt; d');
  });

  it('handles combined attack vectors', () => {
    const malicious = '\\!{cmd} && <tag>@{file}';
    expect(sanitizeInput(malicious)).toBe(
      '\\\\\\!{cmd} && &lt;tag&gt;\\@{file}',
    );
  });

  it('preserves safe text unchanged', () => {
    expect(sanitizeInput('normal text')).toBe('normal text');
    expect(sanitizeInput('function(a, b) { return a + b; }')).toBe(
      'function(a, b) { return a + b; }',
    );
  });
});
