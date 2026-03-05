/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { act } from 'react';
import { renderWithProviders } from '../../test-utils/render.js';
import { MediaVisualizer } from './MediaVisualizer.js';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import terminalImage from 'terminal-image';

vi.mock('terminal-image', () => ({
  default: {
    buffer: vi.fn() as unknown as typeof terminalImage.buffer,
    file: vi.fn() as unknown as typeof terminalImage.file,
  },
}));
vi.mock('node:fs', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    promises: {
      ...actual.promises,
      stat: vi.fn().mockResolvedValue({ isFile: () => true }),
    },
  };
});

vi.mock('node:path', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    resolve: vi.fn((p: string) => `/mocked/path/to/${p}`),
  };
});

describe('MediaVisualizer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state initially', async () => {
    // Mock to never resolve
    (terminalImage.file as Mock).mockReturnValue(new Promise(() => { }));

    const { lastFrame, unmount, waitUntilReady } = renderWithProviders(
      <MediaVisualizer imagePath="test.png" />,
    );

    await waitUntilReady();

    expect(lastFrame()).toContain('Loading image...');
    unmount();
  });

  it('renders rendered content from file', async () => {
    let resolveImage!: (val: string) => void;
    const promise = new Promise<string>((resolve) => {
      resolveImage = resolve;
    });
    (terminalImage.file as Mock).mockReturnValue(promise);

    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <MediaVisualizer imagePath="test.png" />,
    );

    await waitUntilReady();
    expect(lastFrame()).toContain('Loading image...');

    await act(async () => {
      resolveImage('MOCK_ANSI_IMAGE');
    });

    await waitUntilReady();

    expect(lastFrame()).toContain('MOCK_ANSI_IMAGE');
    expect(terminalImage.file).toHaveBeenCalledWith(
      '/mocked/path/to/test.png',
      {
        width: undefined,
        height: undefined,
        preserveAspectRatio: true,
      },
    );
    unmount();
  });

  it('renders rendered content from buffer', async () => {
    let resolveImage!: (val: string) => void;
    const promise = new Promise<string>((resolve) => {
      resolveImage = resolve;
    });
    (terminalImage.buffer as Mock).mockReturnValue(promise);
    const mockBuffer = Buffer.from('fake-image-data');

    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <MediaVisualizer imageBuffer={mockBuffer} />,
    );

    await waitUntilReady();

    await act(async () => {
      resolveImage('MOCK_ANSI_BUFFER');
    });

    await waitUntilReady();

    expect(lastFrame()).toContain('MOCK_ANSI_BUFFER');
    expect(terminalImage.buffer).toHaveBeenCalledWith(mockBuffer, {
      width: undefined,
      height: undefined,
      preserveAspectRatio: true,
    });
    unmount();
  });

  it('renders error message on failure', async () => {
    let rejectImage!: (err: Error) => void;
    const promise = new Promise<string>((_, reject) => {
      rejectImage = reject;
    });
    (terminalImage.file as Mock).mockReturnValue(promise);

    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <MediaVisualizer imagePath="error.png" />,
    );

    await waitUntilReady();

    await act(async () => {
      rejectImage(new Error('Failed to load'));
    });

    await waitUntilReady();

    expect(lastFrame()).toContain('[Image Render Error: Failed to load]');
    unmount();
  });
});
