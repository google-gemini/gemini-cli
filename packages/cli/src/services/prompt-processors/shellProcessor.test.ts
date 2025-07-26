/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

const mockIsCommandAllowed = vi.hoisted(() => vi.fn());
const mockShellExecute = vi.hoisted(() => vi.fn());

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const original = await importOriginal<object>();
  return {
    ...original,
    isCommandAllowed: mockIsCommandAllowed,
    ShellExecutionService: {
      execute: mockShellExecute,
    },
  };
});

import { ShellProcessor } from './shellProcessor.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { CommandContext } from '../../ui/commands/types.js';
import { Config } from '@google/gemini-cli-core';

describe('ShellProcessor', () => {
  let context: CommandContext;
  let mockConfig: Partial<Config>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create a mock config object
    mockConfig = {
      getTargetDir: vi.fn().mockReturnValue('/test/dir'),
    };

    // Pass the mock config to the context
    context = createMockCommandContext({
      services: {
        config: mockConfig as Config,
      },
    });

    // Default mock implementations
    mockShellExecute.mockReturnValue({
      result: Promise.resolve({
        output: 'default shell output',
      }),
    });
    mockIsCommandAllowed.mockReturnValue({ allowed: true });
  });

  it('should not change the prompt if no shell injections are present', async () => {
    const processor = new ShellProcessor([], 'test-command');
    const prompt = 'This is a simple prompt with no injections.';
    const result = await processor.process(prompt, context);
    expect(result).toBe(prompt);
    expect(mockShellExecute).not.toHaveBeenCalled();
  });

  it('should process a single valid shell injection', async () => {
    const processor = new ShellProcessor(['git status'], 'test-command');
    const prompt = 'The current status is: !{git status}';
    mockShellExecute.mockReturnValue({
      result: Promise.resolve({ output: 'On branch main' }),
    });

    const result = await processor.process(prompt, context);

    expect(mockIsCommandAllowed).toHaveBeenCalledWith(
      'git status',
      expect.any(Object),
      ['git status'],
    );
    expect(mockShellExecute).toHaveBeenCalledWith(
      'git status',
      expect.any(String),
      expect.any(Function),
      expect.any(Object),
    );
    expect(result).toBe('The current status is: On branch main');
  });

  it('should process multiple valid shell injections', async () => {
    const processor = new ShellProcessor(['git status', 'pwd'], 'test-command');
    const prompt = '!{git status} in !{pwd}';

    // Set up different return values for each call
    mockShellExecute
      .mockReturnValueOnce({
        result: Promise.resolve({ output: 'On branch main' }),
      })
      .mockReturnValueOnce({
        result: Promise.resolve({ output: '/usr/home' }),
      });

    const result = await processor.process(prompt, context);

    expect(mockShellExecute).toHaveBeenCalledTimes(2);
    expect(mockShellExecute).toHaveBeenCalledWith(
      'git status',
      expect.any(String),
      expect.any(Function),
      expect.any(Object),
    );
    expect(mockShellExecute).toHaveBeenCalledWith(
      'pwd',
      expect.any(String),
      expect.any(Function),
      expect.any(Object),
    );
    expect(result).toBe('On branch main in /usr/home');
  });

  it('should throw an error if a command is not allowed', async () => {
    const processor = new ShellProcessor([], 'test-command');
    const prompt = 'Do something dangerous: !{rm -rf /}';
    mockIsCommandAllowed.mockReturnValue({
      allowed: false,
      reason: 'Command is not in the allowlist.',
    });

    await expect(processor.process(prompt, context)).rejects.toThrow(
      'Shell command "rm -rf /" in custom command "test-command" is not allowed. Reason: Command is not in the allowlist.',
    );

    expect(mockShellExecute).not.toHaveBeenCalled();
  });

  it('should trim whitespace from the command inside the injection', async () => {
    const processor = new ShellProcessor(['ls -l'], 'test-command');
    const prompt = 'Files: !{  ls -l  }';
    mockShellExecute.mockReturnValue({
      result: Promise.resolve({ output: 'total 0' }),
    });

    await processor.process(prompt, context);

    expect(mockIsCommandAllowed).toHaveBeenCalledWith(
      'ls -l',
      expect.any(Object),
      ['ls -l'],
    );
    expect(mockShellExecute).toHaveBeenCalledWith(
      'ls -l',
      expect.any(String),
      expect.any(Function),
      expect.any(Object),
    );
  });

  it('should handle an empty command inside the injection gracefully', async () => {
    const processor = new ShellProcessor([], 'test-command');
    const prompt = 'This is weird: !{}';
    mockIsCommandAllowed.mockReturnValue({ allowed: true });
    mockShellExecute.mockReturnValue({
      result: Promise.resolve({ output: 'empty output' }),
    });

    const result = await processor.process(prompt, context);

    expect(mockIsCommandAllowed).toHaveBeenCalledWith(
      '',
      expect.any(Object),
      [],
    );
    expect(mockShellExecute).toHaveBeenCalledWith(
      '',
      expect.any(String),
      expect.any(Function),
      expect.any(Object),
    );
    expect(result).toBe('This is weird: empty output');
  });

  it('should halt execution on the first disallowed command in a series', async () => {
    const processor = new ShellProcessor(['echo "hello"'], 'test-command');
    const prompt = 'First: !{echo "hello"}, Second: !{rm -rf /}';

    mockIsCommandAllowed
      .mockImplementationOnce(() => ({ allowed: true }))
      .mockImplementationOnce(() => ({
        allowed: false,
        reason: 'Disallowed',
      }));

    mockShellExecute.mockReturnValue({
      result: Promise.resolve({ output: 'hello' }),
    });

    await expect(processor.process(prompt, context)).rejects.toThrow(
      'Shell command "rm -rf /" in custom command "test-command" is not allowed. Reason: Disallowed',
    );

    // Ensure the first command was executed, but the second was not.
    expect(mockShellExecute).toHaveBeenCalledOnce();
    expect(mockShellExecute).toHaveBeenCalledWith(
      'echo "hello"',
      expect.any(String),
      expect.any(Function),
      expect.any(Object),
    );
  });
});
