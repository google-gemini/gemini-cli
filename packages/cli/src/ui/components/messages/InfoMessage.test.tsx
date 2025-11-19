/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { InfoMessage } from './InfoMessage.js';

vi.mock('../../utils/InlineMarkdownRenderer.js', () => ({
  RenderInline: ({ text }: { text: string }) => text,
}));

describe('InfoMessage', () => {
  it('should render info prefix', () => {
    const { lastFrame } = render(<InfoMessage text="Information" />);
    expect(lastFrame()).toContain('ℹ');
  });

  it('should render info text', () => {
    const { lastFrame } = render(<InfoMessage text="Server started" />);
    expect(lastFrame()).toContain('Server started');
  });

  it('should handle empty text', () => {
    const { lastFrame } = render(<InfoMessage text="" />);
    expect(lastFrame()).toContain('ℹ');
  });

  it('should render complete info message', () => {
    const infoText = 'Configuration loaded';
    const { lastFrame } = render(<InfoMessage text={infoText} />);
    const output = lastFrame();
    expect(output).toContain('ℹ');
    expect(output).toContain(infoText);
  });

  it('should handle long info messages', () => {
    const longInfo = 'B'.repeat(100);
    const { lastFrame } = render(<InfoMessage text={longInfo} />);
    expect(lastFrame()).toContain('B');
  });

  it('should unmount cleanly', () => {
    const { unmount } = render(<InfoMessage text="test info" />);
    expect(() => unmount()).not.toThrow();
  });

  it('should handle special characters', () => {
    const { lastFrame } = render(<InfoMessage text="Version: 1.0.0-beta" />);
    expect(lastFrame()).toContain('1.0.0-beta');
  });

  it('should render with markdown support', () => {
    const { lastFrame } = render(<InfoMessage text="**bold** text" />);
    expect(lastFrame()).toContain('bold');
  });

  it('should handle info with numbers', () => {
    const { lastFrame } = render(<InfoMessage text="Port: 3000" />);
    expect(lastFrame()).toContain('Port: 3000');
  });

  it('should not crash on render', () => {
    expect(() => {
      render(<InfoMessage text="info message" />);
    }).not.toThrow();
  });

  it('should display info symbol', () => {
    const { lastFrame } = render(<InfoMessage text="Info" />);
    expect(lastFrame()).toContain('ℹ');
  });

  it('should handle multiline text', () => {
    const { lastFrame } = render(<InfoMessage text="Line 1\nLine 2" />);
    expect(lastFrame()).toContain('Line');
  });

  it('should render inline markdown', () => {
    const { lastFrame } = render(<InfoMessage text="Code: `value`" />);
    expect(lastFrame()).toContain('Code:');
  });

  it('should handle info with paths', () => {
    const { lastFrame } = render(
      <InfoMessage text="Config: ~/.config/app.json" />,
    );
    expect(lastFrame()).toContain('~/.config/app.json');
  });
});
