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
const mockEscapeShellArg = vi.hoisted(() => vi.fn());

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const original = await importOriginal<object>();
  return {
    ...original,
    checkCommandPermissions: mockCheckCommandPermissions,
    ShellExecutionService: {
      execute: mockShellExecute,
    },
    escapeShellArg: mockEscapeShellArg,
  };
});

const SUCCESS_RESULT = {
  output: 'default shell output',
  exitCode: 0,
  error: null,
  aborted: false,
  signal: null,
};

describe('ShellProcessor', () => {
  let context: CommandContext;
  let mockConfig: Partial<Config>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockEscapeShellArg.mockImplementation((arg) => `ESCAPED:${arg}`);

    mockConfig = {
      getTargetDir: vi.fn().mockReturnValue('/test/dir'),
    };

    context = createMockCommandContext({
      invocation: {
        raw: '/cmd default args',
        name: 'cmd',
        args: 'default args',
      },
      services: {
        config: mockConfig as Config,
      },
      session: {
        sessionShellAllowlist: new Set(),
      },
    });

    mockShellExecute.mockReturnValue({
      result: Promise.resolve(SUCCESS_RESULT),
    });

    mockCheckCommandPermissions.mockReturnValue({
      allAllowed: true,
      disallowedCommands: [],
    });
  });

  it('should throw an error if config is missing', async () => {
    const processor = new ShellProcessor('test-command');
    const prompt = '!{ls}';
    const contextWithoutConfig = createMockCommandContext({
      services: {
        config: null,
      },
    });

    await expect(
      processor.process(prompt, contextWithoutConfig),
    ).rejects.toThrow(/Security configuration not loaded/);
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
      result: Promise.resolve({ ...SUCCESS_RESULT, output: 'On branch main' }),
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
        result: Promise.resolve({
          ...SUCCESS_RESULT,
          output: 'On branch main',
        }),
      })
      .mockReturnValueOnce({
        result: Promise.resolve({ ...SUCCESS_RESULT, output: '/usr/home' }),
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
      .mockReturnValueOnce({
        result: Promise.resolve({ ...SUCCESS_RESULT, output: 'output1' }),
      })
      .mockReturnValueOnce({
        result: Promise.resolve({ ...SUCCESS_RESULT, output: 'output2' }),
      });

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

  it('should trim whitespace from the command inside the injection before interpolation', async () => {
    const processor = new ShellProcessor('test-command');
    // Command content is '  ls {{args}} -l  '
    const prompt = 'Files: !{  ls {{args}} -l  }';

    // The expected command uses the escaped arguments (default args from context)
    const expectedCommand = 'ls ESCAPED:default args -l';

    mockCheckCommandPermissions.mockReturnValue({
      allAllowed: true,
      disallowedCommands: [],
    });
    mockShellExecute.mockReturnValue({
      result: Promise.resolve({ ...SUCCESS_RESULT, output: 'total 0' }),
    });

    await processor.process(prompt, context);

    expect(mockCheckCommandPermissions).toHaveBeenCalledWith(
      expectedCommand,
      expect.any(Object),
      context.session.sessionShellAllowlist,
    );
    expect(mockShellExecute).toHaveBeenCalledWith(
      expectedCommand,
      expect.any(String),
      expect.any(Function),
      expect.any(Object),
    );
  });

  it('should handle an empty command inside the injection gracefully (skips execution)', async () => {
    const processor = new ShellProcessor('test-command');
    const prompt = 'This is weird: !{}';

    const result = await processor.process(prompt, context);

    expect(mockCheckCommandPermissions).not.toHaveBeenCalled();
    expect(mockShellExecute).not.toHaveBeenCalled();

    // It replaces !{} with an empty string.
    expect(result).toBe('This is weird: ');
  });

  describe('Robust Parsing (Balanced Braces)', () => {
    it('should correctly parse commands containing nested braces (e.g., awk)', async () => {
      const processor = new ShellProcessor('test-command');
      const command = "awk '{print $1}' file.txt";
      const prompt = `Output: !{${command}}`;
      mockShellExecute.mockReturnValue({
        result: Promise.resolve({ ...SUCCESS_RESULT, output: 'result' }),
      });

      const result = await processor.process(prompt, context);

      expect(mockCheckCommandPermissions).toHaveBeenCalledWith(
        command,
        expect.any(Object),
        context.session.sessionShellAllowlist,
      );
      expect(mockShellExecute).toHaveBeenCalledWith(
        command,
        expect.any(String),
        expect.any(Function),
        expect.any(Object),
      );
      expect(result).toBe('Output: result');
    });

    it('should handle deeply nested braces correctly', async () => {
      const processor = new ShellProcessor('test-command');
      const command = "echo '{{a},{b}}'";
      const prompt = `!{${command}}`;
      mockShellExecute.mockReturnValue({
        result: Promise.resolve({ ...SUCCESS_RESULT, output: '{{a},{b}}' }),
      });

      const result = await processor.process(prompt, context);
      expect(mockShellExecute).toHaveBeenCalledWith(
        command,
        expect.any(String),
        expect.any(Function),
        expect.any(Object),
      );
      expect(result).toBe('{{a},{b}}');
    });

    it('should throw an error for unclosed shell injections', async () => {
      const processor = new ShellProcessor('test-command');
      const prompt = 'This prompt is broken: !{ls -l';

      await expect(processor.process(prompt, context)).rejects.toThrow(
        /Unclosed shell injection/,
      );
    });

    it('should throw an error for unclosed nested braces', async () => {
      const processor = new ShellProcessor('test-command');
      const prompt = 'Broken: !{echo {a}';

      await expect(processor.process(prompt, context)).rejects.toThrow(
        /Unclosed shell injection/,
      );
    });
  });

  describe('Error Reporting', () => {
    it('should append exit code information if the command fails (non-zero exit code)', async () => {
      const processor = new ShellProcessor('test-command');
      const prompt = 'Run a failing command: !{exit 1}';
      mockShellExecute.mockReturnValue({
        result: Promise.resolve({
          ...SUCCESS_RESULT,
          output: 'some error output',
          exitCode: 1,
        }),
      });

      const result = await processor.process(prompt, context);

      expect(result).toBe(
        'Run a failing command: some error output\n[Shell command exited with code 1]',
      );
    });

    it('should append signal information if the command is terminated by signal', async () => {
      const processor = new ShellProcessor('test-command');
      const prompt = '!{cmd}';
      mockShellExecute.mockReturnValue({
        result: Promise.resolve({
          ...SUCCESS_RESULT,
          output: 'output',
          exitCode: null,
          signal: 'SIGTERM',
        }),
      });

      const result = await processor.process(prompt, context);

      expect(result).toBe(
        'output\n[Shell command terminated by signal SIGTERM]',
      );
    });

    it('should throw an error if the shell fails to spawn (and was not aborted)', async () => {
      const processor = new ShellProcessor('test-command');
      const prompt = '!{command}';
      const spawnError = new Error('spawn EACCES');
      mockShellExecute.mockReturnValue({
        result: Promise.resolve({
          ...SUCCESS_RESULT,
          output: '',
          exitCode: null,
          error: spawnError,
          aborted: false,
        }),
      });

      await expect(processor.process(prompt, context)).rejects.toThrow(
        /Failed to start shell command/,
      );
    });

    it('should not throw an error on spawn failure if it was aborted, but report abort status', async () => {
      const processor = new ShellProcessor('test-command');
      const prompt = '!{command}';
      const spawnError = new Error('Aborted');
      mockShellExecute.mockReturnValue({
        result: Promise.resolve({
          ...SUCCESS_RESULT,
          output: 'partial output',
          exitCode: null,
          error: spawnError,
          aborted: true, // Key difference
        }),
      });

      const result = await processor.process(prompt, context);
      expect(result).toBe('partial output\n[Shell command aborted]');
    });
  });

  describe('Context-Aware Argument Interpolation ({{args}})', () => {
    const rawArgs = 'user input';
    const escapedArgs = 'ESCAPED:user input'; // Based on the mock setup

    beforeEach(() => {
      // Update context for these tests to use specific arguments
      context.invocation!.args = rawArgs;
    });

    it('should perform raw replacement if no shell injections are present (optimization path)', async () => {
      const processor = new ShellProcessor('test-command');
      const prompt = 'The user said: {{args}}';

      const result = await processor.process(prompt, context);

      expect(result).toBe(`The user said: ${rawArgs}`);
      expect(mockShellExecute).not.toHaveBeenCalled();
      // Optimization path should avoid calling escape if no !{} is present.
      expect(mockEscapeShellArg).not.toHaveBeenCalled();
    });

    it('should perform raw replacement outside !{} blocks', async () => {
      const processor = new ShellProcessor('test-command');
      // Includes a shell injection to trigger the main logic path.
      const prompt = 'Outside: {{args}}. Inside: !{echo "hello"}';
      mockShellExecute.mockReturnValue({
        result: Promise.resolve({ ...SUCCESS_RESULT, output: 'hello' }),
      });

      const result = await processor.process(prompt, context);

      expect(result).toBe(`Outside: ${rawArgs}. Inside: hello`);
      // Escaping is pre-calculated if any !{} exists in the prompt.
      expect(mockEscapeShellArg).toHaveBeenCalledWith(rawArgs);
    });

    it('should perform escaped replacement inside !{} blocks', async () => {
      const processor = new ShellProcessor('test-command');
      const prompt = 'Command: !{grep {{args}} file.txt}';
      mockShellExecute.mockReturnValue({
        result: Promise.resolve({ ...SUCCESS_RESULT, output: 'match found' }),
      });

      const result = await processor.process(prompt, context);

      // Verify the escape utility was called
      expect(mockEscapeShellArg).toHaveBeenCalledWith(rawArgs);

      // Verify the command executed used the escaped arguments
      const expectedCommand = `grep ${escapedArgs} file.txt`;
      expect(mockShellExecute).toHaveBeenCalledWith(
        expectedCommand,
        expect.any(String),
        expect.any(Function),
        expect.any(Object),
      );

      expect(result).toBe('Command: match found');
    });

    it('should handle both raw (outside) and escaped (inside) injection simultaneously', async () => {
      const processor = new ShellProcessor('test-command');
      const prompt = 'User "({{args}})" requested search: !{search {{args}}}';
      mockShellExecute.mockReturnValue({
        result: Promise.resolve({ ...SUCCESS_RESULT, output: 'results' }),
      });

      const result = await processor.process(prompt, context);

      // Verify the command executed used the escaped arguments
      const expectedCommand = `search ${escapedArgs}`;
      expect(mockShellExecute).toHaveBeenCalledWith(
        expectedCommand,
        expect.any(String),
        expect.any(Function),
        expect.any(Object),
      );

      // Verify the final prompt used the raw arguments outside
      expect(result).toBe(`User "(${rawArgs})" requested search: results`);
    });

    it('should perform security checks on the final, resolved (escaped) command', async () => {
      const processor = new ShellProcessor('test-command');
      const prompt = '!{rm {{args}}}';

      // Configure the permission check to fail for the resolved command
      const expectedResolvedCommand = `rm ${escapedArgs}`;
      mockCheckCommandPermissions.mockReturnValue({
        allAllowed: false,
        disallowedCommands: [expectedResolvedCommand],
        isHardDenial: false, // Soft denial triggers confirmation
      });

      await expect(processor.process(prompt, context)).rejects.toThrow(
        ConfirmationRequiredError,
      );

      // Verify that the check was performed on the resolved command
      expect(mockCheckCommandPermissions).toHaveBeenCalledWith(
        expectedResolvedCommand,
        expect.any(Object),
        context.session.sessionShellAllowlist,
      );
    });

    it('should report the resolved command if a hard denial occurs', async () => {
      const processor = new ShellProcessor('test-command');
      const prompt = '!{rm {{args}}}';

      const expectedResolvedCommand = `rm ${escapedArgs}`;
      mockCheckCommandPermissions.mockReturnValue({
        allAllowed: false,
        disallowedCommands: [expectedResolvedCommand],
        isHardDenial: true, // Hard denial throws a standard Error
        blockReason: 'It is forbidden.',
      });

      // Check that the error message includes the resolved command for clarity.
      await expect(processor.process(prompt, context)).rejects.toThrow(
        `Blocked command: "${expectedResolvedCommand}". Reason: It is forbidden.`,
      );
    });
  });
});
