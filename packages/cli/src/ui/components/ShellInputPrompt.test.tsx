/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { ShellInputPrompt } from './ShellInputPrompt.js';
import { ShellExecutionService } from '@google/gemini-cli-core';
import { type Key } from '../hooks/keyToAnsi.js';

vi.mock('../hooks/useKeypress.js', () => ({
  useKeypress: vi.fn(),
}));

vi.mock('../hooks/keyToAnsi.js', () => ({
  keyToAnsi: vi.fn((key: Key) => {
    if (key.name === 'a') return 'a';
    if (key.name === 'enter') return '\r';
    return null;
  }),
}));

vi.mock('@google/gemini-cli-core', () => ({
  ShellExecutionService: {
    writeToPty: vi.fn(),
    scrollPty: vi.fn(),
  },
}));

describe('ShellInputPrompt', () => {
  it('should return null', () => {
    const { lastFrame } = render(
      <ShellInputPrompt activeShellPtyId={1} focus={true} />,
    );
    expect(lastFrame()).toBe('');
  });

  it('should register keypress handler', async () => {
    const { useKeypress } = await import('../hooks/useKeypress.js');
    render(<ShellInputPrompt activeShellPtyId={1} focus={true} />);
    expect(useKeypress).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ isActive: true }),
    );
  });

  it('should pass focus state to useKeypress', async () => {
    const { useKeypress } = await import('../hooks/useKeypress.js');
    render(<ShellInputPrompt activeShellPtyId={1} focus={false} />);
    expect(useKeypress).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ isActive: false }),
    );
  });

  it('should default focus to true', async () => {
    const { useKeypress } = await import('../hooks/useKeypress.js');
    render(<ShellInputPrompt activeShellPtyId={1} />);
    expect(useKeypress).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ isActive: true }),
    );
  });

  it('should handle null activeShellPtyId', () => {
    expect(() => {
      render(<ShellInputPrompt activeShellPtyId={null} focus={true} />);
    }).not.toThrow();
  });

  it('should write to PTY when key is pressed and focused', async () => {
    const { useKeypress } = await import('../hooks/useKeypress.js');
    const { keyToAnsi } = await import('../hooks/keyToAnsi.js');
    vi.mocked(useKeypress).mockClear();

    render(<ShellInputPrompt activeShellPtyId={123} focus={true} />);

    const keypressHandler = vi.mocked(useKeypress).mock.calls[0][0];
    const key: Key = { name: 'a' } as Key;

    keypressHandler(key);

    expect(keyToAnsi).toHaveBeenCalledWith(key);
    expect(ShellExecutionService.writeToPty).toHaveBeenCalledWith(123, 'a');
  });

  it('should not write to PTY when not focused', async () => {
    const { useKeypress } = await import('../hooks/useKeypress.js');
    vi.mocked(ShellExecutionService.writeToPty).mockClear();
    vi.mocked(useKeypress).mockClear();

    render(<ShellInputPrompt activeShellPtyId={123} focus={false} />);

    const keypressHandler = vi.mocked(useKeypress).mock.calls[0][0];
    const key: Key = { name: 'a' } as Key;

    keypressHandler(key);

    expect(ShellExecutionService.writeToPty).not.toHaveBeenCalled();
  });

  it('should not write to PTY when activeShellPtyId is null', async () => {
    const { useKeypress } = await import('../hooks/useKeypress.js');
    vi.mocked(ShellExecutionService.writeToPty).mockClear();
    vi.mocked(useKeypress).mockClear();

    render(<ShellInputPrompt activeShellPtyId={null} focus={true} />);

    const keypressHandler = vi.mocked(useKeypress).mock.calls[0][0];
    const key: Key = { name: 'a' } as Key;

    keypressHandler(key);

    expect(ShellExecutionService.writeToPty).not.toHaveBeenCalled();
  });

  it('should scroll up on ctrl+shift+up', async () => {
    const { useKeypress } = await import('../hooks/useKeypress.js');
    vi.mocked(ShellExecutionService.scrollPty).mockClear();
    vi.mocked(useKeypress).mockClear();

    render(<ShellInputPrompt activeShellPtyId={123} focus={true} />);

    const keypressHandler = vi.mocked(useKeypress).mock.calls[0][0];
    const key: Key = { name: 'up', ctrl: true, shift: true } as Key;

    keypressHandler(key);

    expect(ShellExecutionService.scrollPty).toHaveBeenCalledWith(123, -1);
  });

  it('should scroll down on ctrl+shift+down', async () => {
    const { useKeypress } = await import('../hooks/useKeypress.js');
    vi.mocked(ShellExecutionService.scrollPty).mockClear();
    vi.mocked(useKeypress).mockClear();

    render(<ShellInputPrompt activeShellPtyId={123} focus={true} />);

    const keypressHandler = vi.mocked(useKeypress).mock.calls[0][0];
    const key: Key = { name: 'down', ctrl: true, shift: true } as Key;

    keypressHandler(key);

    expect(ShellExecutionService.scrollPty).toHaveBeenCalledWith(123, 1);
  });

  it('should not scroll when not focused', async () => {
    const { useKeypress } = await import('../hooks/useKeypress.js');
    vi.mocked(ShellExecutionService.scrollPty).mockClear();
    vi.mocked(useKeypress).mockClear();

    render(<ShellInputPrompt activeShellPtyId={123} focus={false} />);

    const keypressHandler = vi.mocked(useKeypress).mock.calls[0][0];
    const key: Key = { name: 'up', ctrl: true, shift: true } as Key;

    keypressHandler(key);

    expect(ShellExecutionService.scrollPty).not.toHaveBeenCalled();
  });

  it('should not write when keyToAnsi returns null', async () => {
    const { useKeypress } = await import('../hooks/useKeypress.js');
    const { keyToAnsi } = await import('../hooks/keyToAnsi.js');
    vi.mocked(ShellExecutionService.writeToPty).mockClear();
    vi.mocked(keyToAnsi).mockReturnValue(null);

    render(<ShellInputPrompt activeShellPtyId={123} focus={true} />);

    const keypressHandler = vi.mocked(useKeypress).mock.calls[0][0];
    const key: Key = { name: 'unknown' } as Key;

    keypressHandler(key);

    expect(ShellExecutionService.writeToPty).not.toHaveBeenCalled();
  });

  it('should not crash on render', () => {
    expect(() => {
      render(<ShellInputPrompt activeShellPtyId={1} focus={true} />);
    }).not.toThrow();
  });

  it('should unmount cleanly', () => {
    const { unmount } = render(
      <ShellInputPrompt activeShellPtyId={1} focus={true} />,
    );
    expect(() => unmount()).not.toThrow();
  });
});
