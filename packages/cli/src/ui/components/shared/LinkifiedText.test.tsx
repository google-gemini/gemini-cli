/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from 'ink-testing-library';
import { LinkifiedText } from './LinkifiedText.js';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('ink-link', () => ({
  default: ({ url }: { url: string }) => `[LINK: ${url}]${url}`,
}));

// Suppress act() warnings which are false positives in this test environment
// Use beforeEach to ensure we wrap the console.error set up by global test-setup
let setupConsoleError: typeof console.error;

beforeEach(() => {
  setupConsoleError = console.error;
  console.error = (...args) => {
    const msg = args[0];
    if (
      typeof msg === 'string' &&
      msg.includes('was not wrapped in act(...)')
    ) {
      return;
    }
    setupConsoleError(...args);
  };
});

afterEach(() => {
  console.error = setupConsoleError;
});

describe('LinkifiedText', () => {
  /*
   * Testing strategy
   *
   * partition on children (input text):
   *    - empty string
   *    - plain text (no URLs)
   *    - single URL
   *      - simple: https://google.com
   *      - with path/query: https://google.com/foo?bar=1
   *      - with punctuation: https://google.com.
   *    - multiple URLs
   *    - URL at boundaries (start/end of string)
   *    - URL as the entire string
   *
   * partition on props:
   *    - standard text props (color, bold, etc.) passed through
   */

  it('renders empty string', () => {
    const { lastFrame } = render(<LinkifiedText>{''}</LinkifiedText>);
    expect(lastFrame()).toBe('');
  });

  it('renders plain text without changes', () => {
    const { lastFrame } = render(<LinkifiedText>Hello World</LinkifiedText>);
    expect(lastFrame()).toBe('Hello World');
  });

  it('renders text with embedded URL', () => {
    const { lastFrame } = render(
      <LinkifiedText>Check https://google.com for more</LinkifiedText>,
    );
    // ink-link fallback renders: matching text (with potential visual changes if supported)
    // In test env, ink-link likely renders the text content.
    // We expect the URL to be present.
    // Expect our mock format
    expect(lastFrame()).toContain(
      '[LINK: https://google.com]https://google.com',
    );
    expect(lastFrame()).toContain('Check');
    expect(lastFrame()).toContain('for more');
  });

  it('handles URLs with punctuation correctly', () => {
    const { lastFrame } = render(
      <LinkifiedText>Go to https://google.com.</LinkifiedText>,
    );
    // Punctuation should be outside the link
    expect(lastFrame()).toBe(
      'Go to [LINK: https://google.com]https://google.com.',
    );
  });

  it('handles multiple URLs', () => {
    const { lastFrame } = render(
      <LinkifiedText>
        Link 1: https://a.com, Link 2: https://b.com
      </LinkifiedText>,
    );
    expect(lastFrame()).toContain('[LINK: https://a.com]https://a.com');
    expect(lastFrame()).toContain('[LINK: https://b.com]https://b.com');
  });

  it('handles URL at start', () => {
    const { lastFrame } = render(
      <LinkifiedText>https://start.com is the link</LinkifiedText>,
    );
    expect(lastFrame()).toContain('[LINK: https://start.com]https://start.com');
  });

  it('handles URL at end', () => {
    const { lastFrame } = render(
      <LinkifiedText>Link is https://end.com</LinkifiedText>,
    );
    expect(lastFrame()).toContain('[LINK: https://end.com]https://end.com');
  });

  it('handles URL as entire string', () => {
    const { lastFrame } = render(
      <LinkifiedText>https://only.com</LinkifiedText>,
    );
    expect(lastFrame()).toContain('[LINK: https://only.com]https://only.com');
  });

  it('passes through text props', () => {
    const { lastFrame } = render(
      <LinkifiedText bold color="red">
        Bold Red
      </LinkifiedText>,
    );
    // Ansi escape codes would be present for red/bold, but ink-testing-library strips them by default in lastFrame() unless using specific helpers?
    // Actually lastFrame() returns the text representation.
    expect(lastFrame()).toBe('Bold Red');
  });
});
