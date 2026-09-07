/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { CommandRegistry } from './CommandRegistry.js';
import { SessionEngine } from '@zoe/core';

describe('CommandRegistry', () => {
  it('detects slash commands', () => {
    const registry = new CommandRegistry();
    expect(registry.isCommand('/help')).toBe(true);
    expect(registry.isCommand('/exit')).toBe(true);
    expect(registry.isCommand('hello')).toBe(false);
  });

  it('executes /help and returns command list', async () => {
    const registry = new CommandRegistry();
    const session = new SessionEngine();
    let exited = false;

    const result = await registry.execute('/help', {
      session,
      exit: () => {
        exited = true;
      },
    });

    expect(typeof result).toBe('string');
    expect(result).toContain('Available commands:');
    expect(result).toContain('/help');
    expect(result).toContain('/exit');
    expect(result).toContain('/clear');
    expect(exited).toBe(false);
  });

  it('executes /version', async () => {
    const registry = new CommandRegistry();
    const session = new SessionEngine();

    const result = await registry.execute('/version', {
      session,
      exit: () => {},
    });

    expect(result).toBe('Zoe v0.1.0');
  });

  it('executes /exit and triggers exit callback', async () => {
    const registry = new CommandRegistry();
    const session = new SessionEngine();
    let exited = false;

    await registry.execute('/exit', {
      session,
      exit: () => {
        exited = true;
      },
    });

    expect(exited).toBe(true);
  });

  it('returns helpful message for unknown commands', async () => {
    const registry = new CommandRegistry();
    const session = new SessionEngine();

    const result = await registry.execute('/unknown', {
      session,
      exit: () => {},
    });

    expect(result).toContain('Unknown command: /unknown');
  });
});
