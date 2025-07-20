/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { expect, describe, it, vi, beforeEach } from 'vitest';
import { AdbTool } from './adb.js';
import { Config } from '../config/config.js';
import * as summarizer from '../utils/summarizer.js';
import { GeminiClient } from '../core/client.js';

// Mock child_process module
vi.mock('child_process', () => ({
  spawn: vi.fn(() => ({
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
    on: vi.fn((event, callback) => {
      if (event === 'exit') {
        setTimeout(() => callback(0, null), 10);
      }
    }),
    pid: 12345,
  })),
}));

describe('AdbTool', () => {
  it('should allow a command if no restrictions are provided', async () => {
    const config = {
      getCoreTools: () => undefined,
      getExcludeTools: () => undefined,
      getAdbSudoMode: () => false,
    } as Config;
    const adbTool = new AdbTool(config);
    const result = adbTool.isCommandAllowed('devices');
    expect(result.allowed).toBe(true);
  });

  it('should allow a command if it is in the allowed list', async () => {
    const config = {
      getCoreTools: () => ['AdbTool(devices)'],
      getExcludeTools: () => undefined,
      getAdbSudoMode: () => false,
    } as unknown as Config;
    const adbTool = new AdbTool(config);
    const result = adbTool.isCommandAllowed('devices');
    expect(result.allowed).toBe(true);
  });

  it('should block a command if it is not in the allowed list', async () => {
    const config = {
      getCoreTools: () => ['AdbTool(devices)'],
      getExcludeTools: () => undefined,
      getAdbSudoMode: () => false,
    } as unknown as Config;
    const adbTool = new AdbTool(config);
    const result = adbTool.isCommandAllowed('shell rm -rf /data');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(
      "ADB command 'shell rm -rf /data' is not in the allowed commands list",
    );
  });

  it('should block a command if it is in the blocked list', async () => {
    const config = {
      getCoreTools: () => undefined,
      getExcludeTools: () => ['AdbTool(shell rm)'],
      getAdbSudoMode: () => false,
    } as unknown as Config;
    const adbTool = new AdbTool(config);
    const result = adbTool.isCommandAllowed('shell rm -rf /data');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(
      "ADB command 'shell rm -rf /data' is blocked by configuration",
    );
  });

  it('should allow a command if it is not in the blocked list', async () => {
    const config = {
      getCoreTools: () => undefined,
      getExcludeTools: () => ['AdbTool(shell rm)'],
      getAdbSudoMode: () => false,
    } as unknown as Config;
    const adbTool = new AdbTool(config);
    const result = adbTool.isCommandAllowed('devices');
    expect(result.allowed).toBe(true);
  });

  it('should block a command if it is in both the allowed and blocked lists', async () => {
    const config = {
      getCoreTools: () => ['AdbTool(devices)'],
      getExcludeTools: () => ['AdbTool(devices)'],
      getAdbSudoMode: () => false,
    } as unknown as Config;
    const adbTool = new AdbTool(config);
    const result = adbTool.isCommandAllowed('devices');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(
      "ADB command 'devices' is blocked by configuration",
    );
  });

  it('should allow any command when AdbTool is in coreTools without specific commands', async () => {
    const config = {
      getCoreTools: () => ['AdbTool'],
      getExcludeTools: () => [],
      getAdbSudoMode: () => false,
    } as unknown as Config;
    const adbTool = new AdbTool(config);
    const result = adbTool.isCommandAllowed('shell ls');
    expect(result.allowed).toBe(true);
  });

  it('should block any command when AdbTool is in excludeTools without specific commands', async () => {
    const config = {
      getCoreTools: () => [],
      getExcludeTools: () => ['AdbTool'],
      getAdbSudoMode: () => false,
    } as unknown as Config;
    const adbTool = new AdbTool(config);
    const result = adbTool.isCommandAllowed('devices');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(
      'ADB tool is globally disabled in configuration',
    );
  });

  it('should allow a command if it is in the allowed list using the public-facing name', async () => {
    const config = {
      getCoreTools: () => ['run_adb_command(devices)'],
      getExcludeTools: () => undefined,
      getAdbSudoMode: () => false,
    } as unknown as Config;
    const adbTool = new AdbTool(config);
    const result = adbTool.isCommandAllowed('devices');
    expect(result.allowed).toBe(true);
  });

  it('should block a command if it is in the blocked list using the public-facing name', async () => {
    const config = {
      getCoreTools: () => undefined,
      getExcludeTools: () => ['run_adb_command(shell rm)'],
      getAdbSudoMode: () => false,
    } as unknown as Config;
    const adbTool = new AdbTool(config);
    const result = adbTool.isCommandAllowed('shell rm -rf /data');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(
      "ADB command 'shell rm -rf /data' is blocked by configuration",
    );
  });

  it('should block any command when AdbTool is in excludeTools using the public-facing name', async () => {
    const config = {
      getCoreTools: () => [],
      getExcludeTools: () => ['run_adb_command'],
      getAdbSudoMode: () => false,
    } as unknown as Config;
    const adbTool = new AdbTool(config);
    const result = adbTool.isCommandAllowed('devices');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(
      'ADB tool is globally disabled in configuration',
    );
  });

  it('should block a command with command substitution using $()', async () => {
    const config = {
      getCoreTools: () => ['run_adb_command(shell)'],
      getExcludeTools: () => [],
      getAdbSudoMode: () => false,
    } as unknown as Config;
    const adbTool = new AdbTool(config);
    const result = adbTool.isCommandAllowed('shell echo $(rm -rf /)');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(
      'Command substitution using $() is not allowed for security reasons',
    );
  });

  it('should allow a command that starts with an allowed command prefix', async () => {
    const config = {
      getCoreTools: () => ['AdbTool(shell ls)'],
      getExcludeTools: () => [],
      getAdbSudoMode: () => false,
    } as unknown as Config;
    const adbTool = new AdbTool(config);
    const result = adbTool.isCommandAllowed('shell ls -la /data/data');
    expect(result.allowed).toBe(true);
  });

  it('should not allow a command that is chained with another command', async () => {
    const config = {
      getCoreTools: () => ['run_adb_command(shell ls)'],
      getExcludeTools: () => [],
      getAdbSudoMode: () => false,
    } as unknown as Config;
    const adbTool = new AdbTool(config);
    const result = adbTool.isCommandAllowed('shell ls&&shell rm -rf /data');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(
      "ADB command 'shell rm -rf /data' is not in the allowed commands list",
    );
  });

  it('should extract correct command root', async () => {
    const config = {
      getAdbSudoMode: () => false,
    } as unknown as Config;
    const adbTool = new AdbTool(config);
    
    expect(adbTool.getCommandRoot('devices')).toBe('devices');
    expect(adbTool.getCommandRoot('shell ls -la')).toBe('shell');
    expect(adbTool.getCommandRoot('install app.apk')).toBe('install');
    expect(adbTool.getCommandRoot('logcat -v time')).toBe('logcat');
  });

  it('should validate params correctly', async () => {
    const config = {
      getCoreTools: () => undefined,
      getExcludeTools: () => undefined,
      getAdbSudoMode: () => false,
    } as unknown as Config;
    const adbTool = new AdbTool(config);
    
    expect(adbTool.validateToolParams({ command: 'devices' })).toBeNull();
    expect(adbTool.validateToolParams({ command: '' })).toBe('ADB command cannot be empty.');
    expect(adbTool.validateToolParams({ command: '   ' })).toBe('ADB command cannot be empty.');
  });

  it('should generate correct description', async () => {
    const config = {
      getAdbSudoMode: () => false,
    } as unknown as Config;
    const adbTool = new AdbTool(config);
    
    expect(adbTool.getDescription({ command: 'devices' })).toBe('adb devices');
    expect(adbTool.getDescription({ 
      command: 'shell ls', 
      deviceId: 'emulator-5554' 
    })).toBe('adb shell ls [for device emulator-5554]');
    expect(adbTool.getDescription({ 
      command: 'devices', 
      description: 'List connected devices' 
    })).toBe('adb devices (List connected devices)');
  });
});

describe('AdbTool Bug Reproduction', () => {
  let adbTool: AdbTool;
  let config: Config;

  beforeEach(() => {
    config = {
      getCoreTools: () => undefined,
      getExcludeTools: () => undefined,
      getDebugMode: () => false,
      getGeminiClient: () => ({}) as GeminiClient,
      getTargetDir: () => '.',
      getSummarizeToolOutputConfig: () => ({
        [adbTool?.name]: {},
      }),
      getAdbSudoMode: () => false,
    } as unknown as Config;
    adbTool = new AdbTool(config);
  });

  it('should not let the summarizer override the return display', async () => {
    const summarizeSpy = vi
      .spyOn(summarizer, 'summarizeToolOutput')
      .mockResolvedValue('summarized output');

    const abortSignal = new AbortController().signal;
    const result = await adbTool.execute(
      { command: 'devices' },
      abortSignal,
    );

    expect(result.llmContent).toBe('summarized output');
    expect(summarizeSpy).toHaveBeenCalled();
  });

  it('should not call summarizer if disabled in config', async () => {
    config = {
      getCoreTools: () => undefined,
      getExcludeTools: () => undefined,
      getDebugMode: () => false,
      getGeminiClient: () => ({}) as GeminiClient,
      getTargetDir: () => '.',
      getSummarizeToolOutputConfig: () => ({}),
      getAdbSudoMode: () => false,
    } as unknown as Config;
    adbTool = new AdbTool(config);

    const summarizeSpy = vi
      .spyOn(summarizer, 'summarizeToolOutput')
      .mockResolvedValue('summarized output');

    const abortSignal = new AbortController().signal;
    const result = await adbTool.execute(
      { command: 'devices' },
      abortSignal,
    );

    expect(result.llmContent).not.toBe('summarized output');
    expect(summarizeSpy).not.toHaveBeenCalled();
  });

  it('should handle sudo mode configuration', async () => {
    const sudoConfig = {
      getCoreTools: () => undefined,
      getExcludeTools: () => undefined,
      getDebugMode: () => false,
      getGeminiClient: () => ({}) as GeminiClient,
      getTargetDir: () => '.',
      getSummarizeToolOutputConfig: () => ({}),
      getAdbSudoMode: () => true,
    } as unknown as Config;
    const sudoAdbTool = new AdbTool(sudoConfig);

    expect(sudoAdbTool.description).toContain('Note: Sudo mode is enabled');
    
    const noSudoConfig = {
      getCoreTools: () => undefined,
      getExcludeTools: () => undefined,
      getDebugMode: () => false,
      getGeminiClient: () => ({}) as GeminiClient,
      getTargetDir: () => '.',
      getSummarizeToolOutputConfig: () => ({}),
      getAdbSudoMode: () => false,
    } as unknown as Config;
    const noSudoAdbTool = new AdbTool(noSudoConfig);

    expect(noSudoAdbTool.description).toContain('Note: Sudo mode is disabled');
  });
});