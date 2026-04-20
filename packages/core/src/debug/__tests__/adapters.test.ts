/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  getAdapterForRuntime,
  detectRuntime,
  BUILTIN_ADAPTERS,
} from '../adapters.js';

describe('getAdapterForRuntime', () => {
  it('should return Node.js adapter', () => {
    const adapter = getAdapterForRuntime('node');
    expect(adapter).toBeDefined();
    expect(adapter?.name).toBe('Node.js');
    expect(adapter?.port).toBe(9229);
  });

  it('should return Python adapter', () => {
    const adapter = getAdapterForRuntime('python');
    expect(adapter).toBeDefined();
    expect(adapter?.name).toContain('Python');
  });

  it('should return Go adapter', () => {
    const adapter = getAdapterForRuntime('go');
    expect(adapter).toBeDefined();
    expect(adapter?.name).toContain('Delve');
  });

  it('should be case-insensitive', () => {
    expect(getAdapterForRuntime('Node')).toBeDefined();
    expect(getAdapterForRuntime('PYTHON')).toBeDefined();
  });

  it('should return undefined for unknown runtime', () => {
    expect(getAdapterForRuntime('rust')).toBeUndefined();
  });
});

describe('detectRuntime', () => {
  it('should detect Node.js from .js files', () => {
    expect(detectRuntime('app.js')).toBe('node');
    expect(detectRuntime('server.ts')).toBe('node');
    expect(detectRuntime('index.mjs')).toBe('node');
    expect(detectRuntime('module.cjs')).toBe('node');
  });

  it('should detect Python from .py files', () => {
    expect(detectRuntime('script.py')).toBe('python');
  });

  it('should detect Go from .go files', () => {
    expect(detectRuntime('main.go')).toBe('go');
  });

  it('should return undefined for unknown extensions', () => {
    expect(detectRuntime('file.rs')).toBeUndefined();
    expect(detectRuntime('file.java')).toBeUndefined();
  });
});

describe('BUILTIN_ADAPTERS', () => {
  it('should have node, python, and go', () => {
    expect(Object.keys(BUILTIN_ADAPTERS)).toContain('node');
    expect(Object.keys(BUILTIN_ADAPTERS)).toContain('python');
    expect(Object.keys(BUILTIN_ADAPTERS)).toContain('go');
  });

  it('should have launch commands for all adapters', () => {
    for (const [, config] of Object.entries(BUILTIN_ADAPTERS)) {
      expect(config.launchCommand.length).toBeGreaterThan(0);
    }
  });
});
