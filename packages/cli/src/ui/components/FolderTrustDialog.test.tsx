/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderWithProviders } from '../../test-utils/render.js';
import { waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { FolderTrustDialog, FolderTrustChoice } from './FolderTrustDialog.js';

describe('FolderTrustDialog', () => {
  it('should render the dialog with title and description', () => {
    const { lastFrame } = renderWithProviders(
      <FolderTrustDialog onSelect={vi.fn()} onRestartRequest={vi.fn()} />,
    );

    expect(lastFrame()).toContain('Do you trust this folder?');
    expect(lastFrame()).toContain(
      'Trusting a folder allows Gemini to execute commands it suggests.',
    );
  });

  it('should call onSelect with DO_NOT_TRUST when escape is pressed and not restarting', async () => {
    const onSelect = vi.fn();
    const { stdin } = renderWithProviders(
      <FolderTrustDialog
        onSelect={onSelect}
        onRestartRequest={vi.fn()}
        isRestarting={false}
      />,
    );

    stdin.write('\x1b'); // escape key

    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith(FolderTrustChoice.DO_NOT_TRUST);
    });
  });

  it('should not call onSelect when escape is pressed and is restarting', async () => {
    const onSelect = vi.fn();
    const { stdin } = renderWithProviders(
      <FolderTrustDialog
        onSelect={onSelect}
        onRestartRequest={vi.fn()}
        isRestarting={true}
      />,
    );

    stdin.write('\x1b'); // escape key

    // Give it a moment to process, then assert that onSelect was NOT called.
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('should display restart message when isRestarting is true', () => {
    const { lastFrame } = renderWithProviders(
      <FolderTrustDialog
        onSelect={vi.fn()}
        onRestartRequest={vi.fn()}
        isRestarting={true}
      />,
    );

    expect(lastFrame()).toContain(
      'To see changes, Gemini CLI must be restarted',
    );
  });

  it('should call onRestartRequest when "r" is pressed and isRestarting is true', async () => {
    const onRestartRequest = vi.fn();
    const { stdin } = renderWithProviders(
      <FolderTrustDialog
        onSelect={vi.fn()}
        onRestartRequest={onRestartRequest}
        isRestarting={true}
      />,
    );

    stdin.write('r');

    await waitFor(() => {
      expect(onRestartRequest).toHaveBeenCalled();
    });
  });

  it('should not call onRestartRequest when "r" is pressed and isRestarting is false', async () => {
    const onRestartRequest = vi.fn();
    const { stdin } = renderWithProviders(
      <FolderTrustDialog
        onSelect={vi.fn()}
        onRestartRequest={onRestartRequest}
        isRestarting={false}
      />,
    );

    stdin.write('r');

    // Give it a moment to process, then assert that onRestartRequest was NOT called.
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(onRestartRequest).not.toHaveBeenCalled();
  });
});
