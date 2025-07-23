/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { FileCommandLoader } from './FileCommandLoader.js';
import {
  Config,
  getProjectCommandsDir,
  getUserCommandsDir,
} from '@google/gemini-cli-core';
import mock from 'mock-fs';
import { assert } from 'vitest';
import { createMockCommandContext } from '../test-utils/mockCommandContext.js';

describe('FileCommandLoader', () => {
  const signal: AbortSignal = new AbortController().signal;

  afterEach(() => {
    mock.restore();
  });

  it('loads a single command from a file', async () => {
    const userCommandsDir = getUserCommandsDir();
    mock({
      [userCommandsDir]: {
        'test.toml': 'prompt = "This is a test prompt"',
      },
    });

    const loader = new FileCommandLoader(null as unknown as Config);
    const commands = await loader.loadCommands(signal);

    expect(commands).toHaveLength(1);
    const command = commands[0];
    expect(command).toBeDefined();
    expect(command.name).toBe('test');

    const result = await command.action?.(
      createMockCommandContext({
        invocation: {
          raw: '/test',
          name: 'test',
          args: '',
        },
      }),
      '',
    );
    if (result?.type === 'submit_prompt') {
      expect(result.content).toBe('This is a test prompt');
    } else {
      assert.fail('Incorrect action type');
    }
  });

  it('loads multiple commands', async () => {
    const userCommandsDir = getUserCommandsDir();
    mock({
      [userCommandsDir]: {
        'test1.toml': 'prompt = "Prompt 1"',
        'test2.toml': 'prompt = "Prompt 2"',
      },
    });

    const loader = new FileCommandLoader(null as unknown as Config);
    const commands = await loader.loadCommands(signal);

    expect(commands).toHaveLength(2);
  });

  it('creates deeply nested namespaces correctly', async () => {
    const userCommandsDir = getUserCommandsDir();

    mock({
      [userCommandsDir]: {
        gcp: {
          pipelines: {
            'run.toml': 'prompt = "run pipeline"',
          },
        },
      },
    });
    const loader = new FileCommandLoader({
      getProjectRoot: () => '/path/to/project',
    } as Config);
    const commands = await loader.loadCommands(signal);
    expect(commands).toHaveLength(1);
    expect(commands[0]!.name).toBe('gcp:pipelines:run');
  });

  it('creates namespaces from nested directories', async () => {
    const userCommandsDir = getUserCommandsDir();
    mock({
      [userCommandsDir]: {
        git: {
          'commit.toml': 'prompt = "git commit prompt"',
        },
      },
    });

    const loader = new FileCommandLoader(null as unknown as Config);
    const commands = await loader.loadCommands(signal);

    expect(commands).toHaveLength(1);
    const command = commands[0];
    expect(command).toBeDefined();
    expect(command.name).toBe('git:commit');
  });

  it('overrides user commands with project commands', async () => {
    const userCommandsDir = getUserCommandsDir();
    const projectCommandsDir = getProjectCommandsDir(process.cwd());
    mock({
      [userCommandsDir]: {
        'test.toml': 'prompt = "User prompt"',
      },
      [projectCommandsDir]: {
        'test.toml': 'prompt = "Project prompt"',
      },
    });

    const loader = new FileCommandLoader({
      getProjectRoot: () => process.cwd(),
    } as Config);
    const commands = await loader.loadCommands(signal);

    expect(commands).toHaveLength(1);
    const command = commands[0];
    expect(command).toBeDefined();

    const result = await command.action?.(
      createMockCommandContext({
        invocation: {
          raw: '/test',
          name: 'test',
          args: '',
        },
      }),
      '',
    );
    if (result?.type === 'submit_prompt') {
      expect(result.content).toBe('Project prompt');
    } else {
      assert.fail('Incorrect action type');
    }
  });

  it('ignores files with TOML syntax errors', async () => {
    const userCommandsDir = getUserCommandsDir();
    mock({
      [userCommandsDir]: {
        'invalid.toml': 'this is not valid toml',
        'good.toml': 'prompt = "This one is fine"',
      },
    });

    const loader = new FileCommandLoader(null as unknown as Config);
    const commands = await loader.loadCommands(signal);

    expect(commands).toHaveLength(1);
    expect(commands[0].name).toBe('good');
  });

  it('ignores files that are semantically invalid (missing prompt)', async () => {
    const userCommandsDir = getUserCommandsDir();
    mock({
      [userCommandsDir]: {
        'no_prompt.toml': 'description = "This file is missing a prompt"',
        'good.toml': 'prompt = "This one is fine"',
      },
    });

    const loader = new FileCommandLoader(null as unknown as Config);
    const commands = await loader.loadCommands(signal);

    expect(commands).toHaveLength(1);
    expect(commands[0].name).toBe('good');
  });

  it('handles filename edge cases correctly', async () => {
    const userCommandsDir = getUserCommandsDir();
    mock({
      [userCommandsDir]: {
        'test.v1.toml': 'prompt = "Test prompt"',
      },
    });

    const loader = new FileCommandLoader(null as unknown as Config);
    const commands = await loader.loadCommands(signal);
    const command = commands[0];
    expect(command).toBeDefined();
    expect(command.name).toBe('test.v1');
  });

  it('handles file system errors gracefully', async () => {
    mock({}); // Mock an empty file system
    const loader = new FileCommandLoader(null as unknown as Config);
    const commands = await loader.loadCommands(signal);
    expect(commands).toHaveLength(0);
  });

  it('uses a default description if not provided', async () => {
    const userCommandsDir = getUserCommandsDir();
    mock({
      [userCommandsDir]: {
        'test.toml': 'prompt = "Test prompt"',
      },
    });

    const loader = new FileCommandLoader(null as unknown as Config);
    const commands = await loader.loadCommands(signal);
    const command = commands[0];
    expect(command).toBeDefined();
    expect(command.description).toBe('Custom command from test.toml');
  });

  it('uses the provided description', async () => {
    const userCommandsDir = getUserCommandsDir();
    mock({
      [userCommandsDir]: {
        'test.toml': 'prompt = "Test prompt"\ndescription = "My test command"',
      },
    });

    const loader = new FileCommandLoader(null as unknown as Config);
    const commands = await loader.loadCommands(signal);
    const command = commands[0];
    expect(command).toBeDefined();
    expect(command.description).toBe('My test command');
  });

  it('should sanitize colons in filenames to prevent namespace conflicts', async () => {
    const userCommandsDir = getUserCommandsDir();
    mock({
      [userCommandsDir]: {
        'legacy:command.toml': 'prompt = "This is a legacy command"',
      },
    });

    const loader = new FileCommandLoader(null as unknown as Config);
    const commands = await loader.loadCommands(signal);

    expect(commands).toHaveLength(1);
    const command = commands[0];
    expect(command).toBeDefined();

    // Verify that the ':' in the filename was replaced with an '_'
    expect(command.name).toBe('legacy_command');
  });

  describe('Shorthand Argument Processor Integration', () => {
    it('correctly processes a command with {{args}}', async () => {
      const userCommandsDir = getUserCommandsDir();
      mock({
        [userCommandsDir]: {
          'shorthand.toml':
            'prompt = "The user wants to: {{args}}"\ndescription = "Shorthand test"',
        },
      });

      const loader = new FileCommandLoader(null as unknown as Config);
      const commands = await loader.loadCommands(signal);
      const command = commands.find((c) => c.name === 'shorthand');
      expect(command).toBeDefined();

      const result = await command!.action?.(
        createMockCommandContext({
          invocation: {
            raw: '/shorthand do something cool',
            name: 'shorthand',
            args: 'do something cool',
          },
        }),
        'do something cool',
      );
      expect(result?.type).toBe('submit_prompt');
      if (result?.type === 'submit_prompt') {
        expect(result.content).toBe('The user wants to: do something cool');
      }
    });
  });

  describe('Default Argument Processor Integration', () => {
    it('correctly processes a command without {{args}}', async () => {
      const userCommandsDir = getUserCommandsDir();
      mock({
        [userCommandsDir]: {
          'model_led.toml':
            'prompt = "This is the instruction."\ndescription = "Default processor test"',
        },
      });

      const loader = new FileCommandLoader(null as unknown as Config);
      const commands = await loader.loadCommands(signal);
      const command = commands.find((c) => c.name === 'model_led');
      expect(command).toBeDefined();

      const result = await command!.action?.(
        createMockCommandContext({
          invocation: {
            raw: '/model_led 1.2.0 added "a feature"',
            name: 'model_led',
            args: '1.2.0 added "a feature"',
          },
        }),
        '1.2.0 added "a feature"',
      );
      expect(result?.type).toBe('submit_prompt');
      if (result?.type === 'submit_prompt') {
        const expectedContent =
          'This is the instruction.\n\n/model_led 1.2.0 added "a feature"';
        expect(result.content).toBe(expectedContent);
      }
    });
  });
});
