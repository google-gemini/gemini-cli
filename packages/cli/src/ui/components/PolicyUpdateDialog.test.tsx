/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { act } from 'react';
import { renderWithProviders } from '../../test-utils/render.js';
import { waitFor } from '../../test-utils/async.js';
import {
  PolicyUpdateDialog,
  PolicyUpdateChoice,
} from './PolicyUpdateDialog.js';

describe('PolicyUpdateDialog', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders correctly with default props', () => {
    const onSelect = vi.fn();
    const { lastFrame } = renderWithProviders(
      <PolicyUpdateDialog
        onSelect={onSelect}
        scope="project"
        identifier="/test/path"
        isRestarting={false}
      />,
    );

    const output = lastFrame();
    expect(output).toContain('New or changed project policies detected');
    expect(output).toContain('Location: /test/path');
    expect(output).toContain('Accept and Load');
    expect(output).toContain('Ignore');
  });

  it('calls onSelect with ACCEPT when accept option is chosen', async () => {
    const onSelect = vi.fn();
    const { stdin } = renderWithProviders(
      <PolicyUpdateDialog
        onSelect={onSelect}
        scope="project"
        identifier="/test/path"
        isRestarting={false}
      />,
    );

    // Accept is the first option, so pressing enter should select it
    await act(async () => {
      stdin.write('\r');
    });

    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith(PolicyUpdateChoice.ACCEPT);
    });
  });

  it('calls onSelect with IGNORE when ignore option is chosen', async () => {
    const onSelect = vi.fn();
    const { stdin } = renderWithProviders(
      <PolicyUpdateDialog
        onSelect={onSelect}
        scope="project"
        identifier="/test/path"
        isRestarting={false}
      />,
    );

    // Move down to Ignore option
    await act(async () => {
      stdin.write('\x1B[B'); // Down arrow
    });
    await act(async () => {
      stdin.write('\r'); // Enter
    });

    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith(PolicyUpdateChoice.IGNORE);
    });
  });

  it('calls onSelect with IGNORE when Escape is pressed', async () => {
    const onSelect = vi.fn();
    const { stdin } = renderWithProviders(
      <PolicyUpdateDialog
        onSelect={onSelect}
        scope="project"
        identifier="/test/path"
        isRestarting={false}
      />,
    );

    await act(async () => {
      stdin.write('\x1B'); // Escape key
    });

    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith(PolicyUpdateChoice.IGNORE);
    });
  });

  it('displays restarting message when isRestarting is true', () => {
    const onSelect = vi.fn();
    const { lastFrame } = renderWithProviders(
      <PolicyUpdateDialog
        onSelect={onSelect}
        scope="project"
        identifier="/test/path"
        isRestarting={true}
      />,
    );

    const output = lastFrame();
    expect(output).toContain(
      'Gemini CLI is restarting to apply the policy changes...',
    );
  });
});
