/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { act } from 'react';
import { render } from '../../test-utils/render.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PlaygroundApp } from './playgroundCommand.js';
import { useKeypress } from '../hooks/useKeypress.js';
import { PromptWatcherService } from '@google/gemini-cli-core';

vi.mock('../hooks/useKeypress.js', () => ({
  useKeypress: vi.fn(),
}));

vi.mock('../hooks/useTerminalSize.js', () => ({
  useTerminalSize: vi.fn(() => ({ columns: 100, rows: 40 })),
}));

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const original = await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...original,
    PromptWatcherService: vi.fn().mockImplementation(() => ({
      readPrompt: vi.fn().mockResolvedValue('mock prompt content'),
      watchPrompt: vi.fn().mockReturnValue(vi.fn()),
    })),
  };
});

describe('PlaygroundApp', () => {
  let mockPromptWatcherService: any;
  const mockPath = '/mock/path/snippets.ts';

  beforeEach(() => {
    vi.clearAllMocks();
    mockPromptWatcherService = new PromptWatcherService();
  });

  it('renders the initial layout with loading state', async () => {
    mockPromptWatcherService.readPrompt.mockRejectedValueOnce(new Error('File not found'));
    const { lastFrame, waitUntilReady } = await render(
      <PlaygroundApp 
        promptWatcherService={mockPromptWatcherService} 
        promptPath={mockPath} 
        initialPromptContent="Error loading prompt: File not found"
      />
    );
    await waitUntilReady();
    expect(lastFrame()).toContain('Gemini CLI - Local Prompt Playground');
    expect(lastFrame()).toContain('Error loading prompt: File not found');
  });

  it('loads prompt content and watches for file changes', async () => {
    const { lastFrame, waitUntilReady } = await render(
      <PlaygroundApp 
        promptWatcherService={mockPromptWatcherService} 
        promptPath={mockPath} 
        initialPromptContent="mock prompt content"
      />
    );
    await waitUntilReady();
    expect(lastFrame()).toContain('mock prompt content');
    expect(mockPromptWatcherService.watchPrompt).toHaveBeenCalledWith(mockPath, expect.any(Function));
  });

  it('matches snapshot', async () => {
    const { lastFrame, waitUntilReady } = await render(
      <PlaygroundApp 
        promptWatcherService={mockPromptWatcherService} 
        promptPath={mockPath} 
        initialPromptContent="mock prompt content"
      />
    );
    await waitUntilReady();
    expect(lastFrame()).toMatchSnapshot();
  });

  it('handles keyboard navigation and eval case execution', async () => {
    let keyHandler: any = null;
    vi.mocked(useKeypress).mockImplementation((handler: any) => {
      keyHandler = handler;
    });

    const { lastFrame, waitUntilReady } = await render(
      <PlaygroundApp 
        promptWatcherService={mockPromptWatcherService} 
        promptPath={mockPath} 
        initialPromptContent="mock prompt content"
      />
    );
    await waitUntilReady();

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
