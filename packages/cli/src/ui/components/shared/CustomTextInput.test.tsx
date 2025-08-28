/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { CustomTextInput } from './CustomTextInput.js';
import { renderWithProviders } from '../../../test-utils/render.js';

describe('CustomTextInput', () => {
  const wait = (ms = 50) => new Promise((resolve) => setTimeout(resolve, ms));

  it('should handle input change', async () => {
    const handleChange = vi.fn();
    const { stdin, unmount } = renderWithProviders(
      <CustomTextInput value="" onChange={handleChange} onSubmit={() => {}} />,
    );

    stdin.write('a');
    await wait();

    expect(handleChange).toHaveBeenCalledWith('a');
    unmount();
  });

  it('should handle submit', async () => {
    const handleSubmit = vi.fn();
    const { stdin, unmount } = renderWithProviders(
      <CustomTextInput value="" onChange={() => {}} onSubmit={handleSubmit} />,
    );

    stdin.write('\r');
    await wait();

    expect(handleSubmit).toHaveBeenCalled();
    unmount();
  });

  it('should handle backspace', async () => {
    const handleChange = vi.fn();
    let value = 'abc';
    const { stdin, rerender, unmount } = renderWithProviders(
      <CustomTextInput
        value={value}
        onChange={(v) => {
          value = v;
          handleChange(v);
        }}
        onSubmit={() => {}}
      />,
    );

    stdin.write('\u0008'); // backspace
    await wait();
    rerender(
      <CustomTextInput
        value={value}
        onChange={handleChange}
        onSubmit={() => {}}
      />,
    );

    expect(handleChange).toHaveBeenCalledWith('ab');
    unmount();
  });

  it('should handle paste', async () => {
    const handleChange = vi.fn();
    const { stdin, unmount } = renderWithProviders(
      <CustomTextInput value="" onChange={handleChange} onSubmit={() => {}} />,
    );

    stdin.write('\x1b[200~pasted text\x1b[201~');
    await wait();

    expect(handleChange).toHaveBeenCalledWith('pasted text');
    unmount();
  });
});
