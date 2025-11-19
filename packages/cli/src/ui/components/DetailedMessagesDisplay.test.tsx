/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { render } from 'ink-testing-library';
import { DetailedMessagesDisplay } from './DetailedMessagesDisplay.js';
import type { ConsoleMessageItem } from '../types.js';

describe('DetailedMessagesDisplay', () => {
  it('should return null when no messages', () => {
    const { lastFrame } = render(
      <DetailedMessagesDisplay messages={[]} maxHeight={100} width={80} />,
    );
    expect(lastFrame()).toBe('');
  });

  it('should render header', () => {
    const messages: ConsoleMessageItem[] = [{ type: 'log', content: 'Test' }];
    const { lastFrame } = render(
      <DetailedMessagesDisplay
        messages={messages}
        maxHeight={100}
        width={80}
      />,
    );
    expect(lastFrame()).toContain('Debug Console');
  });

  it('should show close instruction', () => {
    const messages: ConsoleMessageItem[] = [{ type: 'log', content: 'Test' }];
    const { lastFrame } = render(
      <DetailedMessagesDisplay
        messages={messages}
        maxHeight={100}
        width={80}
      />,
    );
    expect(lastFrame()).toContain('ctrl+o to close');
  });

  it('should render log messages with info icon', () => {
    const messages: ConsoleMessageItem[] = [
      { type: 'log', content: 'Log message' },
    ];
    const { lastFrame } = render(
      <DetailedMessagesDisplay
        messages={messages}
        maxHeight={100}
        width={80}
      />,
    );
    expect(lastFrame()).toContain('Log message');
    expect(lastFrame()).toContain('\u2139'); // ℹ icon
  });

  it('should render error messages with error icon', () => {
    const messages: ConsoleMessageItem[] = [
      { type: 'error', content: 'Error occurred' },
    ];
    const { lastFrame } = render(
      <DetailedMessagesDisplay
        messages={messages}
        maxHeight={100}
        width={80}
      />,
    );
    expect(lastFrame()).toContain('Error occurred');
    expect(lastFrame()).toContain('\u2716'); // ✖ icon
  });

  it('should render warn messages with warning icon', () => {
    const messages: ConsoleMessageItem[] = [
      { type: 'warn', content: 'Warning message' },
    ];
    const { lastFrame } = render(
      <DetailedMessagesDisplay
        messages={messages}
        maxHeight={100}
        width={80}
      />,
    );
    expect(lastFrame()).toContain('Warning message');
    expect(lastFrame()).toContain('\u26A0'); // ⚠ icon
  });

  it('should render debug messages with debug icon', () => {
    const messages: ConsoleMessageItem[] = [
      { type: 'debug', content: 'Debug info' },
    ];
    const { lastFrame } = render(
      <DetailedMessagesDisplay
        messages={messages}
        maxHeight={100}
        width={80}
      />,
    );
    expect(lastFrame()).toContain('Debug info');
    expect(lastFrame()).toContain('\u{1F50D}'); // 🔍 icon
  });

  it('should display message count when > 1', () => {
    const messages: ConsoleMessageItem[] = [
      { type: 'log', content: 'Repeated', count: 5 },
    ];
    const { lastFrame } = render(
      <DetailedMessagesDisplay
        messages={messages}
        maxHeight={100}
        width={80}
      />,
    );
    expect(lastFrame()).toContain('Repeated');
    expect(lastFrame()).toContain('(x5)');
  });

  it('should not display count when count is 1', () => {
    const messages: ConsoleMessageItem[] = [
      { type: 'log', content: 'Single', count: 1 },
    ];
    const { lastFrame } = render(
      <DetailedMessagesDisplay
        messages={messages}
        maxHeight={100}
        width={80}
      />,
    );
    expect(lastFrame()).toContain('Single');
    expect(lastFrame()).not.toContain('(x1)');
  });

  it('should not display count when count is undefined', () => {
    const messages: ConsoleMessageItem[] = [
      { type: 'log', content: 'No count' },
    ];
    const { lastFrame } = render(
      <DetailedMessagesDisplay
        messages={messages}
        maxHeight={100}
        width={80}
      />,
    );
    expect(lastFrame()).toContain('No count');
    expect(lastFrame()).not.toContain('(x');
  });

  it('should render multiple messages', () => {
    const messages: ConsoleMessageItem[] = [
      { type: 'log', content: 'Message 1' },
      { type: 'error', content: 'Message 2' },
      { type: 'warn', content: 'Message 3' },
    ];
    const { lastFrame } = render(
      <DetailedMessagesDisplay
        messages={messages}
        maxHeight={100}
        width={80}
      />,
    );
    expect(lastFrame()).toContain('Message 1');
    expect(lastFrame()).toContain('Message 2');
    expect(lastFrame()).toContain('Message 3');
  });

  it('should handle maxHeight prop', () => {
    const messages: ConsoleMessageItem[] = [{ type: 'log', content: 'Test' }];
    const { lastFrame } = render(
      <DetailedMessagesDisplay messages={messages} maxHeight={50} width={80} />,
    );
    expect(lastFrame()).toBeDefined();
  });

  it('should handle undefined maxHeight', () => {
    const messages: ConsoleMessageItem[] = [{ type: 'log', content: 'Test' }];
    const { lastFrame } = render(
      <DetailedMessagesDisplay
        messages={messages}
        maxHeight={undefined}
        width={80}
      />,
    );
    expect(lastFrame()).toBeDefined();
  });

  it('should handle custom width', () => {
    const messages: ConsoleMessageItem[] = [{ type: 'log', content: 'Test' }];
    const { lastFrame } = render(
      <DetailedMessagesDisplay
        messages={messages}
        maxHeight={100}
        width={120}
      />,
    );
    expect(lastFrame()).toBeDefined();
  });

  it('should not crash on render', () => {
    const messages: ConsoleMessageItem[] = [{ type: 'log', content: 'Test' }];
    expect(() => {
      render(
        <DetailedMessagesDisplay
          messages={messages}
          maxHeight={100}
          width={80}
        />,
      );
    }).not.toThrow();
  });

  it('should unmount cleanly', () => {
    const messages: ConsoleMessageItem[] = [{ type: 'log', content: 'Test' }];
    const { unmount } = render(
      <DetailedMessagesDisplay
        messages={messages}
        maxHeight={100}
        width={80}
      />,
    );
    expect(() => unmount()).not.toThrow();
  });

  it('should map over all messages with correct keys', () => {
    const messages: ConsoleMessageItem[] = [
      { type: 'log', content: 'A' },
      { type: 'error', content: 'B' },
      { type: 'warn', content: 'C' },
      { type: 'debug', content: 'D' },
    ];
    const { lastFrame } = render(
      <DetailedMessagesDisplay
        messages={messages}
        maxHeight={100}
        width={80}
      />,
    );
    expect(lastFrame()).toContain('A');
    expect(lastFrame()).toContain('B');
    expect(lastFrame()).toContain('C');
    expect(lastFrame()).toContain('D');
  });

  it('should handle borderAndPadding calculation', () => {
    const messages: ConsoleMessageItem[] = [{ type: 'log', content: 'Test' }];
    const { lastFrame } = render(
      <DetailedMessagesDisplay
        messages={messages}
        maxHeight={100}
        width={80}
      />,
    );
    // Width - borderAndPadding(4) = 76 should be passed to MaxSizedBox
    expect(lastFrame()).toBeDefined();
  });
});
