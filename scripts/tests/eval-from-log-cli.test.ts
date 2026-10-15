/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { parseArgs } from '../eval-from-log-cli.js';

const BASE_ARGS = ['node', 'eval-from-log-cli'];

describe('parseArgs', () => {
  it('accepts option-like values via --option=value', () => {
    const options = parseArgs([
      ...BASE_ARGS,
      '--log=session.jsonl',
      '--name=--yolo flag still asks for confirmation',
    ]);

    expect(options.log).toBe('session.jsonl');
    expect(options.name).toBe('--yolo flag still asks for confirmation');
  });

  it('splits inline options only on the first equals sign', () => {
    const options = parseArgs([...BASE_ARGS, '--suite=a=b']);

    expect(options.suite).toBe('a=b');
  });

  it('accepts repeatable options in inline form', () => {
    const options = parseArgs([
      ...BASE_ARGS,
      '--expect-tool=read_file',
      '--expect-tool=glob',
      '--fixture=src/a.ts',
      '--fixture=src/b.ts',
    ]);

    expect(options.expectedTools).toEqual(['read_file', 'glob']);
    expect(options.fixtures).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('rejects inline values for boolean flags', () => {
    expect(() => parseArgs([...BASE_ARGS, '--write=1'])).toThrow(
      '--write does not take a value.',
    );
  });

  it('rejects an empty inline value', () => {
    expect(() => parseArgs([...BASE_ARGS, '--name='])).toThrow(
      '--name requires a value.',
    );
  });

  it('keeps accepting ordinary space-separated values', () => {
    const options = parseArgs([
      ...BASE_ARGS,
      '--log',
      'session.jsonl',
      '--name',
      'reads the requested file',
    ]);

    expect(options.log).toBe('session.jsonl');
    expect(options.name).toBe('reads the requested file');
  });

  it('preserves existing space-form handling for single-dash values', () => {
    const options = parseArgs([...BASE_ARGS, '--name', '-draft']);

    expect(options.name).toBe('-draft');
  });

  it('still rejects option-like values in space-separated form', () => {
    expect(() => parseArgs([...BASE_ARGS, '--name', '--write'])).toThrow(
      '--name requires a value.',
    );
  });

  it('still rejects unknown inline options', () => {
    expect(() => parseArgs([...BASE_ARGS, '--bogus=value'])).toThrow(
      'Unknown argument: --bogus=value',
    );
  });
});
