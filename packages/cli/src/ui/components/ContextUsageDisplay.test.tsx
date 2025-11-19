/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { ContextUsageDisplay } from './ContextUsageDisplay.js';

vi.mock('@google/gemini-cli-core', () => ({
  tokenLimit: vi.fn((model: string) => {
    if (model.includes('pro')) return 1000000;
    return 30000;
  }),
}));

describe('ContextUsageDisplay', () => {
  it('should render context percentage', () => {
    const { lastFrame } = render(
      <ContextUsageDisplay promptTokenCount={5000} model="gemini-pro" />,
    );
    expect(lastFrame()).toContain('%');
    expect(lastFrame()).toContain('context left');
  });

  it('should calculate percentage correctly for half usage', () => {
    const { lastFrame } = render(
      <ContextUsageDisplay promptTokenCount={15000} model="base-model" />,
    );
    expect(lastFrame()).toContain('50%');
  });

  it('should show 100% when no tokens used', () => {
    const { lastFrame } = render(
      <ContextUsageDisplay promptTokenCount={0} model="gemini-pro" />,
    );
    expect(lastFrame()).toContain('100%');
  });

  it('should show 0% when fully used', () => {
    const { lastFrame } = render(
      <ContextUsageDisplay promptTokenCount={1000000} model="gemini-pro" />,
    );
    expect(lastFrame()).toContain('0%');
  });

  it('should handle small token counts', () => {
    const { lastFrame } = render(
      <ContextUsageDisplay promptTokenCount={100} model="gemini-pro" />,
    );
    const output = lastFrame();
    expect(output).toContain('%');
    expect(output).toContain('context left');
  });

  it('should format percentage without decimals', () => {
    const { lastFrame } = render(
      <ContextUsageDisplay promptTokenCount={333333} model="gemini-pro" />,
    );
    const output = lastFrame();
    expect(output).toMatch(/\d+%/);
    expect(output).not.toMatch(/\d+\.\d+%/);
  });

  it('should render parentheses around percentage', () => {
    const { lastFrame } = render(
      <ContextUsageDisplay promptTokenCount={5000} model="gemini-pro" />,
    );
    const output = lastFrame();
    expect(output).toMatch(/\(\d+% context left\)/);
  });

  it('should handle different models', () => {
    const { lastFrame } = render(
      <ContextUsageDisplay promptTokenCount={15000} model="custom-model" />,
    );
    expect(lastFrame()).toContain('%');
  });

  it('should not crash with zero token limit', () => {
    expect(() => {
      render(<ContextUsageDisplay promptTokenCount={0} model="gemini-pro" />);
    }).not.toThrow();
  });

  it('should show high percentage for low usage', () => {
    const { lastFrame } = render(
      <ContextUsageDisplay promptTokenCount={1000} model="gemini-pro" />,
    );
    const output = lastFrame();
    expect(output).toContain('100%');
  });

  it('should unmount cleanly', () => {
    const { unmount } = render(
      <ContextUsageDisplay promptTokenCount={5000} model="gemini-pro" />,
    );
    expect(() => unmount()).not.toThrow();
  });

  it('should render complete message', () => {
    const { lastFrame } = render(
      <ContextUsageDisplay promptTokenCount={10000} model="gemini-pro" />,
    );
    const output = lastFrame();
    expect(output).toContain('context left');
  });
});
