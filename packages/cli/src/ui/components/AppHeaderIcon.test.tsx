/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderWithProviders } from '../../test-utils/render.js';
import { AppHeader } from './AppHeader.js';

// We mock the entire module to control the isAppleTerminal export
vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    isAppleTerminal: vi.fn(),
  };
});

import { isAppleTerminal } from '@google/gemini-cli-core';

describe('AppHeader Icon Rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('renders the default icon in standard terminals', async () => {
    vi.mocked(isAppleTerminal).mockReturnValue(false);

    const result = renderWithProviders(<AppHeader version="1.0.0" />);
    await result.waitUntilReady();

    await expect(result).toMatchSvgSnapshot();
  });

  it('renders the symmetric icon in Apple Terminal', async () => {
    vi.mocked(isAppleTerminal).mockReturnValue(true);

    const result = renderWithProviders(<AppHeader version="1.0.0" />);
    await result.waitUntilReady();

    await expect(result).toMatchSvgSnapshot();
  });
});
