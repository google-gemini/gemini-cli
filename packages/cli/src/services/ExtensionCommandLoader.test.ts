/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ExtensionCommandLoader } from './ExtensionCommandLoader.js';
import { Extension } from '../config/extension.js';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { promises as fs } from 'fs';
import { glob } from 'glob';

vi.mock('fs/promises');
vi.mock('glob');

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

    vi.spyOn(fs, 'access').mockResolvedValue(undefined);
    (glob as vi.Mock).mockResolvedValue(['command1.toml']);
    vi.spyOn(fs, 'readFile').mockResolvedValue(
      'name = "test"\nprompt = "test prompt"',
    );

    const commands = await loader.loadCommands(signal);
    const action = await commands[0].action({} as never);

    expect(commands).toHaveLength(1);
    expect(commands[0].name).toBe('test');
    expect(action.type).toBe('submit_prompt');
    expect(action.content).toBe('test prompt');
    expect(commands[0].extensionName).toBe('extension1');
  });
});
