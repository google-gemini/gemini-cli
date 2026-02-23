/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../test-utils/render.js';
import { ContextUsageDisplay } from './ContextUsageDisplay.js';
import { describe, it, expect, vi } from 'vitest';

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    tokenLimit: () => 10000,
  };
});

vi.mock('../../config/settings.js', () => ({
  DEFAULT_MODEL_CONFIGS: {},
  LoadedSettings: class {
    constructor() {
      // this.merged = {};
    }
  },
}));

describe('ContextUsageDisplay', () => {
  it('renders correct percentage used', async () => {
    const { lastFrame, waitUntilReady, unmount } = render(
      <ContextUsageDisplay promptTokenCount={5000} model="gemini-pro" />,
    );
    await waitUntilReady();
    const output = lastFrame();
    expect(output).toContain('50% context used');
    unmount();
  });

  it('renders correctly when usage is 0%', async () => {
    const { lastFrame, waitUntilReady, unmount } = render(
      <ContextUsageDisplay promptTokenCount={0} model="gemini-pro" />,
    );
    await waitUntilReady();
    const output = lastFrame();
    expect(output).toContain('0% context used');
    unmount();
  });

  it('renders label even when terminal width is small', async () => {
    const { lastFrame, waitUntilReady, unmount } = render(
      <ContextUsageDisplay promptTokenCount={2000} model="gemini-pro" />,
    );
    await waitUntilReady();
    const output = lastFrame();
    expect(output).toContain('20% context used');
    unmount();
  });

  it('renders 80% correctly', async () => {
    const { lastFrame, waitUntilReady, unmount } = render(
      <ContextUsageDisplay promptTokenCount={8000} model="gemini-pro" />,
    );
    await waitUntilReady();
    const output = lastFrame();
    expect(output).toContain('80% context used');
    unmount();
  });

  it('renders 100% when full', async () => {
    const { lastFrame, waitUntilReady, unmount } = render(
      <ContextUsageDisplay promptTokenCount={10000} model="gemini-pro" />,
    );
    await waitUntilReady();
    const output = lastFrame();
    expect(output).toContain('100% context used');
    unmount();
  });
});
