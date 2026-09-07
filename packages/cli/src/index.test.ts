/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { parseCliFlags, getVersionText, getHelpText, VERSION } from './index.js';

describe('CLI Argument Parser & Help', () => {
  it('parses version flags (-v, --version)', () => {
    expect(parseCliFlags(['-v']).version).toBe(true);
    expect(parseCliFlags(['--version']).version).toBe(true);
    expect(parseCliFlags([]).version).toBe(false);
  });

  it('parses help flags (-h, --help)', () => {
    expect(parseCliFlags(['-h']).help).toBe(true);
    expect(parseCliFlags(['--help']).help).toBe(true);
    expect(parseCliFlags([]).help).toBe(false);
  });

  it('parses model arguments (-m, --model, --model=)', () => {
    expect(parseCliFlags(['-m', 'llama3.2']).model).toBe('llama3.2');
    expect(parseCliFlags(['--model', 'mistral']).model).toBe('mistral');
    expect(parseCliFlags(['--model=qwen2.5']).model).toBe('qwen2.5');
    expect(parseCliFlags([]).model).toBeUndefined();
  });

  it('rejects missing model values and unknown arguments', () => {
    expect(() => parseCliFlags(['--model'])).toThrow('--model requires a model name.');
    expect(() => parseCliFlags(['--model='])).toThrow('--model requires a model name.');
    expect(() => parseCliFlags(['--unknown'])).toThrow('Unknown argument: --unknown');
  });

  it('returns formatted version string', () => {
    const versionText = getVersionText();
    expect(versionText).toBe(`zoe v${VERSION}`);
    expect(versionText).toContain('0.1.0');
  });

  it('returns comprehensive help text with commands', () => {
    const helpText = getHelpText();
    expect(helpText).toContain('Socratic terminal coding mentor.');
    expect(helpText).toContain('-v, --version');
    expect(helpText).toContain('-h, --help');
    expect(helpText).toContain('-m, --model');
    expect(helpText).toContain('/learn');
    expect(helpText).toContain('/ponytail');
    expect(helpText).toContain('/archify');
    expect(helpText).toContain('/knowledge');
    expect(helpText).toContain('/challenge');
    expect(helpText).toContain('/symbols');
    expect(helpText).toContain('/find');
    expect(helpText).toContain('/clear');
    expect(helpText).toContain('/exit');
  });
});
