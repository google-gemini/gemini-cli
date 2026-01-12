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

  it('should return idle state title with folder name', () => {
    const title = computeTerminalTitle({
      streamingState: StreamingState.Idle,
      isConfirming: false,
      folderName: 'my-project',
      showThoughts: false,
      useDynamicTitle: true,
    });

    expect(title).toContain('◇  Ready (my-project)');
    expect(title.length).toBe(80);
  });

  it('should return legacy title when useDynamicTitle is false', () => {
    const title = computeTerminalTitle({
      streamingState: StreamingState.Responding,
      isConfirming: false,
      folderName: 'my-project',
      showThoughts: true, // Should be ignored
      useDynamicTitle: false,
    });

    expect(title).toBe('Gemini CLI (my-project)'.padEnd(80, ' '));
  });

  it('should return active state title with "Working..." when thoughts are disabled', () => {
    const title = computeTerminalTitle({
      streamingState: StreamingState.Responding,
      thoughtSubject: 'Reading files',
      isConfirming: false,
      folderName: 'my-project',
      showThoughts: false,
      useDynamicTitle: true,
    });

    expect(title).toContain('✦  Working... (my-project)');
    expect(title.length).toBe(80);
  });

  it('should return active state title with thought subject and suffix when thoughts are short enough', () => {
    const title = computeTerminalTitle({
      streamingState: StreamingState.Responding,
      thoughtSubject: 'Short thought',
      isConfirming: false,
      folderName: 'my-project',
      showThoughts: true,
      useDynamicTitle: true,
    });

    expect(title).toContain('✦  Short thought (my-project)');
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
  });

  it('should return fallback active title with suffix if no thought subject is provided even when thoughts are enabled', () => {
    const title = computeTerminalTitle({
      streamingState: StreamingState.Responding,
      thoughtSubject: undefined,
      isConfirming: false,
      folderName: 'my-project',
      showThoughts: true,
      useDynamicTitle: true,
    });

    expect(title).toBe('✦  Working... (my-project)'.padEnd(80, ' '));
  });

  it('should return action required state when confirming', () => {
    const title = computeTerminalTitle({
      streamingState: StreamingState.Idle,
      isConfirming: true,
      folderName: 'my-project',
      showThoughts: false,
      useDynamicTitle: true,
    });

    expect(title).toContain('✋  Action Required (my-project)');
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
    expect(title).toContain('...');
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
  });

  it('should truncate very long folder names to fit within 80 characters', () => {
    const longFolderName = 'A'.repeat(100);
    const title = computeTerminalTitle({
      streamingState: StreamingState.Idle,
      isConfirming: false,
      folderName: longFolderName,
      showThoughts: false,
      useDynamicTitle: true,
    });

    expect(title.length).toBe(80);
    expect(title).toContain('◇  Ready (AAAAA');
    expect(title).toContain('...)');
  });

  it('should truncate very long CLI_TITLE to fit within 80 characters', () => {
    const longTitle = 'B'.repeat(100);
    vi.stubEnv('CLI_TITLE', longTitle);

    const title = computeTerminalTitle({
      streamingState: StreamingState.Idle,
      isConfirming: false,
      folderName: 'my-project',
      showThoughts: false,
      useDynamicTitle: true,
    });

    expect(title.length).toBe(80);
    expect(title).toContain('◇  Ready (BBBBB');
    expect(title).toContain('...)');
  });

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
    expect(title).toContain('...)');
  });
});
