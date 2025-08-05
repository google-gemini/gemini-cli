/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { ConfirmationRequiredError, ShellProcessor } from './shellProcessor.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { CommandContext } from '../../ui/commands/types.js';
import { Config } from '@google/gemini-cli-core';

const mockCheckCommandPermissions = vi.hoisted(() => vi.fn());
const mockShellExecute = vi.hoisted(() => vi.fn());

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const original = await importOriginal<object>();
  return {
    ...original,
    checkCommandPermissions: mockCheckCommandPermissions,
    ShellExecutionService: {
      execute: mockShellExecute,
    },
  };
});

describe('ShellProcessor', () => {
  let context: CommandContext;
  let mockConfig: Partial<Config>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockConfig = {
      getTargetDir: vi.fn().mockReturnValue('/test/dir'),
    };

    context = createMockCommandContext({
      services: {
        config: mockConfig as Config,
      },
      session: {
        sessionShellAllowlist: new Set(),
      },
    });

    mockShellExecute.mockReturnValue({
      result: Promise.resolve({
        output: 'default shell output',
      }),
    });
    mockCheckCommandPermissions.mockReturnValue({
      allAllowed: true,
      disallowedCommands: [],
    });
  });

  it('should not change the prompt if no shell injections are present', async () => {
    const processor = new ShellProcessor('test-command');
    const prompt = 'This is a simple prompt with no injections.';
    const result = await processor.process(prompt, context);
    expect(result).toBe(prompt);
    expect(mockShellExecute).not.toHaveBeenCalled();
  });

  it('should process a single valid shell injection if allowed', async () => {
    const processor = new ShellProcessor('test-command');
    const prompt = 'The current status is: !{git status}';
    mockCheckCommandPermissions.mockReturnValue({
      allAllowed: true,
      disallowedCommands: [],
    });
    mockShellExecute.mockReturnValue({
      result: Promise.resolve({ output: 'On branch main' }),
    });

    const result = await processor.process(prompt, context);

    expect(mockCheckCommandPermissions).toHaveBeenCalledWith(
      'git status',
      expect.any(Object),
      context.session.sessionShellAllowlist,
    );
    expect(mockShellExecute).toHaveBeenCalledWith(
      'git status',
      expect.any(String),
      expect.any(Function),
      expect.any(Object),
    );
    expect(result).toBe('The current status is: On branch main');
  });

  it('should process multiple valid shell injections if all are allowed', async () => {
    const processor = new ShellProcessor('test-command');
    const prompt = '!{git status} in !{pwd}';
    mockCheckCommandPermissions.mockReturnValue({
      allAllowed: true,
      disallowedCommands: [],
    });

    mockShellExecute
      .mockReturnValueOnce({
        result: Promise.resolve({ output: 'On branch main' }),
      })
      .mockReturnValueOnce({
        result: Promise.resolve({ output: '/usr/home' }),
      });

    const result = await processor.process(prompt, context);

    expect(mockCheckCommandPermissions).toHaveBeenCalledTimes(2);
    expect(mockShellExecute).toHaveBeenCalledTimes(2);
    expect(result).toBe('On branch main in /usr/home');
  });

  it('should throw ConfirmationRequiredError if a command is not allowed', async () => {
    const processor = new ShellProcessor('test-command');
    const prompt = 'Do something dangerous: !{rm -rf /}';
    mockCheckCommandPermissions.mockReturnValue({
      allAllowed: false,
      disallowedCommands: ['rm -rf /'],
    });

    await expect(processor.process(prompt, context)).rejects.toThrow(
      ConfirmationRequiredError,
    );
  });

  it('should throw ConfirmationRequiredError with the correct command', async () => {
    const processor = new ShellProcessor('test-command');
    const prompt = 'Do something dangerous: !{rm -rf /}';
    mockCheckCommandPermissions.mockReturnValue({
      allAllowed: false,
      disallowedCommands: ['rm -rf /'],
    });

    try {
      await processor.process(prompt, context);
      // Fail if it doesn't throw
      expect(true).toBe(false);
    } catch (e) {
      expect(e).toBeInstanceOf(ConfirmationRequiredError);
      if (e instanceof ConfirmationRequiredError) {
        expect(e.commandsToConfirm).toEqual(['rm -rf /']);
      }
    }

    expect(mockShellExecute).not.toHaveBeenCalled();
  });

  it('should throw ConfirmationRequiredError with multiple commands if multiple are disallowed', async () => {
    const processor = new ShellProcessor('test-command');
    const prompt = '!{cmd1} and !{cmd2}';
    mockCheckCommandPermissions.mockImplementation((cmd) => {
      if (cmd === 'cmd1') {
        return { allAllowed: false, disallowedCommands: ['cmd1'] };
      }
      if (cmd === 'cmd2') {
        return { allAllowed: false, disallowedCommands: ['cmd2'] };
      }
      return { allAllowed: true, disallowedCommands: [] };
    });

    try {
      await processor.process(prompt, context);
      // Fail if it doesn't throw
      expect(true).toBe(false);
    } catch (e) {
      expect(e).toBeInstanceOf(ConfirmationRequiredError);
      if (e instanceof ConfirmationRequiredError) {
        expect(e.commandsToConfirm).toEqual(['cmd1', 'cmd2']);
      }
    }
  });

  it('should not execute any commands if at least one requires confirmation', async () => {
    const processor = new ShellProcessor('test-command');
    const prompt = 'First: !{echo "hello"}, Second: !{rm -rf /}';

    mockCheckCommandPermissions.mockImplementation((cmd) => {
      if (cmd.includes('rm')) {
        return { allAllowed: false, disallowedCommands: [cmd] };
      }
      return { allAllowed: true, disallowedCommands: [] };
    });

    await expect(processor.process(prompt, context)).rejects.toThrow(
      ConfirmationRequiredError,
    );

    // Ensure no commands were executed because the pipeline was halted.
    expect(mockShellExecute).not.toHaveBeenCalled();
  });

  it('should only request confirmation for disallowed commands in a mixed prompt', async () => {
    const processor = new ShellProcessor('test-command');
    const prompt = 'Allowed: !{ls -l}, Disallowed: !{rm -rf /}';

    mockCheckCommandPermissions.mockImplementation((cmd) => ({
      allAllowed: !cmd.includes('rm'),
      disallowedCommands: cmd.includes('rm') ? [cmd] : [],
    }));

    try {
      await processor.process(prompt, context);
      expect.fail('Should have thrown ConfirmationRequiredError');
    } catch (e) {
      expect(e).toBeInstanceOf(ConfirmationRequiredError);
      if (e instanceof ConfirmationRequiredError) {
        expect(e.commandsToConfirm).toEqual(['rm -rf /']);
      }
    }
  });

  it('should execute all commands if they are on the session allowlist', async () => {
    const processor = new ShellProcessor('test-command');
    const prompt = 'Run !{cmd1} and !{cmd2}';

    // Add commands to the session allowlist
    context.session.sessionShellAllowlist = new Set(['cmd1', 'cmd2']);

    // checkCommandPermissions should now pass for these
    mockCheckCommandPermissions.mockReturnValue({
      allAllowed: true,
      disallowedCommands: [],
    });

    mockShellExecute
      .mockReturnValueOnce({ result: Promise.resolve({ output: 'output1' }) })
      .mockReturnValueOnce({ result: Promise.resolve({ output: 'output2' }) });

    const result = await processor.process(prompt, context);

    expect(mockCheckCommandPermissions).toHaveBeenCalledWith(
      'cmd1',
      expect.any(Object),
      context.session.sessionShellAllowlist,
    );
    expect(mockCheckCommandPermissions).toHaveBeenCalledWith(
      'cmd2',
      expect.any(Object),
      context.session.sessionShellAllowlist,
    );
    expect(mockShellExecute).toHaveBeenCalledTimes(2);
    expect(result).toBe('Run output1 and output2');
  });

  it('should trim whitespace from the command inside the injection', async () => {
    const processor = new ShellProcessor('test-command');
    const prompt = 'Files: !{  ls -l  }';
    mockCheckCommandPermissions.mockReturnValue({
      allAllowed: true,
      disallowedCommands: [],
    });
    mockShellExecute.mockReturnValue({
      result: Promise.resolve({ output: 'total 0' }),
    });

    await processor.process(prompt, context);

    expect(mockCheckCommandPermissions).toHaveBeenCalledWith(
      'ls -l', // Verifies that the command was trimmed
      expect.any(Object),
      context.session.sessionShellAllowlist,
    );
    expect(mockShellExecute).toHaveBeenCalledWith(
      'ls -l',
      expect.any(String),
      expect.any(Function),
      expect.any(Object),
    );
  });

  it('should handle an empty command inside the injection gracefully', async () => {
    const processor = new ShellProcessor('test-command');
    const prompt = 'This is weird: !{}';
    mockCheckCommandPermissions.mockReturnValue({
      allAllowed: true,
      disallowedCommands: [],
    });
    mockShellExecute.mockReturnValue({
      result: Promise.resolve({ output: 'empty output' }),
    });

    const result = await processor.process(prompt, context);

    expect(mockCheckCommandPermissions).toHaveBeenCalledWith(
      '',
      expect.any(Object),
      context.session.sessionShellAllowlist,
    );
    expect(mockShellExecute).toHaveBeenCalledWith(
      '',
      expect.any(String),
      expect.any(Function),
      expect.any(Object),
    );
    expect(result).toBe('This is weird: empty output');
  });
});
