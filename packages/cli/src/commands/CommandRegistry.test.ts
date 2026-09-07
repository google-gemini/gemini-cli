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
    expect(registry.isCommand('/model')).toBe(true);
    expect(registry.isCommand('/learn')).toBe(true);
    expect(registry.isCommand('/solve')).toBe(true);
    expect(registry.isCommand('/debug')).toBe(true);
    expect(registry.isCommand('/review')).toBe(true);
    expect(registry.isCommand('/explain')).toBe(true);
    expect(registry.isCommand('/hint')).toBe(true);
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
    expect(result).toContain('/learn');
    expect(result).toContain('/solve');
    expect(result).toContain('/debug');
    expect(result).toContain('/review');
    expect(result).toContain('/explain');
    expect(result).toContain('/hint');
    expect(result).toContain('/model');
    expect(result).toContain('/exit');
    expect(result).toContain('/clear');
    expect(exited).toBe(false);
  });

  it('inspects and switches model with /model', async () => {
    const registry = new CommandRegistry();
    const session = new SessionEngine({ model: 'placeholder' });

    // Inspect
    const inspectResult = await registry.execute('/model', {
      session,
      exit: () => {},
    });
    expect(inspectResult).toContain('Active provider: placeholder');
    expect(inspectResult).toContain('Active model: placeholder');

    // Switch to ollama model
    const switchResult = await registry.execute('/model llama3.2', {
      session,
      exit: () => {},
    });
    expect(switchResult).toContain('Switched model to llama3.2 (ollama)');
    expect(session.getModel()).toBe('llama3.2');
    expect(session.getProvider().name).toBe('ollama');
  });

  it('executes mentoring commands and sends prompt through session', async () => {
    const registry = new CommandRegistry();
    const session = new SessionEngine();

    await registry.execute('/learn closures', {
      session,
      exit: () => {},
    });
    const messages = session.getMessages();
    expect(messages.length).toBeGreaterThanOrEqual(2);
    expect(messages[0].content).toContain('Teach me about: closures');
  });

  it('executes /hint and triggers progressive hints', async () => {
    const registry = new CommandRegistry();
    const session = new SessionEngine();

    await registry.execute('/hint', {
      session,
      exit: () => {},
    });
    const messages = session.getMessages();
    expect(messages[0].content).toContain('Level 1');
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

  it('inspects and switches active mentoring policy via /policy', async () => {
    const registry = new CommandRegistry();
    const session = new SessionEngine();

    const inspectResult = await registry.execute('/policy', {
      session,
      exit: () => {},
    });
    expect(inspectResult).toContain('Active policy: Deep Code Comprehension');

    const switchResult = await registry.execute('/policy solve', {
      session,
      exit: () => {},
    });
    expect(switchResult).toContain('Switched active policy to: Guided Problem Solving (solve)');
    expect(session.mentor.getActivePolicy().intent).toBe('solve');

    const errorResult = await registry.execute('/policy invalid_mode', {
      session,
      exit: () => {},
    });
    expect(errorResult).toContain('Unknown policy: invalid_mode');
  });
});
