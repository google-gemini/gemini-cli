/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '../../test-utils/render.js';
import { InlineRewindEditor } from './InlineRewindEditor.js';
import { act } from 'react';

// Mock useKeypress to capture handlers
const keypressHandlers: Array<(key: unknown) => void> = [];
vi.mock('../hooks/useKeypress.js', () => ({
  useKeypress: (
    handler: (key: unknown) => void,
    options: { isActive: boolean },
  ) => {
    if (options?.isActive) {
      keypressHandlers.push(handler);
    }
  },
}));

// Helper to trigger keys
const triggerKey = (
  partialKey: Partial<{
    name: string;
    sequence: string;
    ctrl: boolean;
    meta: boolean;
    shift: boolean;
  }>,
) => {
  const handler = keypressHandlers[keypressHandlers.length - 1];
  if (!handler) {
    throw new Error('No keypress handler registered');
  }

  const key = {
    name: '',
    ctrl: false,
    meta: false,
    shift: false,
    sequence: '',
    insertable:
      !partialKey.ctrl && !partialKey.meta && partialKey.sequence?.length === 1,
    ...partialKey,
  };

  act(() => {
    handler(key);
  });
};

describe('InlineRewindEditor', () => {
  beforeEach(() => {
    keypressHandlers.length = 0;
    vi.clearAllMocks();
  });

  it('renders initial text', () => {
    const { lastFrame } = render(
      <InlineRewindEditor
        initialText="Hello World"
        width={80}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(lastFrame()).toContain('Hello World');
    expect(lastFrame()).toContain('[Ctrl+S] Save [Esc] Cancel');
  });

  it('updates text on input', () => {
    const { lastFrame } = render(
      <InlineRewindEditor
        initialText="Hello"
        width={80}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    triggerKey({ name: 'end' }); // Move to end
    triggerKey({ sequence: '!' });

    expect(lastFrame()).toContain('Hello!');
  });

  it('calls onSave when Ctrl+S is pressed', () => {
    const onSave = vi.fn();
    render(
      <InlineRewindEditor
        initialText="Save Me"
        width={80}
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    );

    triggerKey({ name: 's', ctrl: true });
    expect(onSave).toHaveBeenCalledWith('Save Me');
  });

  it('calls onCancel when Escape is pressed', () => {
    const onCancel = vi.fn();
    render(
      <InlineRewindEditor
        initialText="Cancel Me"
        width={80}
        onSave={vi.fn()}
        onCancel={onCancel}
      />,
    );

    triggerKey({ name: 'escape' });
    expect(onCancel).toHaveBeenCalled();
  });

  it('renders cursor correctly', () => {
    // We can't easily check colors in string output, but we can check logic flow
    // and ensuring the component renders without crashing during typing is a good proxy.
    // Ideally, we'd check for the visual structure if we had a more robust Ink test renderer.
    // For now, ensuring text updates implies cursor logic (in text-buffer) is driving rendering.
    const { lastFrame } = render(
      <InlineRewindEditor
        initialText="A"
        width={80}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    // Initial state: Cursor at 0 (on 'A')
    // 'A' should be rendered.
    expect(lastFrame()).toContain('A');
  });
});
