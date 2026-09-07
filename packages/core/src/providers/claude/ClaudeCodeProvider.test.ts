/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { ClaudeCodeProvider } from './ClaudeCodeProvider.js';

describe('ClaudeCodeProvider', () => {
  it('initializes with claude defaults', () => {
    const provider = new ClaudeCodeProvider();
    expect(provider.name).toBe('claude');
  });

  it('accepts custom binary path and default model', () => {
    const provider = new ClaudeCodeProvider({
      binaryPath: '/custom/bin/claude',
      defaultModel: 'claude-3-5-sonnet',
    });
    expect(provider.name).toBe('claude');
  });

  it('checks availability and returns false when not installed', async () => {
    const provider = new ClaudeCodeProvider({
      binaryPath: '/non/existent/claude-binary-xyz',
    });
    const available = await provider.isAvailable();
    expect(available).toBe(false);
  });

  it('yields installation instruction and Antigravity tip when unavailable', async () => {
    const provider = new ClaudeCodeProvider({
      binaryPath: '/non/existent/claude-binary-xyz',
    });

    const events = [];
    for await (const event of provider.chat({ messages: [{ role: 'user', content: 'hello' }] })) {
      events.push(event);
    }

    expect(events.length).toBe(2);
    expect(events[0]?.type).toBe('chunk');
    if (events[0]?.type === 'chunk') {
      expect(events[0].text).toContain("Claude Code CLI ('claude') is not installed");
      expect(events[0].text).toContain('npm install -g @anthropic-ai/claude-code');
      expect(events[0].text).toContain('/model agy:claude-sonnet-4-6');
    }
  });
});
