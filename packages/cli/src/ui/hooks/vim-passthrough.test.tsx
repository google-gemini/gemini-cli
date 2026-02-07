/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '../../test-utils/render.js';
import { act } from 'react';
import { useVim } from './vim.js';
import type { VimMode } from './vim.js';
import type { TextBuffer } from '../components/shared/text-buffer.js';
import type { Key } from './useKeypress.js';

// Mock the VimModeContext
const mockVimContext = {
  vimEnabled: true,
  vimMode: 'INSERT' as VimMode,
  toggleVimEnabled: vi.fn(),
  setVimMode: vi.fn(),
};

vi.mock('../contexts/VimModeContext.js', () => ({
  useVimMode: () => mockVimContext,
  VimModeProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const createKey = (partial: Partial<Key>): Key => ({
  name: partial.name || '',
  sequence: partial.sequence || '',
  shift: partial.shift || false,
  alt: partial.alt || false,
  ctrl: partial.ctrl || false,
  cmd: partial.cmd || false,
  insertable: partial.insertable || false,
  ...partial,
});

describe('useVim passthrough', () => {
  let mockBuffer: Partial<TextBuffer>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockBuffer = {
      text: 'hello',
      handleInput: vi.fn().mockReturnValue(false),
      vimEscapeInsertMode: vi.fn(),
      setText: vi.fn(),
    };
    mockVimContext.vimEnabled = true;
  });

  it.each([
    {
      mode: 'INSERT' as VimMode,
      name: 'F12',
      key: createKey({ name: 'f12', sequence: '\u001b[24~' }),
    },
    {
      mode: 'INSERT' as VimMode,
      name: 'Ctrl-X',
      key: createKey({ name: 'x', ctrl: true, sequence: '\x18' }),
    },
    {
      mode: 'NORMAL' as VimMode,
      name: 'F12',
      key: createKey({ name: 'f12', sequence: '\u001b[24~' }),
    },
    {
      mode: 'NORMAL' as VimMode,
      name: 'Ctrl-X',
      key: createKey({ name: 'x', ctrl: true, sequence: '\x18' }),
    },
  ])('should pass through $name in $mode mode', ({ mode, key }) => {
    mockVimContext.vimMode = mode;
    const { result } = renderHook(() => useVim(mockBuffer as TextBuffer));

    let handled = true;
    act(() => {
      handled = result.current.handleInput(key);
    });

    expect(handled).toBe(false);
  });
});
