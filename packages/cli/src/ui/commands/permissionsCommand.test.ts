/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import * as process from 'node:process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { permissionsCommand } from './permissionsCommand.js';
import { type CommandContext, CommandKind } from './types.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';

vi.mock('node:fs');

describe('permissionsCommand', () => {
  let mockContext: CommandContext;

  beforeEach(() => {
    mockContext = createMockCommandContext();
    vi.mocked(fs).statSync.mockReturnValue({
      isDirectory: vi.fn(() => true),
    } as unknown as fs.Stats);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should have the correct name and description', () => {
    expect(permissionsCommand.name).toBe('permissions');
    expect(permissionsCommand.description).toBe(
      'Manage folder trust settings and other permissions',
    );
  });

  it('should be a built-in command', () => {
    expect(permissionsCommand.kind).toBe(CommandKind.BUILT_IN);
  });

  it('should have a trust subcommand', () => {
    const trustCommand = permissionsCommand.subCommands?.find(
      (cmd) => cmd.name === 'trust',
    );
    expect(trustCommand).toBeDefined();
    expect(trustCommand?.name).toBe('trust');
    expect(trustCommand?.description).toBe(
      'Manage folder trust settings. Usage: /permissions trust [<directory-path>]',
    );
    expect(trustCommand?.kind).toBe(CommandKind.BUILT_IN);
  });

  it('should return an action to open the permissions dialog with a specified directory', () => {
    const trustCommand = permissionsCommand.subCommands?.find(
      (cmd) => cmd.name === 'trust',
    );
    const actionResult = trustCommand?.action?.(mockContext, '/test/dir');
    expect(actionResult).toEqual({
      type: 'dialog',
      dialog: 'permissions',
      props: {
        targetDirectory: path.resolve('/test/dir'),
      },
    });
  });

  it('should return an action to open the permissions dialog with the current directory if no path is provided', () => {
    const trustCommand = permissionsCommand.subCommands?.find(
      (cmd) => cmd.name === 'trust',
    );
    const actionResult = trustCommand?.action?.(mockContext, '');
    expect(actionResult).toEqual({
      type: 'dialog',
      dialog: 'permissions',
      props: {
        targetDirectory: process.cwd(),
      },
    });
  });

  it('should return an error message if the provided path does not exist', () => {
    const trustCommand = permissionsCommand.subCommands?.find(
      (cmd) => cmd.name === 'trust',
    );
    vi.mocked(fs).statSync.mockImplementation(() => {
      throw new Error('ENOENT: no such file or directory');
    });
    const actionResult = trustCommand?.action?.(
      mockContext,
      '/nonexistent/dir',
    );
    expect(actionResult).toEqual({
      type: 'message',
      messageType: 'error',
      content: `Error accessing path: ${path.resolve(
        '/nonexistent/dir',
      )}. ENOENT: no such file or directory`,
    });
  });

  it('should return an error message if the provided path is not a directory', () => {
    const trustCommand = permissionsCommand.subCommands?.find(
      (cmd) => cmd.name === 'trust',
    );
    vi.mocked(fs).statSync.mockReturnValue({
      isDirectory: vi.fn(() => false),
    } as unknown as fs.Stats);
    const actionResult = trustCommand?.action?.(mockContext, '/file/not/dir');
    expect(actionResult).toEqual({
      type: 'message',
      messageType: 'error',
      content: `Path is not a directory: ${path.resolve('/file/not/dir')}`,
    });
  });
});
