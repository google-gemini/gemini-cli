/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'node:path';
import { Config, Storage } from '@google/gemini-cli-core';
import mock from 'mock-fs';
import { FileCommandLoader } from './FileCommandLoader.js';
import { assert, vi } from 'vitest';
import { createMockCommandContext } from '../test-utils/mockCommandContext.js';
import {
  SHELL_INJECTION_TRIGGER,
  SHORTHAND_ARGS_PLACEHOLDER,
} from './prompt-processors/types.js';
import {
  ConfirmationRequiredError,
  ShellProcessor,
} from './prompt-processors/shellProcessor.js';
import { DefaultArgumentProcessor } from './prompt-processors/argumentProcessor.js';
import { CommandContext } from '../ui/commands/types.js';

const mockShellProcess = vi.hoisted(() => vi.fn());
vi.mock('./prompt-processors/shellProcessor.js', () => ({
  ShellProcessor: vi.fn().mockImplementation(() => ({
    process: mockShellProcess,
  })),
  ConfirmationRequiredError: class extends Error {
    constructor(
      message: string,
      public commandsToConfirm: string[],
    ) {
      super(message);
      this.name = 'ConfirmationRequiredError';
    }
  },
}));

vi.mock('./prompt-processors/argumentProcessor.js', async (importOriginal) => {
  const original =
    await importOriginal<
      typeof import('./prompt-processors/argumentProcessor.js')
    >();
  return {
    DefaultArgumentProcessor: vi
      .fn()
      .mockImplementation(() => new original.DefaultArgumentProcessor()),
  };
});
vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...original,
    Storage: original.Storage,
    isCommandAllowed: vi.fn(),
    ShellExecutionService: {
      execute: vi.fn(),
    },
  };
});

describe('FileCommandLoader', () => {
  const signal: AbortSignal = new AbortController().signal;

  beforeEach(() => {
    vi.clearAllMocks();
    mockShellProcess.mockImplementation(
      (prompt: string, context: CommandContext) => {
        const userArgsRaw = context?.invocation?.args || '';
        const processedPrompt = prompt.replaceAll(
          SHORTHAND_ARGS_PLACEHOLDER,
          userArgsRaw,
        );
        return Promise.resolve(processedPrompt);
      },
    );
  });

  afterEach(() => {
    mock.restore();
  });

  it('loads a single command from a file', async () => {
    const userCommandsDir = Storage.getUserCommandsDir();
    mock({
      [userCommandsDir]: {
        'test.toml': 'prompt = "This is a test prompt"',
      },
    });

    const loader = new FileCommandLoader(null);
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

  // Symlink creation on Windows requires special permissions that are not
  // available in the standard CI environment. Therefore, we skip these tests
  // on Windows to prevent CI failures. The core functionality is still
  // validated on Linux and macOS.
  const itif = (condition: boolean) => (condition ? it : it.skip);

  itif(process.platform !== 'win32')(
    'loads commands from a symlinked directory',
    async () => {
      const userCommandsDir = Storage.getUserCommandsDir();
      const realCommandsDir = '/real/commands';
      mock({
        [realCommandsDir]: {
          'test.toml': 'prompt = "This is a test prompt"',
        },
        // Symlink the user commands directory to the real one
        [userCommandsDir]: mock.symlink({
          path: realCommandsDir,
        }),
      });

      const loader = new FileCommandLoader(null as unknown as Config);
      const commands = await loader.loadCommands(signal);

      expect(commands).toHaveLength(1);
      const command = commands[0];
      expect(command).toBeDefined();
      expect(command.name).toBe('test');
    },
  );

  itif(process.platform !== 'win32')(
    'loads commands from a symlinked subdirectory',
    async () => {
      const userCommandsDir = Storage.getUserCommandsDir();
      const realNamespacedDir = '/real/namespaced-commands';
      mock({
        [userCommandsDir]: {
          namespaced: mock.symlink({
            path: realNamespacedDir,
          }),
        },
        [realNamespacedDir]: {
          'my-test.toml': 'prompt = "This is a test prompt"',
        },
      });

      const loader = new FileCommandLoader(null as unknown as Config);
      const commands = await loader.loadCommands(signal);

      expect(commands).toHaveLength(1);
      const command = commands[0];
      expect(command).toBeDefined();
      expect(command.name).toBe('namespaced:my-test');
    },
  );

  it('loads multiple commands', async () => {
    const userCommandsDir = Storage.getUserCommandsDir();
    mock({
      [userCommandsDir]: {
        'test1.toml': 'prompt = "Prompt 1"',
        'test2.toml': 'prompt = "Prompt 2"',
      },
    });

    const loader = new FileCommandLoader(null);
    const commands = await loader.loadCommands(signal);

    expect(commands).toHaveLength(2);
  });

  it('creates deeply nested namespaces correctly', async () => {
    const userCommandsDir = Storage.getUserCommandsDir();

    mock({
      [userCommandsDir]: {
        gcp: {
          pipelines: {
            'run.toml': 'prompt = "run pipeline"',
          },
        },
      },
    });
    const mockConfig = {
      getProjectRoot: vi.fn(() => '/path/to/project'),
      getExtensions: vi.fn(() => []),
    } as Config;
    const loader = new FileCommandLoader(mockConfig);
    const commands = await loader.loadCommands(signal);
    expect(commands).toHaveLength(1);
    expect(commands[0]!.name).toBe('gcp:pipelines:run');
  });

  it('creates namespaces from nested directories', async () => {
    const userCommandsDir = Storage.getUserCommandsDir();
    mock({
      [userCommandsDir]: {
        git: {
          'commit.toml': 'prompt = "git commit prompt"',
        },
      },
    });

    const loader = new FileCommandLoader(null);
    const commands = await loader.loadCommands(signal);

    expect(commands).toHaveLength(1);
    const command = commands[0];
    expect(command).toBeDefined();
    expect(command.name).toBe('git:commit');
  });

  it('returns both user and project commands in order', async () => {
    const userCommandsDir = Storage.getUserCommandsDir();
    const projectCommandsDir = new Storage(
      process.cwd(),
    ).getProjectCommandsDir();
    mock({
      [userCommandsDir]: {
        'test.toml': 'prompt = "User prompt"',
      },
      [projectCommandsDir]: {
        'test.toml': 'prompt = "Project prompt"',
      },
    });

    const mockConfig = {
      getProjectRoot: vi.fn(() => process.cwd()),
      getExtensions: vi.fn(() => []),
    } as Config;
    const loader = new FileCommandLoader(mockConfig);
    const commands = await loader.loadCommands(signal);

    expect(commands).toHaveLength(2);
    const userResult = await commands[0].action?.(
      createMockCommandContext({
        invocation: {
          raw: '/test',
          name: 'test',
          args: '',
        },
      }),
      '',
    );
    if (userResult?.type === 'submit_prompt') {
      expect(userResult.content).toBe('User prompt');
    } else {
      assert.fail('Incorrect action type for user command');
    }
    const projectResult = await commands[1].action?.(
      createMockCommandContext({
        invocation: {
          raw: '/test',
          name: 'test',
          args: '',
        },
      }),
      '',
    );
    if (projectResult?.type === 'submit_prompt') {
      expect(projectResult.content).toBe('Project prompt');
    } else {
      assert.fail('Incorrect action type for project command');
    }
  });

  it('ignores files with TOML syntax errors', async () => {
    const userCommandsDir = Storage.getUserCommandsDir();
    mock({
      [userCommandsDir]: {
        'invalid.toml': 'this is not valid toml',
        'good.toml': 'prompt = "This one is fine"',
      },
    });

    const loader = new FileCommandLoader(null);
    const commands = await loader.loadCommands(signal);

    expect(commands).toHaveLength(1);
    expect(commands[0].name).toBe('good');
  });

  it('ignores files that are semantically invalid (missing prompt)', async () => {
    const userCommandsDir = Storage.getUserCommandsDir();
    mock({
      [userCommandsDir]: {
        'no_prompt.toml': 'description = "This file is missing a prompt"',
        'good.toml': 'prompt = "This one is fine"',
      },
    });

    const loader = new FileCommandLoader(null);
    const commands = await loader.loadCommands(signal);

    expect(commands).toHaveLength(1);
    expect(commands[0].name).toBe('good');
  });

  it('handles filename edge cases correctly', async () => {
    const userCommandsDir = Storage.getUserCommandsDir();
    mock({
      [userCommandsDir]: {
        'test.v1.toml': 'prompt = "Test prompt"',
      },
    });

    const loader = new FileCommandLoader(null);
    const commands = await loader.loadCommands(signal);
    const command = commands[0];
    expect(command).toBeDefined();
    expect(command.name).toBe('test.v1');
  });

  it('handles file system errors gracefully', async () => {
    mock({}); // Mock an empty file system
    const loader = new FileCommandLoader(null);
    const commands = await loader.loadCommands(signal);
    expect(commands).toHaveLength(0);
  });

  it('uses a default description if not provided', async () => {
    const userCommandsDir = Storage.getUserCommandsDir();
    mock({
      [userCommandsDir]: {
        'test.toml': 'prompt = "Test prompt"',
      },
    });

    const loader = new FileCommandLoader(null);
    const commands = await loader.loadCommands(signal);
    const command = commands[0];
    expect(command).toBeDefined();
    expect(command.description).toBe('Custom command from test.toml');
  });

  it('uses the provided description', async () => {
    const userCommandsDir = Storage.getUserCommandsDir();
    mock({
      [userCommandsDir]: {
        'test.toml': 'prompt = "Test prompt"\ndescription = "My test command"',
      },
    });

    const loader = new FileCommandLoader(null);
    const commands = await loader.loadCommands(signal);
    const command = commands[0];
    expect(command).toBeDefined();
    expect(command.description).toBe('My test command');
  });

  it('should sanitize colons in filenames to prevent namespace conflicts', async () => {
    const userCommandsDir = Storage.getUserCommandsDir();
    mock({
      [userCommandsDir]: {
        'legacy:command.toml': 'prompt = "This is a legacy command"',
      },
    });

    const loader = new FileCommandLoader(null);
    const commands = await loader.loadCommands(signal);

    expect(commands).toHaveLength(1);
    const command = commands[0];
    expect(command).toBeDefined();

    // Verify that the ':' in the filename was replaced with an '_'
    expect(command.name).toBe('legacy_command');
  });

  describe('Processor Instantiation Logic', () => {
    it('instantiates only DefaultArgumentProcessor if no {{args}} or !{} are present', async () => {
      const userCommandsDir = Storage.getUserCommandsDir();
      mock({
        [userCommandsDir]: {
          'simple.toml': `prompt = "Just a regular prompt"`,
        },
      });

      const loader = new FileCommandLoader(null as unknown as Config);
      await loader.loadCommands(signal);

      expect(ShellProcessor).not.toHaveBeenCalled();
      expect(DefaultArgumentProcessor).toHaveBeenCalledTimes(1);
    });

    it('instantiates only ShellProcessor if {{args}} is present (but not !{})', async () => {
      const userCommandsDir = Storage.getUserCommandsDir();
      mock({
        [userCommandsDir]: {
          'args.toml': `prompt = "Prompt with {{args}}"`,
        },
      });

      const loader = new FileCommandLoader(null as unknown as Config);
      await loader.loadCommands(signal);

      expect(ShellProcessor).toHaveBeenCalledTimes(1);
      expect(DefaultArgumentProcessor).not.toHaveBeenCalled();
    });

    it('instantiates ShellProcessor and DefaultArgumentProcessor if !{} is present (but not {{args}})', async () => {
      const userCommandsDir = Storage.getUserCommandsDir();
      mock({
        [userCommandsDir]: {
          'shell.toml': `prompt = "Prompt with !{cmd}"`,
        },
      });

      const loader = new FileCommandLoader(null as unknown as Config);
      await loader.loadCommands(signal);

      expect(ShellProcessor).toHaveBeenCalledTimes(1);
      expect(DefaultArgumentProcessor).toHaveBeenCalledTimes(1);
    });

    it('instantiates only ShellProcessor if both {{args}} and !{} are present', async () => {
      const userCommandsDir = Storage.getUserCommandsDir();
      mock({
        [userCommandsDir]: {
          'both.toml': `prompt = "Prompt with {{args}} and !{cmd}"`,
        },
      });

      const loader = new FileCommandLoader(null as unknown as Config);
      await loader.loadCommands(signal);

      expect(ShellProcessor).toHaveBeenCalledTimes(1);
      expect(DefaultArgumentProcessor).not.toHaveBeenCalled();
    });
  });

  describe('Extension Command Loading', () => {
    it('loads commands from active extensions', async () => {
      const userCommandsDir = Storage.getUserCommandsDir();
      const projectCommandsDir = new Storage(
        process.cwd(),
      ).getProjectCommandsDir();
      const extensionDir = path.join(
        process.cwd(),
        '.gemini/extensions/test-ext',
      );

      mock({
        [userCommandsDir]: {
          'user.toml': 'prompt = "User command"',
        },
        [projectCommandsDir]: {
          'project.toml': 'prompt = "Project command"',
        },
        [extensionDir]: {
          'gemini-extension.json': JSON.stringify({
            name: 'test-ext',
            version: '1.0.0',
          }),
          commands: {
            'ext.toml': 'prompt = "Extension command"',
          },
        },
      });

      const mockConfig = {
        getProjectRoot: vi.fn(() => process.cwd()),
        getExtensions: vi.fn(() => [
          {
            name: 'test-ext',
            version: '1.0.0',
            isActive: true,
            path: extensionDir,
          },
        ]),
      } as Config;
      const loader = new FileCommandLoader(mockConfig);
      const commands = await loader.loadCommands(signal);

      expect(commands).toHaveLength(3);
      const commandNames = commands.map((cmd) => cmd.name);
      expect(commandNames).toEqual(['user', 'project', 'ext']);

      const extCommand = commands.find((cmd) => cmd.name === 'ext');
      expect(extCommand?.extensionName).toBe('test-ext');
      expect(extCommand?.description).toMatch(/^\[test-ext\]/);
    });

    it('extension commands have extensionName metadata for conflict resolution', async () => {
      const userCommandsDir = Storage.getUserCommandsDir();
      const projectCommandsDir = new Storage(
        process.cwd(),
      ).getProjectCommandsDir();
      const extensionDir = path.join(
        process.cwd(),
        '.gemini/extensions/test-ext',
      );

      mock({
        [extensionDir]: {
          'gemini-extension.json': JSON.stringify({
            name: 'test-ext',
            version: '1.0.0',
          }),
          commands: {
            'deploy.toml': 'prompt = "Extension deploy command"',
          },
        },
        [userCommandsDir]: {
          'deploy.toml': 'prompt = "User deploy command"',
        },
        [projectCommandsDir]: {
          'deploy.toml': 'prompt = "Project deploy command"',
        },
      });

      const mockConfig = {
        getProjectRoot: vi.fn(() => process.cwd()),
        getExtensions: vi.fn(() => [
          {
            name: 'test-ext',
            version: '1.0.0',
            isActive: true,
            path: extensionDir,
          },
        ]),
      } as Config;
      const loader = new FileCommandLoader(mockConfig);
      const commands = await loader.loadCommands(signal);

      // Return all commands, even duplicates
      expect(commands).toHaveLength(3);

      expect(commands[0].name).toBe('deploy');
      expect(commands[0].extensionName).toBeUndefined();
      const result0 = await commands[0].action?.(
        createMockCommandContext({
          invocation: {
            raw: '/deploy',
            name: 'deploy',
            args: '',
          },
        }),
        '',
      );
      expect(result0?.type).toBe('submit_prompt');
      if (result0?.type === 'submit_prompt') {
        expect(result0.content).toBe('User deploy command');
      }

      expect(commands[1].name).toBe('deploy');
      expect(commands[1].extensionName).toBeUndefined();
      const result1 = await commands[1].action?.(
        createMockCommandContext({
          invocation: {
            raw: '/deploy',
            name: 'deploy',
            args: '',
          },
        }),
        '',
      );
      expect(result1?.type).toBe('submit_prompt');
      if (result1?.type === 'submit_prompt') {
        expect(result1.content).toBe('Project deploy command');
      }

      expect(commands[2].name).toBe('deploy');
      expect(commands[2].extensionName).toBe('test-ext');
      expect(commands[2].description).toMatch(/^\[test-ext\]/);
      const result2 = await commands[2].action?.(
        createMockCommandContext({
          invocation: {
            raw: '/deploy',
            name: 'deploy',
            args: '',
          },
        }),
        '',
      );
      expect(result2?.type).toBe('submit_prompt');
      if (result2?.type === 'submit_prompt') {
        expect(result2.content).toBe('Extension deploy command');
      }
    });

    it('only loads commands from active extensions', async () => {
      const extensionDir1 = path.join(
        process.cwd(),
        '.gemini/extensions/active-ext',
      );
      const extensionDir2 = path.join(
        process.cwd(),
        '.gemini/extensions/inactive-ext',
      );

      mock({
        [extensionDir1]: {
          'gemini-extension.json': JSON.stringify({
            name: 'active-ext',
            version: '1.0.0',
          }),
          commands: {
            'active.toml': 'prompt = "Active extension command"',
          },
        },
        [extensionDir2]: {
          'gemini-extension.json': JSON.stringify({
            name: 'inactive-ext',
            version: '1.0.0',
          }),
          commands: {
            'inactive.toml': 'prompt = "Inactive extension command"',
          },
        },
      });

      const mockConfig = {
        getProjectRoot: vi.fn(() => process.cwd()),
        getExtensions: vi.fn(() => [
          {
            name: 'active-ext',
            version: '1.0.0',
            isActive: true,
            path: extensionDir1,
          },
          {
            name: 'inactive-ext',
            version: '1.0.0',
            isActive: false,
            path: extensionDir2,
          },
        ]),
      } as Config;
      const loader = new FileCommandLoader(mockConfig);
      const commands = await loader.loadCommands(signal);

      expect(commands).toHaveLength(1);
      expect(commands[0].name).toBe('active');
      expect(commands[0].extensionName).toBe('active-ext');
      expect(commands[0].description).toMatch(/^\[active-ext\]/);
    });

    it('handles missing extension commands directory gracefully', async () => {
      const extensionDir = path.join(
        process.cwd(),
        '.gemini/extensions/no-commands',
      );

      mock({
        [extensionDir]: {
          'gemini-extension.json': JSON.stringify({
            name: 'no-commands',
            version: '1.0.0',
          }),
          // No commands directory
        },
      });

      const mockConfig = {
        getProjectRoot: vi.fn(() => process.cwd()),
        getExtensions: vi.fn(() => [
          {
            name: 'no-commands',
            version: '1.0.0',
            isActive: true,
            path: extensionDir,
          },
        ]),
      } as Config;
      const loader = new FileCommandLoader(mockConfig);
      const commands = await loader.loadCommands(signal);
      expect(commands).toHaveLength(0);
    });

    it('handles nested command structure in extensions', async () => {
      const extensionDir = path.join(process.cwd(), '.gemini/extensions/a');

      mock({
        [extensionDir]: {
          'gemini-extension.json': JSON.stringify({
            name: 'a',
            version: '1.0.0',
          }),
          commands: {
            b: {
              'c.toml': 'prompt = "Nested command from extension a"',
              d: {
                'e.toml': 'prompt = "Deeply nested command"',
              },
            },
            'simple.toml': 'prompt = "Simple command"',
          },
        },
      });

      const mockConfig = {
        getProjectRoot: vi.fn(() => process.cwd()),
        getExtensions: vi.fn(() => [
          { name: 'a', version: '1.0.0', isActive: true, path: extensionDir },
        ]),
      } as Config;
      const loader = new FileCommandLoader(mockConfig);
      const commands = await loader.loadCommands(signal);

      expect(commands).toHaveLength(3);

      const commandNames = commands.map((cmd) => cmd.name).sort();
      expect(commandNames).toEqual(['b:c', 'b:d:e', 'simple']);

      const nestedCmd = commands.find((cmd) => cmd.name === 'b:c');
      expect(nestedCmd?.extensionName).toBe('a');
      expect(nestedCmd?.description).toMatch(/^\[a\]/);
      expect(nestedCmd).toBeDefined();
      const result = await nestedCmd!.action?.(
        createMockCommandContext({
          invocation: {
            raw: '/b:c',
            name: 'b:c',
            args: '',
          },
        }),
        '',
      );
      if (result?.type === 'submit_prompt') {
        expect(result.content).toBe('Nested command from extension a');
      } else {
        assert.fail('Incorrect action type');
      }
    });
  });

  describe('Argument Handling Integration (via ShellProcessor)', () => {
    it('correctly processes a command with {{args}}', async () => {
      const userCommandsDir = Storage.getUserCommandsDir();
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
      const userCommandsDir = Storage.getUserCommandsDir();
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

  describe('Shell Processor Integration', () => {
    it('instantiates ShellProcessor if {{args}} is present (even without shell trigger)', async () => {
      const userCommandsDir = Storage.getUserCommandsDir();
      mock({
        [userCommandsDir]: {
          'args_only.toml': `prompt = "Hello {{args}}"`,
        },
      });

      const loader = new FileCommandLoader(null as unknown as Config);
      await loader.loadCommands(signal);

      expect(ShellProcessor).toHaveBeenCalledWith('args_only');
    });
    it('instantiates ShellProcessor if the trigger is present', async () => {
      const userCommandsDir = Storage.getUserCommandsDir();
      mock({
        [userCommandsDir]: {
          'shell.toml': `prompt = "Run this: ${SHELL_INJECTION_TRIGGER}echo hello}"`,
        },
      });

      const loader = new FileCommandLoader(null as unknown as Config);
      await loader.loadCommands(signal);

      expect(ShellProcessor).toHaveBeenCalledWith('shell');
    });

    it('does not instantiate ShellProcessor if no triggers ({{args}} or !{}) are present', async () => {
      const userCommandsDir = Storage.getUserCommandsDir();
      mock({
        [userCommandsDir]: {
          'regular.toml': `prompt = "Just a regular prompt"`,
        },
      });

      const loader = new FileCommandLoader(null as unknown as Config);
      await loader.loadCommands(signal);

      expect(ShellProcessor).not.toHaveBeenCalled();
    });

    it('returns a "submit_prompt" action if shell processing succeeds', async () => {
      const userCommandsDir = Storage.getUserCommandsDir();
      mock({
        [userCommandsDir]: {
          'shell.toml': `prompt = "Run !{echo 'hello'}"`,
        },
      });
      mockShellProcess.mockResolvedValue('Run hello');

      const loader = new FileCommandLoader(null as unknown as Config);
      const commands = await loader.loadCommands(signal);
      const command = commands.find((c) => c.name === 'shell');
      expect(command).toBeDefined();

      const result = await command!.action!(
        createMockCommandContext({
          invocation: { raw: '/shell', name: 'shell', args: '' },
        }),
        '',
      );

      expect(result?.type).toBe('submit_prompt');
      if (result?.type === 'submit_prompt') {
        expect(result.content).toBe('Run hello');
      }
    });

    it('returns a "confirm_shell_commands" action if shell processing requires it', async () => {
      const userCommandsDir = Storage.getUserCommandsDir();
      const rawInvocation = '/shell rm -rf /';
      mock({
        [userCommandsDir]: {
          'shell.toml': `prompt = "Run !{rm -rf /}"`,
        },
      });

      // Mock the processor to throw the specific error
      const error = new ConfirmationRequiredError('Confirmation needed', [
        'rm -rf /',
      ]);
      mockShellProcess.mockRejectedValue(error);

      const loader = new FileCommandLoader(null as unknown as Config);
      const commands = await loader.loadCommands(signal);
      const command = commands.find((c) => c.name === 'shell');
      expect(command).toBeDefined();

      const result = await command!.action!(
        createMockCommandContext({
          invocation: { raw: rawInvocation, name: 'shell', args: 'rm -rf /' },
        }),
        'rm -rf /',
      );

      expect(result?.type).toBe('confirm_shell_commands');
      if (result?.type === 'confirm_shell_commands') {
        expect(result.commandsToConfirm).toEqual(['rm -rf /']);
        expect(result.originalInvocation.raw).toBe(rawInvocation);
      }
    });

    it('re-throws other errors from the processor', async () => {
      const userCommandsDir = Storage.getUserCommandsDir();
      mock({
        [userCommandsDir]: {
          'shell.toml': `prompt = "Run !{something}"`,
        },
      });

      const genericError = new Error('Something else went wrong');
      mockShellProcess.mockRejectedValue(genericError);

      const loader = new FileCommandLoader(null as unknown as Config);
      const commands = await loader.loadCommands(signal);
      const command = commands.find((c) => c.name === 'shell');
      expect(command).toBeDefined();

      await expect(
        command!.action!(
          createMockCommandContext({
            invocation: { raw: '/shell', name: 'shell', args: '' },
          }),
          '',
        ),
      ).rejects.toThrow('Something else went wrong');
    });
    it('assembles the processor pipeline in the correct order (Shell -> Default)', async () => {
      const userCommandsDir = Storage.getUserCommandsDir();
      mock({
        [userCommandsDir]: {
          // This prompt uses !{} but NOT {{args}}, so both processors should be active.
          'pipeline.toml': `
              prompt = "Shell says: ${SHELL_INJECTION_TRIGGER}echo foo}."
            `,
        },
      });

      const defaultProcessMock = vi
        .fn()
        .mockImplementation((p) => Promise.resolve(`${p}-default-processed`));

      mockShellProcess.mockImplementation((p) =>
        Promise.resolve(`${p}-shell-processed`),
      );

      vi.mocked(DefaultArgumentProcessor).mockImplementation(
        () =>
          ({
            process: defaultProcessMock,
          }) as unknown as DefaultArgumentProcessor,
      );

      const loader = new FileCommandLoader(null as unknown as Config);
      const commands = await loader.loadCommands(signal);
      const command = commands.find((c) => c.name === 'pipeline');
      expect(command).toBeDefined();

      const result = await command!.action!(
        createMockCommandContext({
          invocation: {
            raw: '/pipeline bar',
            name: 'pipeline',
            args: 'bar',
          },
        }),
        'bar',
      );

      expect(mockShellProcess.mock.invocationCallOrder[0]).toBeLessThan(
        defaultProcessMock.mock.invocationCallOrder[0],
      );

      // Verify the flow of the prompt through the processors
      // 1. Shell processor runs first
      expect(mockShellProcess).toHaveBeenCalledWith(
        expect.stringContaining(SHELL_INJECTION_TRIGGER),
        expect.any(Object),
      );
      // 2. Default processor runs second
      expect(defaultProcessMock).toHaveBeenCalledWith(
        expect.stringContaining('-shell-processed'),
        expect.any(Object),
      );

      if (result?.type === 'submit_prompt') {
        expect(result.content).toContain('-shell-processed-default-processed');
      } else {
        assert.fail('Incorrect action type');
      }
    });
  });
});
