/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { render } from 'ink-testing-library';
import { Tips } from './Tips.js';
import { type Config } from '@google/gemini-cli-core';

const createMockConfig = (geminiMdFileCount: number): Config =>
  ({
    getGeminiMdFileCount: () => geminiMdFileCount,
  }) as unknown as Config;

describe('Tips', () => {
  it('should render tips header', () => {
    const config = createMockConfig(0);
    const { lastFrame } = render(<Tips config={config} />);
    expect(lastFrame()).toContain('Tips for getting started:');
  });

  it('should render tip 1', () => {
    const config = createMockConfig(0);
    const { lastFrame } = render(<Tips config={config} />);
    expect(lastFrame()).toContain(
      '1. Ask questions, edit files, or run commands.',
    );
  });

  it('should render tip 2', () => {
    const config = createMockConfig(0);
    const { lastFrame } = render(<Tips config={config} />);
    expect(lastFrame()).toContain('2. Be specific for the best results.');
  });

  it('should show GEMINI.md tip when count is 0', () => {
    const config = createMockConfig(0);
    const { lastFrame } = render(<Tips config={config} />);
    expect(lastFrame()).toContain('GEMINI.md');
  });

  it('should show 4 tips when no GEMINI.md files', () => {
    const config = createMockConfig(0);
    const { lastFrame } = render(<Tips config={config} />);
    expect(lastFrame()).toContain('3. Create');
    expect(lastFrame()).toContain('4.');
  });

  it('should show 3 tips when GEMINI.md files exist', () => {
    const config = createMockConfig(1);
    const { lastFrame } = render(<Tips config={config} />);
    expect(lastFrame()).not.toContain('4.');
    expect(lastFrame()).toContain('3.');
  });

  it('should not show GEMINI.md tip when count > 0', () => {
    const config = createMockConfig(5);
    const { lastFrame } = render(<Tips config={config} />);
    expect(lastFrame()).not.toContain('GEMINI.md');
  });

  it('should show /help in all cases', () => {
    const config = createMockConfig(0);
    const { lastFrame } = render(<Tips config={config} />);
    expect(lastFrame()).toContain('/help');
  });

  it('should call getGeminiMdFileCount', () => {
    let called = false;
    const config = {
      getGeminiMdFileCount: () => {
        called = true;
        return 0;
      },
    } as unknown as Config;

    render(<Tips config={config} />);
    expect(called).toBe(true);
  });

  it('should handle multiple GEMINI.md files', () => {
    const config = createMockConfig(10);
    const { lastFrame } = render(<Tips config={config} />);
    expect(lastFrame()).toContain('/help');
  });

  it('should not crash on render', () => {
    const config = createMockConfig(0);
    expect(() => {
      render(<Tips config={config} />);
    }).not.toThrow();
  });

  it('should unmount cleanly', () => {
    const config = createMockConfig(0);
    const { unmount } = render(<Tips config={config} />);
    expect(() => unmount()).not.toThrow();
  });

  it('should render with flexDirection column', () => {
    const config = createMockConfig(0);
    const { lastFrame } = render(<Tips config={config} />);
    // Verify multiple lines are rendered (flexDirection column)
    expect(lastFrame()?.split('\n').length).toBeGreaterThan(3);
  });

  it('should use correct numbering with GEMINI.md files', () => {
    const config = createMockConfig(2);
    const { lastFrame } = render(<Tips config={config} />);
    const output = lastFrame();
    expect(output).toContain('1.');
    expect(output).toContain('2.');
    expect(output).toContain('3. /help');
  });

  it('should use correct numbering without GEMINI.md files', () => {
    const config = createMockConfig(0);
    const { lastFrame } = render(<Tips config={config} />);
    const output = lastFrame();
    expect(output).toContain('1.');
    expect(output).toContain('2.');
    expect(output).toContain('3. Create');
    expect(output).toContain('4. /help');
  });
});
