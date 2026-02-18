/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { MarkdownDisplay } from './MarkdownDisplay.js';
import { RenderInline } from './InlineMarkdownRenderer.js';
import { renderWithProviders } from '../../test-utils/render.js';

describe('Markdown ReDoS Protection', () => {
  const baseProps = {
    isPending: false,
    terminalWidth: 80,
    availableTerminalHeight: 40,
  };

  it('horizontal rule regex should not be vulnerable to ReDoS', () => {
    // Problematic pattern: many dashes followed by something that doesn't match
    const payload = ' ' + '- '.repeat(100) + 'x';

    const startTime = Date.now();
    renderWithProviders(<MarkdownDisplay {...baseProps} text={payload} />);
    const duration = Date.now() - startTime;

    // Should be very fast (well under 100ms)
    expect(duration).toBeLessThan(500);
  });

  it('table separator regex should not be vulnerable to ReDoS', () => {
    // Original vulnerable regex: /^\s*\|?\s*(:?-+:?)\s*(\|\s*(:?-+:?)\s*)+\|?\s*$/
    // Payload that causes exponential backtracking in vulnerable regex
    const payload = '|' + '---'.repeat(50) + ' ';

    const startTime = Date.now();
    renderWithProviders(<MarkdownDisplay {...baseProps} text={payload} />);
    const duration = Date.now() - startTime;

    expect(duration).toBeLessThan(500);
  });

  it('inline markdown regex for links should not be vulnerable to ReDoS', () => {
    // Original vulnerable regex: \[.*?\]\(.*?\)
    // Problematic payload for non-greedy match with nested-like structure
    const payload = '[' + '[]'.repeat(100) + ')(a';

    const startTime = Date.now();
    renderWithProviders(<RenderInline text={payload} />);
    const duration = Date.now() - startTime;

    expect(duration).toBeLessThan(500);
  });

  it('inline markdown regex for code should not be vulnerable to ReDoS', () => {
    // Original vulnerable regex: `+.+?`+
    const payload = '`'.repeat(50) + ' '.repeat(100) + 'not-a-closing-backtick';

    const startTime = Date.now();
    renderWithProviders(<RenderInline text={payload} />);
    const duration = Date.now() - startTime;

    expect(duration).toBeLessThan(500);
  });
});
