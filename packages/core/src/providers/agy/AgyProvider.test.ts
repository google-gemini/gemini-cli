/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AgyProvider } from './AgyProvider.js';

describe('AgyProvider', () => {
  it('initializes with agy defaults', () => {
    const provider = new AgyProvider();
    expect(provider.name).toBe('agy');
  });

  it('accepts custom binary path and default model', () => {
    const provider = new AgyProvider({
      binaryPath: '/custom/path/to/agy',
      defaultModel: 'claude-sonnet-4-6',
    });
    expect(provider.name).toBe('agy');
  });

  it('passes the conversation as the print argument', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zoe-agy-'));
    try {
      const binary = path.join(dir, 'agy');
      fs.writeFileSync(binary, `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.writeFileSync(${JSON.stringify(path.join(dir, 'args.json'))}, JSON.stringify(args));
const prompt = args[args.indexOf('--print') + 1];
fs.writeSync(1, JSON.stringify({event:'result', result:{status:'SUCCESS',response:prompt}}));
`, { mode: 0o755 });
      const provider = new AgyProvider({ binaryPath: binary });
      const events = [];
      for await (const event of provider.chat({ messages: [{ role: 'user', content: 'Explain hash tables' }] })) {
        events.push(event);
      }
      const args = JSON.parse(fs.readFileSync(path.join(dir, 'args.json'), 'utf8'));
      expect(args[args.indexOf('--print') + 1]).toContain('Explain hash tables');
      expect(args[args.indexOf('--mode') + 1]).toBe('plan');
      expect(events).toContainEqual({ type: 'complete', fullText: args[args.indexOf('--print') + 1] });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it.each(['CANCELED', 'ERROR', 'SUCCESS'])('reports %s responses without text as errors', async (status) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zoe-agy-error-'));
    try {
      const binary = path.join(dir, 'agy.cjs');
      const result = JSON.stringify({ event: 'result', result: { status, response: '' } });
      fs.writeFileSync(binary, `#!/usr/bin/env node
require('node:fs').writeSync(1, ${JSON.stringify(result)});
`, { mode: 0o755 });
      const events = [];
      for await (const event of new AgyProvider({ binaryPath: binary }).chat({ messages: [] })) {
        events.push(event);
      }
      expect(events.some(event => event.type === 'error')).toBe(true);
      expect(events.some(event => event.type === 'complete')).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports a missing binary without crashing', async () => {
    const events = [];
    for await (const event of new AgyProvider({ binaryPath: '/nonexistent/zoe-agy' }).chat({ messages: [] })) {
      events.push(event);
    }
    expect(events.some(event => event.type === 'error')).toBe(true);
  });

  it('checks availability via binary check', async () => {
    const provider = new AgyProvider();
    const available = await provider.isAvailable();
    expect(typeof available).toBe('boolean');
  });
});
