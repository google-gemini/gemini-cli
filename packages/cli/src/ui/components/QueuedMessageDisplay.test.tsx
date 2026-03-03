/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { render } from '../../test-utils/render.js';
import { QueuedMessageDisplay } from './QueuedMessageDisplay.js';

describe('QueuedMessageDisplay', () => {
  it('renders nothing when message queue is empty', async () => {
    const { lastFrame, waitUntilReady, unmount } = render(
      <QueuedMessageDisplay messageQueue={[]} />,
    );
    await waitUntilReady();

    expect(lastFrame({ allowEmpty: true })).toBe('');
    unmount();
  });

  it('displays single queued message', async () => {
    const { lastFrame, waitUntilReady, unmount } = render(
      <QueuedMessageDisplay messageQueue={['First message']} />,
    );
    await waitUntilReady();

    const output = lastFrame();
    expect(output).toContain('Queued (press ↑ to edit):');
    expect(output).toContain('First message');
    unmount();
  });

  it('displays multiple queued messages', async () => {
    const messageQueue = [
      'First queued message',
      'Second queued message',
      'Third queued message',
    ];

    const { lastFrame, waitUntilReady, unmount } = render(
      <QueuedMessageDisplay messageQueue={messageQueue} />,
    );
    await waitUntilReady();

    const output = lastFrame();
    expect(output).toContain('Queued (press ↑ to edit):');
    expect(output).toContain('First queued message');
    expect(output).toContain('Second queued message');
    expect(output).toContain('Third queued message');
    unmount();
  });

  it('shows overflow indicator when more than 3 messages are queued', async () => {
    const messageQueue = [
      'Message 1',
      'Message 2',
      'Message 3',
      'Message 4',
      'Message 5',
    ];

    const { lastFrame, waitUntilReady, unmount } = render(
      <QueuedMessageDisplay messageQueue={messageQueue} />,
    );
    await waitUntilReady();

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

  it('normalizes whitespace in messages', async () => {
    const messageQueue = ['Message   with\tmultiple\n  whitespace'];

    const { lastFrame, waitUntilReady, unmount } = render(
      <QueuedMessageDisplay messageQueue={messageQueue} />,
    );
    await waitUntilReady();

    const output = lastFrame();
    expect(output).toContain('Queued (press ↑ to edit):');
    expect(output).toContain('Message with multiple whitespace');
    unmount();
  });
});
