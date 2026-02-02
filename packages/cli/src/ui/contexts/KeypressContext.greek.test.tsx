/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { act } from 'react';
import { renderHook } from '../../test-utils/render.js';
import { vi, afterEach, beforeEach, describe, it, expect } from 'vitest';
import type { Mock } from 'vitest';
import { KeypressProvider, useKeypressContext } from './KeypressContext.js';
import { useStdin } from 'ink';
import { EventEmitter } from 'node:events';

// Mock the 'ink' module to control stdin
vi.mock('ink', async (importOriginal) => {
  const original = await importOriginal<typeof import('ink')>();
  return {
    ...original,
    useStdin: vi.fn(),
  };
});

class MockStdin extends EventEmitter {
  isTTY = true;
  setRawMode = vi.fn();
  override on = this.addListener;
  override removeListener = super.removeListener;
  resume = vi.fn();
  pause = vi.fn();

  write(text: string) {
    this.emit('data', text);
  }
}

describe('KeypressContext Greek support', () => {
  let stdin: MockStdin;
  const mockSetRawMode = vi.fn();

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <KeypressProvider>{children}</KeypressProvider>
  );

  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    stdin = new MockStdin();
    (useStdin as Mock).mockReturnValue({
      stdin,
      setRawMode: mockSetRawMode,
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    {
      lang: 'en_US.UTF-8',
      expected: { name: 'z', alt: true, insertable: false },
      desc: 'non-Greek locale (Option+z)',
    },
    {
      lang: 'el_GR.UTF-8',
      expected: { name: '', insertable: true },
      desc: 'Greek LANG',
    },
    {
      lcAll: 'el_GR.UTF-8',
      expected: { name: '', insertable: true },
      desc: 'Greek LC_ALL',
    },
    {
      lang: 'en_US.UTF-8',
      lcAll: 'el_GR.UTF-8',
      expected: { name: '', insertable: true },
      desc: 'LC_ALL overriding non-Greek LANG',
    },
    {
      lang: 'el_GR.UTF-8',
      char: '\u00B8',
      expected: { name: 'z', alt: true, shift: true },
      desc: 'Cedilla (\u00B8) in Greek locale (should be Option+Shift+z)',
    },
  ])(
    'should handle $char correctly in $desc',
    async ({ lang, lcAll, char = '\u03A9', expected }) => {
      if (lang) vi.stubEnv('LANG', lang);
      if (lcAll) vi.stubEnv('LC_ALL', lcAll);

      const keyHandler = vi.fn();
      const { result } = renderHook(() => useKeypressContext(), { wrapper });
      act(() => result.current.subscribe(keyHandler));

      act(() => stdin.write(char));

      expect(keyHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          ...expected,
          sequence: char,
        }),
      );
    },
  );
});
