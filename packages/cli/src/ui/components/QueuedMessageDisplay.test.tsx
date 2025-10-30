/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { render } from '../../test-utils/render.js';
import { QueuedMessageDisplay } from './QueuedMessageDisplay.js';

describe('QueuedMessageDisplay', () => {
  it('renders nothing when message queue is empty', () => {
    const { lastFrame, unmount } = render(
      <QueuedMessageDisplay messageQueue={[]} />,
    );

    expect(lastFrame()).toBe('');
    unmount();
  });

  it('displays single queued message', () => {
    const { lastFrame, unmount } = render(
      <QueuedMessageDisplay messageQueue={['First message']} />,
    );

    const output = lastFrame();
    expect(output).toContain('Queued (press ↑ to edit):');
    expect(output).toContain('First message');
    unmount();
  });

  it('displays multiple queued messages', () => {
    const messageQueue = [
      'First queued message',
      'Second queued message',
      'Third queued message',
    ];

    const { lastFrame, unmount } = render(
      <QueuedMessageDisplay messageQueue={messageQueue} />,
    );

    const output = lastFrame();
    expect(output).toContain('Queued (press ↑ to edit):');
    expect(output).toContain('First queued message');
    expect(output).toContain('Second queued message');
    expect(output).toContain('Third queued message');
    unmount();
  });

  it('shows overflow indicator when more than 3 messages are queued', () => {
    const messageQueue = [
      'Message 1',
      'Message 2',
      'Message 3',
      'Message 4',
      'Message 5',
    ];

    const { lastFrame, unmount } = render(
      <QueuedMessageDisplay messageQueue={messageQueue} />,
    );

    const output = lastFrame();
    expect(output).toContain('Queued (press ↑ to edit):');
    expect(output).toContain('Message 1');
    expect(output).toContain('Message 2');
    expect(output).toContain('Message 3');
    expect(output).toContain('... (+2 more)');
    expect(output).not.toContain('Message 4');
    expect(output).not.toContain('Message 5');
    unmount();
  });

  it('normalizes whitespace in messages', () => {
    const messageQueue = ['Message   with\tmultiple\n  whitespace'];

    const { lastFrame, unmount } = render(
      <QueuedMessageDisplay messageQueue={messageQueue} />,
    );

    const output = lastFrame();
    expect(output).toContain('Queued (press ↑ to edit):');
    expect(output).toContain('Message with multiple whitespace');
    unmount();
  });
});
