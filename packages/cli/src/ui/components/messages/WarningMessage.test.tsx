/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { WarningMessage } from './WarningMessage.js';

vi.mock('../../utils/InlineMarkdownRenderer.js', () => ({
  RenderInline: ({ text }: { text: string }) => text,
}));

describe('WarningMessage', () => {
  it('should render warning prefix', () => {
    const { lastFrame } = render(<WarningMessage text="Warning" />);
    expect(lastFrame()).toContain('⚠');
  });

  it('should render warning text', () => {
    const { lastFrame } = render(<WarningMessage text="Deprecated API" />);
    expect(lastFrame()).toContain('Deprecated API');
  });

  it('should handle empty text', () => {
    const { lastFrame } = render(<WarningMessage text="" />);
    expect(lastFrame()).toContain('⚠');
  });

  it('should render complete warning message', () => {
    const warningText = 'Resource not found';
    const { lastFrame } = render(<WarningMessage text={warningText} />);
    const output = lastFrame();
    expect(output).toContain('⚠');
    expect(output).toContain(warningText);
  });

  it('should handle long warning messages', () => {
    const longWarning = 'C'.repeat(100);
    const { lastFrame } = render(<WarningMessage text={longWarning} />);
    expect(lastFrame()).toContain('C');
  });

  it('should unmount cleanly', () => {
    const { unmount } = render(<WarningMessage text="test warning" />);
    expect(() => unmount()).not.toThrow();
  });

  it('should handle special characters', () => {
    const { lastFrame } = render(
      <WarningMessage text="Warning: 'file' missing" />,
    );
    expect(lastFrame()).toContain("'file'");
  });

  it('should render with markdown support', () => {
    const { lastFrame } = render(
      <WarningMessage text="**Important** warning" />,
    );
    expect(lastFrame()).toContain('Important');
  });

  it('should handle warning with numbers', () => {
    const { lastFrame } = render(<WarningMessage text="Retry attempt: 3/5" />);
    expect(lastFrame()).toContain('3/5');
  });

  it('should not crash on render', () => {
    expect(() => {
      render(<WarningMessage text="warning message" />);
    }).not.toThrow();
  });

  it('should display warning symbol', () => {
    const { lastFrame } = render(<WarningMessage text="Warning" />);
    expect(lastFrame()).toContain('⚠');
  });

  it('should handle multiline text', () => {
    const { lastFrame } = render(
      <WarningMessage text="Warning 1\nWarning 2" />,
    );
    expect(lastFrame()).toContain('Warning');
  });

  it('should render inline markdown', () => {
    const { lastFrame } = render(<WarningMessage text="API `deprecated`" />);
    expect(lastFrame()).toContain('deprecated');
  });

  it('should handle warning with paths', () => {
    const { lastFrame } = render(
      <WarningMessage text="Missing: /etc/config" />,
    );
    expect(lastFrame()).toContain('/etc/config');
  });

  it('should handle warning with URLs', () => {
    const { lastFrame } = render(
      <WarningMessage text="See: https://example.com" />,
    );
    expect(lastFrame()).toContain('https://example.com');
  });
});
