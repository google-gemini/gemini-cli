/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { act } from 'react';
import { render } from '../../test-utils/render.js';
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

  it('renders the initial layout with loading state', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const { lastFrame } = await render(<PlaygroundApp />);
    expect(lastFrame()).toContain('Gemini CLI - Local Prompt Playground');
    expect(lastFrame()).toContain('File not found:');
  });

  it('loads prompt content and watches for file changes', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('mock prompt content');
    const { lastFrame } = await render(<PlaygroundApp />);
    expect(lastFrame()).toContain('mock prompt content');
    expect(fs.watch).toHaveBeenCalled();
  });

  it('handles keyboard navigation and eval case execution', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('mock prompt content');
    let keyHandler: any = null;
    vi.mocked(useKeypress).mockImplementation((handler: any) => {
      keyHandler = handler;
    });

    const { lastFrame, waitUntilReady } = await render(<PlaygroundApp />);
    // Default selection is 0
    expect(lastFrame()).toContain('> Missing dependency lodash');
    
    // Simulate navigation: press down Arrow
    if (keyHandler) {
      act(() => {
        keyHandler({ name: 'down' });
      });
      await waitUntilReady();
      expect(lastFrame()).toContain('  Missing dependency lodash');
      expect(lastFrame()).toContain('> Fix failing unit tests in Router');
      
      // Simulate execution: press enter
      act(() => {
        keyHandler({ name: 'enter' });
      });
      await waitUntilReady();
      expect(lastFrame()).toContain(`> Initializing Eval Case: 'Fix`);
    } else {
      throw new Error("useKeypress was not bound");
    }
  });
});
