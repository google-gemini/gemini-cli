/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ExtensionCommandLoader } from './ExtensionCommandLoader.js';
import { Extension } from '../config/extension.js';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import toml from '@iarna/toml';

vi.mock('fs');
vi.mock('@iarna/toml');

describe('ExtensionCommandLoader', () => {
  const mockExtensions: Extension[] = [
    {
      path: '/path/to/extension1',
      config: { name: 'extension1', version: '1.0.0' },
      contextFiles: [],
    },
  ];

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should load commands from .toml files', async () => {
    const loader = new ExtensionCommandLoader(mockExtensions);
    const signal = new AbortController().signal;

    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readdirSync').mockReturnValue([
      'command1.toml',
    ] as fs.Dirent[]);
    vi.spyOn(fs, 'statSync').mockReturnValue({
      isDirectory: () => false,
    } as fs.Stats);
    vi.spyOn(fs, 'readFileSync').mockReturnValue(
      'name = "test"\nprompt = "test prompt"',
    );
    vi.spyOn(toml, 'parse').mockReturnValue({
      name: 'test',
      prompt: 'test prompt',
    });

    const commands = await loader.loadCommands(signal);
    const action = await commands[0].action({} as never);

    expect(commands).toHaveLength(1);
    expect(commands[0].name).toBe('test');
    expect(action.type).toBe('submit_prompt');
    expect(action.content).toBe('test prompt');
    expect(commands[0].extensionName).toBe('extension1');
  });
});
