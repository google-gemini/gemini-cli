/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { getCommandPrefix } from './shell-utils.js';

describe('getCommandPrefix', () => {
  const shellCommandsWithSubcommands = ['git', 'npm', 'npx', 'gh', 'gh run'];

  it('should return only the root command for a simple command', () => {
    const command = 'ls -l';
    const prefix = getCommandPrefix(command, shellCommandsWithSubcommands);
    expect(prefix).toEqual('ls');
  });

  it('should return the root and the subcommand for a stemmable command', () => {
    const command = 'git status -v';
    const prefix = getCommandPrefix(command, shellCommandsWithSubcommands);
    expect(prefix).toEqual('git status');
  });

  it('should handle a complex stemmable command', () => {
    const command = 'gh run view --web';
    const prefix = getCommandPrefix(command, shellCommandsWithSubcommands);
    expect(prefix).toEqual('gh run view');
  });

  it('should return only the root for a non-stemmable command with multiple parts', () => {
    const command = 'echo "hello world"';
    const prefix = getCommandPrefix(command, shellCommandsWithSubcommands);
    expect(prefix).toEqual('echo');
  });

  it('should handle an empty command', () => {
    const command = '';
    const prefix = getCommandPrefix(command, shellCommandsWithSubcommands);
    expect(prefix).toEqual('');
  });

  it('should handle a command with only whitespace', () => {
    const command = '   ';
    const prefix = getCommandPrefix(command, shellCommandsWithSubcommands);
    expect(prefix).toEqual('');
  });

  it('should return the most specific prefix', () => {
    const command = 'git checkout main';
    const customShellCommandsWithSubcommands = ['git', 'git checkout'];
    const prefix = getCommandPrefix(
      command,
      customShellCommandsWithSubcommands,
    );
    expect(prefix).toEqual('git checkout main');
  });
});
