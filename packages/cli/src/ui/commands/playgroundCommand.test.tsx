/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render } from 'ink-testing-library';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import { PlaygroundApp } from './playgroundCommand.js';
import { useKeypress } from '../hooks/useKeypress.js';

vi.mock('node:fs');
vi.mock('../hooks/useKeypress.js', () => ({
  useKeypress: vi.fn(),
}));

describe('PlaygroundApp', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders the initial layout with loading state', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const { lastFrame } = render(<PlaygroundApp />);
    expect(lastFrame()).toContain('Gemini CLI - Local Prompt Playground');
    expect(lastFrame()).toContain('File not found:');
  });

  it('loads prompt content and watches for file changes', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('mock prompt content');
    const { lastFrame } = render(<PlaygroundApp />);
    expect(lastFrame()).toContain('mock prompt content');
    expect(fs.watch).toHaveBeenCalled();
  });

  it('handles keyboard navigation and eval case execution', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('mock prompt content');
    let keyHandler: any = null;
    vi.mocked(useKeypress).mockImplementation((handler: any) => {
      keyHandler = handler;
    });

    const { lastFrame, rerender } = render(<PlaygroundApp />);
    // Default selection is 0
    expect(lastFrame()).toContain('>   Missing dependency lodash');
    
    // Simulate navigation: press down Arrow
    if (keyHandler) {
      keyHandler({ name: 'down' });
      rerender(<PlaygroundApp />);
      expect(lastFrame()).toContain('  Missing dependency lodash');
      expect(lastFrame()).toContain('>   Fix failing unit tests in Router');
      
      // Simulate execution: press enter
      keyHandler({ name: 'enter' });
      rerender(<PlaygroundApp />);
      expect(lastFrame()).toContain(\`> Initializing Eval Case: 'Fix failing unit tests in Router'\`);
    } else {
      throw new Error("useKeypress was not bound");
    }
  });
});
