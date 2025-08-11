/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { loadPortableConfig } from './portable.js';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { vi, describe, it, expect } from 'vitest';

vi.mock('fs');
vi.mock('js-yaml');

describe('portable config', () => {
  it('should load and parse a valid YAML file', () => {
    const mockYaml = `
      settings:
        theme: "GitHub"
    `;
    vi.spyOn(fs, 'readFileSync').mockReturnValue(mockYaml);
    vi.spyOn(yaml, 'load').mockReturnValue({
      settings: { theme: 'GitHub' },
    });

    const config = loadPortableConfig('config.yaml');

    expect(config.settings?.theme).toBe('GitHub');
    expect(fs.readFileSync).toHaveBeenCalledWith('config.yaml', 'utf8');
    expect(yaml.load).toHaveBeenCalledWith(mockYaml);
  });

  it('should exit if the file cannot be read', () => {
    const exit = vi
      .spyOn(process, 'exit')
      .mockImplementation(() => undefined as never);
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    vi.spyOn(fs, 'readFileSync').mockImplementation(() => {
      throw new Error('File not found');
    });

    loadPortableConfig('nonexistent.yaml');

    expect(exit).toHaveBeenCalledWith(1);
    expect(consoleError).toHaveBeenCalledWith(
      'Error loading portable config file: Error: File not found',
    );
  });
});
