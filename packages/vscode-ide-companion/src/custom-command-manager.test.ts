/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { CustomCommandManager } from './custom-command-manager.js';
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

describe('CustomCommandManager - Collision Detection', () => {
  const createCommand = (name: string, filePath: string): CustomCommand => ({
    name,
    displayName: name,
    prompt: 'test',
    filePath,
    isNested: name.includes(':'),
  });

  it('no collisions for unique names', () => {
    const manager = new CustomCommandManager(vi.fn()) as unknown as Record<
      string,
      unknown
    >;
    (manager.detectCollisions as (cmds: CustomCommand[]) => void)([
      createCommand('explain', '/commands/explain.toml'),
      createCommand('fix', '/commands/fix.toml'),
    ]);
    expect((manager.commandsNeedingHash as Set<string>).size).toBe(0);
  });

  it('detects collision: test-run vs test:run', () => {
    const manager = new CustomCommandManager(vi.fn()) as unknown as Record<
      string,
      unknown
    >;
    (manager.detectCollisions as (cmds: CustomCommand[]) => void)([
      createCommand('test-run', '/commands/test-run.toml'),
      createCommand('test:run', '/commands/test/run.toml'),
    ]);
    expect((manager.commandsNeedingHash as Set<string>).size).toBe(2);
  });

  it('detects collision: a.b vs a:b vs a@b', () => {
    const manager = new CustomCommandManager(vi.fn()) as unknown as Record<
      string,
      unknown
    >;
    (manager.detectCollisions as (cmds: CustomCommand[]) => void)([
      createCommand('a.b', '/commands/a.b.toml'),
      createCommand('a:b', '/commands/a/b.toml'),
      createCommand('a@b', '/commands/a@b.toml'),
    ]);
    expect((manager.commandsNeedingHash as Set<string>).size).toBe(3);
  });

  it('mixed: only colliding commands get hash', () => {
    const manager = new CustomCommandManager(vi.fn()) as unknown as Record<
      string,
      unknown
    >;
    const commands = [
      createCommand('explain', '/commands/explain.toml'),
      createCommand('test-run', '/commands/test-run.toml'),
      createCommand('test:run', '/commands/test/run.toml'),
      createCommand('fix', '/commands/fix.toml'),
    ];
    (manager.detectCollisions as (cmds: CustomCommand[]) => void)(commands);

    expect((manager.commandsNeedingHash as Set<string>).size).toBe(2);
    expect(
      (manager.commandsNeedingHash as Set<string>).has(
        '/commands/test-run.toml',
      ),
    ).toBe(true);
    expect(
      (manager.commandsNeedingHash as Set<string>).has(
        '/commands/test/run.toml',
      ),
    ).toBe(true);
    expect(
      (manager.commandsNeedingHash as Set<string>).has(
        '/commands/explain.toml',
      ),
    ).toBe(false);
  });
});
