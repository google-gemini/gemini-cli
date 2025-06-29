/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { expect, describe, it } from 'vitest';
import { ShellTool } from './shell.js';
import { Config } from '../config/config.js';

describe('ShellTool', () => {
  it('should allow a command if no restrictions are provided', async () => {
    const config = {
      getCoreTools: () => undefined,
      getExcludeTools: () => undefined,
    } as Config;
    const shellTool = new ShellTool(config);
    const isAllowed = shellTool.isCommandAllowed('ls -l');
    expect(isAllowed).toBe(true);
  });

  it('should allow a command if it is in the allowed list', async () => {
    const config = {
      getCoreTools: () => ['ShellTool(ls -l)'],
      getExcludeTools: () => undefined,
    } as unknown as Config;
    const shellTool = new ShellTool(config);
    const isAllowed = shellTool.isCommandAllowed('ls -l');
    expect(isAllowed).toBe(true);
  });

  it('should block a command if it is not in the allowed list', async () => {
    const config = {
      getCoreTools: () => ['ShellTool(ls -l)'],
      getExcludeTools: () => undefined,
    } as unknown as Config;
    const shellTool = new ShellTool(config);
    const isAllowed = shellTool.isCommandAllowed('rm -rf /');
    expect(isAllowed).toBe(false);
  });

  it('should block a command if it is in the blocked list', async () => {
    const config = {
      getCoreTools: () => undefined,
      getExcludeTools: () => ['ShellTool(rm -rf /)'],
    } as unknown as Config;
    const shellTool = new ShellTool(config);
    const isAllowed = shellTool.isCommandAllowed('rm -rf /');
    expect(isAllowed).toBe(false);
  });

  it('should allow a command if it is not in the blocked list', async () => {
    const config = {
      getCoreTools: () => undefined,
      getExcludeTools: () => ['ShellTool(rm -rf /)'],
    } as unknown as Config;
    const shellTool = new ShellTool(config);
    const isAllowed = shellTool.isCommandAllowed('ls -l');
    expect(isAllowed).toBe(true);
  });

  it('should block a command if it is in both the allowed and blocked lists', async () => {
    const config = {
      getCoreTools: () => ['ShellTool(rm -rf /)'],
      getExcludeTools: () => ['ShellTool(rm -rf /)'],
    } as unknown as Config;
    const shellTool = new ShellTool(config);
    const isAllowed = shellTool.isCommandAllowed('rm -rf /');
    expect(isAllowed).toBe(false);
  });

  it('should allow any command when ShellTool is in coreTools without specific commands', async () => {
    const config = {
      getCoreTools: () => ['ShellTool'],
      getExcludeTools: () => [],
    } as unknown as Config;
    const shellTool = new ShellTool(config);
    const isAllowed = shellTool.isCommandAllowed('any command');
    expect(isAllowed).toBe(true);
  });

  it('should block any command when ShellTool is in excludeTools without specific commands', async () => {
    const config = {
      getCoreTools: () => [],
      getExcludeTools: () => ['ShellTool'],
    } as unknown as Config;
    const shellTool = new ShellTool(config);
    const isAllowed = shellTool.isCommandAllowed('any command');
    expect(isAllowed).toBe(false);
  });

  it('should allow a command if it is in the allowed list using the public-facing name', async () => {
    const config = {
      getCoreTools: () => ['run_shell_command(ls -l)'],
      getExcludeTools: () => undefined,
    } as unknown as Config;
    const shellTool = new ShellTool(config);
    const isAllowed = shellTool.isCommandAllowed('ls -l');
    expect(isAllowed).toBe(true);
  });

  it('should block a command if it is in the blocked list using the public-facing name', async () => {
    const config = {
      getCoreTools: () => undefined,
      getExcludeTools: () => ['run_shell_command(rm -rf /)'],
    } as unknown as Config;
    const shellTool = new ShellTool(config);
    const isAllowed = shellTool.isCommandAllowed('rm -rf /');
    expect(isAllowed).toBe(false);
  });

  it('should block any command when ShellTool is in excludeTools using the public-facing name', async () => {
    const config = {
      getCoreTools: () => [],
      getExcludeTools: () => ['run_shell_command'],
    } as unknown as Config;
    const shellTool = new ShellTool(config);
    const isAllowed = shellTool.isCommandAllowed('any command');
    expect(isAllowed).toBe(false);
  });

  it('should block any command if coreTools contains an empty ShellTool command list using the public-facing name', async () => {
    const config = {
      getCoreTools: () => ['run_shell_command()'],
      getExcludeTools: () => [],
    } as unknown as Config;
    const shellTool = new ShellTool(config);
    const isAllowed = shellTool.isCommandAllowed('any command');
    expect(isAllowed).toBe(false);
  });

  it('should block any command if coreTools contains an empty ShellTool command list', async () => {
    const config = {
      getCoreTools: () => ['ShellTool()'],
      getExcludeTools: () => [],
    } as unknown as Config;
    const shellTool = new ShellTool(config);
    const isAllowed = shellTool.isCommandAllowed('any command');
    expect(isAllowed).toBe(false);
  });

  it('should block a command with extra whitespace if it is in the blocked list', async () => {
    const config = {
      getCoreTools: () => undefined,
      getExcludeTools: () => ['ShellTool(rm -rf /)'],
    } as unknown as Config;
    const shellTool = new ShellTool(config);
    const isAllowed = shellTool.isCommandAllowed(' rm  -rf  / ');
    expect(isAllowed).toBe(false);
  });

  it('should allow any command when ShellTool is present with specific commands', async () => {
    const config = {
      getCoreTools: () => ['ShellTool', 'ShellTool(ls)'],
      getExcludeTools: () => [],
    } as unknown as Config;
    const shellTool = new ShellTool(config);
    const isAllowed = shellTool.isCommandAllowed('any command');
    expect(isAllowed).toBe(true);
  });

  it('should block a command on the blocklist even with a wildcard allow', async () => {
    const config = {
      getCoreTools: () => ['ShellTool'],
      getExcludeTools: () => ['ShellTool(rm -rf /)'],
    } as unknown as Config;
    const shellTool = new ShellTool(config);
    const isAllowed = shellTool.isCommandAllowed('rm -rf /');
    expect(isAllowed).toBe(false);
  });
});
