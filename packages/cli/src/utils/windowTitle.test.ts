/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { computeTerminalTitle } from './windowTitle.js';
import { StreamingState } from '../ui/types.js';

describe('computeTerminalTitle', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    {
      description: 'idle state title with folder name',
      args: {
        streamingState: StreamingState.Idle,
        isConfirming: false,
        folderName: 'my-project',
        showThoughts: false,
        useDynamicTitle: true,
      },
      expected: '◇  Ready (my-project)',
    },
    {
      description: 'legacy title when useDynamicTitle is false',
      args: {
        streamingState: StreamingState.Responding,
        isConfirming: false,
        folderName: 'my-project',
        showThoughts: true,
        useDynamicTitle: false,
      },
      expected: 'Gemini CLI (my-project)'.padEnd(80, ' '),
      exact: true,
    },
    {
      description:
        'active state title with "Working…" when thoughts are disabled',
      args: {
        streamingState: StreamingState.Responding,
        thoughtSubject: 'Reading files',
        isConfirming: false,
        folderName: 'my-project',
        showThoughts: false,
        useDynamicTitle: true,
      },
      expected: '✦  Working… (my-project)',
    },
    {
      description:
        'active state title with thought subject and suffix when thoughts are short enough',
      args: {
        streamingState: StreamingState.Responding,
        thoughtSubject: 'Short thought',
        isConfirming: false,
        folderName: 'my-project',
        showThoughts: true,
        useDynamicTitle: true,
      },
      expected: '✦  Short thought (my-project)',
    },
    {
      description:
        'fallback active title with suffix if no thought subject is provided even when thoughts are enabled',
      args: {
        streamingState: StreamingState.Responding,
        thoughtSubject: undefined,
        isConfirming: false,
        folderName: 'my-project',
        showThoughts: true,
        useDynamicTitle: true,
      },
      expected: '✦  Working… (my-project)'.padEnd(80, ' '),
      exact: true,
    },
    {
      description: 'action required state when confirming',
      args: {
        streamingState: StreamingState.Idle,
        isConfirming: true,
        folderName: 'my-project',
        showThoughts: false,
        useDynamicTitle: true,
      },
      expected: '✋  Action Required (my-project)',
    },
  ])('should return $description', ({ args, expected, exact }) => {
    const title = computeTerminalTitle(args);
    if (exact) {
      expect(title).toBe(expected);
    } else {
      expect(title).toContain(expected);
    }
    expect(title.length).toBe(80);
  });

  it('should return active state title with thought subject and NO suffix when thoughts are very long', () => {
    const longThought = 'A'.repeat(70);
    const title = computeTerminalTitle({
      streamingState: StreamingState.Responding,
      thoughtSubject: longThought,
      isConfirming: false,
      folderName: 'my-project',
      showThoughts: true,
      useDynamicTitle: true,
    });

    expect(title).not.toContain('(my-project)');
    expect(title).toContain('✦  AAAAAAAAAAAAAAAA');
    expect(title.length).toBe(80);
  });

  it('should truncate long thought subjects when thoughts are enabled', () => {
    const longThought = 'A'.repeat(100);
    const title = computeTerminalTitle({
      streamingState: StreamingState.Responding,
      thoughtSubject: longThought,
      isConfirming: false,
      folderName: 'my-project',
      showThoughts: true,
      useDynamicTitle: true,
    });

    expect(title.length).toBe(80);
    expect(title).toContain('…');
    expect(title.trimEnd().length).toBe(80);
  });

  it('should strip control characters from the title', () => {
    const title = computeTerminalTitle({
      streamingState: StreamingState.Responding,
      thoughtSubject: 'BadTitle\x00 With\x07Control\x1BChars',
      isConfirming: false,
      folderName: 'my-project',
      showThoughts: true,
      useDynamicTitle: true,
    });

    expect(title).toContain('BadTitle WithControlChars');
    expect(title).not.toContain('\x00');
    expect(title).not.toContain('\x07');
    expect(title).not.toContain('\x1B');
    expect(title.length).toBe(80);
  });

  it('should prioritize CLI_TITLE environment variable over folder name when thoughts are disabled', () => {
    vi.stubEnv('CLI_TITLE', 'EnvOverride');

    const title = computeTerminalTitle({
      streamingState: StreamingState.Idle,
      isConfirming: false,
      folderName: 'my-project',
      showThoughts: false,
      useDynamicTitle: true,
    });

    expect(title).toContain('◇  Ready (EnvOverride)');
    expect(title).not.toContain('my-project');
    expect(title.length).toBe(80);
  });

  it.each([
    {
      name: 'folder name',
      folderName: 'A'.repeat(100),
      expected: '◇  Ready (AAAAA',
    },
    {
      name: 'CLI_TITLE',
      folderName: 'my-project',
      envTitle: 'B'.repeat(100),
      expected: '◇  Ready (BBBBB',
    },
  ])(
    'should truncate very long $name to fit within 80 characters',
    ({ folderName, envTitle, expected }) => {
      if (envTitle) {
        vi.stubEnv('CLI_TITLE', envTitle);
      }

      const title = computeTerminalTitle({
        streamingState: StreamingState.Idle,
        isConfirming: false,
        folderName,
        showThoughts: false,
        useDynamicTitle: true,
      });

      expect(title.length).toBe(80);
      expect(title).toContain(expected);
      expect(title).toContain('…)');
    },
  );

  it('should truncate long folder name when useDynamicTitle is false', () => {
    const longFolderName = 'C'.repeat(100);
    const title = computeTerminalTitle({
      streamingState: StreamingState.Responding,
      isConfirming: false,
      folderName: longFolderName,
      showThoughts: true,
      useDynamicTitle: false,
    });

    expect(title.length).toBe(80);
    expect(title).toContain('Gemini CLI (CCCCC');
    expect(title).toContain('…)');
  });
});
