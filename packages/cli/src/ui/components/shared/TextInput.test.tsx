/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../../test-utils/render.js';
import { waitFor } from '../../../test-utils/async.js';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { act } from 'react';
import { TextInput } from './TextInput.js';
import { useKeypress } from '../../hooks/useKeypress.js';
import { useTextBuffer, type TextBuffer } from './text-buffer.js';

// Mocks
vi.mock('../../hooks/useKeypress.js', () => ({
  useKeypress: vi.fn(),
}));

vi.mock('./text-buffer.js', () => {
  const mockTextBuffer = {
    text: '',
    lines: [''],
    cursor: [0, 0],
    visualCursor: [0, 0],
    viewportVisualLines: [''],
    handleInput: vi.fn((key) => {
      // Simulate basic input for testing
      if (key.sequence) {
        mockTextBuffer.text += key.sequence;
        mockTextBuffer.viewportVisualLines = [mockTextBuffer.text];
        mockTextBuffer.visualCursor[1] = mockTextBuffer.text.length;
      } else if (key.name === 'backspace') {
        mockTextBuffer.text = mockTextBuffer.text.slice(0, -1);
        mockTextBuffer.viewportVisualLines = [mockTextBuffer.text];
        mockTextBuffer.visualCursor[1] = mockTextBuffer.text.length;
      } else if (key.name === 'left') {
        mockTextBuffer.visualCursor[1] = Math.max(
          0,
          mockTextBuffer.visualCursor[1] - 1,
        );
      } else if (key.name === 'right') {
        mockTextBuffer.visualCursor[1] = Math.min(
          mockTextBuffer.text.length,
          mockTextBuffer.visualCursor[1] + 1,
        );
      }
    }),
    setText: vi.fn((newText, cursorPosition) => {
      mockTextBuffer.text = newText;
      mockTextBuffer.viewportVisualLines = [newText];
      if (typeof cursorPosition === 'number') {
        mockTextBuffer.visualCursor[1] = cursorPosition;
      } else if (cursorPosition === 'start') {
        mockTextBuffer.visualCursor[1] = 0;
      } else {
        mockTextBuffer.visualCursor[1] = newText.length;
      }
    }),
  };

  return {
    useTextBuffer: vi.fn(() => mockTextBuffer as unknown as TextBuffer),
    TextBuffer: vi.fn(() => mockTextBuffer as unknown as TextBuffer),
  };
});

const mockedUseKeypress = useKeypress as Mock;
const mockedUseTextBuffer = useTextBuffer as Mock;

describe('TextInput', () => {
  const onCancel = vi.fn();
  const onSubmit = vi.fn();
  let mockBuffer: TextBuffer;

  beforeEach(() => {
    vi.resetAllMocks();
    // Reset the internal state of the mock buffer for each test
    const buffer = {
      text: '',
      lines: [''],
      cursor: [0, 0],
      visualCursor: [0, 0],
      viewportVisualLines: [''],
      handleInput: vi.fn((key) => {
        if (key.sequence) {
          buffer.text += key.sequence;
          buffer.viewportVisualLines = [buffer.text];
          buffer.visualCursor[1] = buffer.text.length;
        } else if (key.name === 'backspace') {
          buffer.text = buffer.text.slice(0, -1);
          buffer.viewportVisualLines = [buffer.text];
          buffer.visualCursor[1] = buffer.text.length;
        } else if (key.name === 'left') {
          buffer.visualCursor[1] = Math.max(0, buffer.visualCursor[1] - 1);
        } else if (key.name === 'right') {
          buffer.visualCursor[1] = Math.min(
            buffer.text.length,
            buffer.visualCursor[1] + 1,
          );
        }
      }),
      setText: vi.fn((newText, cursorPosition) => {
        buffer.text = newText;
        buffer.viewportVisualLines = [newText];
        if (typeof cursorPosition === 'number') {
          buffer.visualCursor[1] = cursorPosition;
        } else if (cursorPosition === 'start') {
          buffer.visualCursor[1] = 0;
        } else {
          buffer.visualCursor[1] = newText.length;
        }
      }),
    };
    mockBuffer = buffer as unknown as TextBuffer;
    mockedUseTextBuffer.mockReturnValue(mockBuffer);
  });

  it('renders with an initial value', async () => {
    const buffer = {
      text: 'test',
      lines: ['test'],
      cursor: [0, 4],
      visualCursor: [0, 4],
      viewportVisualLines: ['test'],
      handleInput: vi.fn(),
      setText: vi.fn(),
    };
    const { lastFrame, waitUntilReady, unmount } = render(
      <TextInput
        buffer={buffer as unknown as TextBuffer}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />,
    );
    await waitUntilReady();
    expect(lastFrame()).toContain('test');
    unmount();
  });

  it('renders a placeholder', async () => {
    const buffer = {
      text: '',
      lines: [''],
      cursor: [0, 0],
      visualCursor: [0, 0],
      viewportVisualLines: [''],
      handleInput: vi.fn(),
      setText: vi.fn(),
    };
    const { lastFrame, waitUntilReady, unmount } = render(
      <TextInput
        buffer={buffer as unknown as TextBuffer}
        placeholder="testing"
        onSubmit={onSubmit}
        onCancel={onCancel}
      />,
    );
    await waitUntilReady();
    expect(lastFrame()).toContain('testing');
    unmount();
  });

  it('handles character input', async () => {
    const { waitUntilReady, unmount } = render(
      <TextInput buffer={mockBuffer} onSubmit={onSubmit} onCancel={onCancel} />,
    );
    await waitUntilReady();
    const keypressHandler = mockedUseKeypress.mock.calls[0][0];

    await act(async () => {
      keypressHandler({
        name: 'a',
        shift: false,
        alt: false,
        ctrl: false,
        cmd: false,
        sequence: 'a',
      });
    });
    await waitUntilReady();

    expect(mockBuffer.handleInput).toHaveBeenCalledWith({
      name: 'a',
      shift: false,
      alt: false,
      ctrl: false,
      cmd: false,
      sequence: 'a',
    });
    expect(mockBuffer.text).toBe('a');
    unmount();
  });

  it('handles backspace', async () => {
    mockBuffer.setText('test');
    const { waitUntilReady, unmount } = render(
      <TextInput buffer={mockBuffer} onSubmit={onSubmit} onCancel={onCancel} />,
    );
    await waitUntilReady();
    const keypressHandler = mockedUseKeypress.mock.calls[0][0];

    await act(async () => {
      keypressHandler({
        name: 'backspace',
        shift: false,
        alt: false,
        ctrl: false,
        cmd: false,
        sequence: '',
      });
    });
    await waitUntilReady();

    expect(mockBuffer.handleInput).toHaveBeenCalledWith({
      name: 'backspace',
      shift: false,
      alt: false,
      ctrl: false,
      cmd: false,
      sequence: '',
    });
    expect(mockBuffer.text).toBe('tes');
    unmount();
  });

  it('handles left arrow', async () => {
    mockBuffer.setText('test');
    const { waitUntilReady, unmount } = render(
      <TextInput buffer={mockBuffer} onSubmit={onSubmit} onCancel={onCancel} />,
    );
    await waitUntilReady();
    const keypressHandler = mockedUseKeypress.mock.calls[0][0];

    await act(async () => {
      keypressHandler({
        name: 'left',
        shift: false,
        alt: false,
        ctrl: false,
        cmd: false,
        sequence: '',
      });
    });
    await waitUntilReady();

    // Cursor moves from end to before 't'
    expect(mockBuffer.visualCursor[1]).toBe(3);
    unmount();
  });

  it('handles right arrow', async () => {
    mockBuffer.setText('test');
    mockBuffer.visualCursor[1] = 2; // Set initial cursor for right arrow test
    const { waitUntilReady, unmount } = render(
      <TextInput buffer={mockBuffer} onSubmit={onSubmit} onCancel={onCancel} />,
    );
    await waitUntilReady();
    const keypressHandler = mockedUseKeypress.mock.calls[0][0];

    await act(async () => {
      keypressHandler({
        name: 'right',
        shift: false,
        alt: false,
        ctrl: false,
        cmd: false,
        sequence: '',
      });
    });
    await waitUntilReady();

    expect(mockBuffer.visualCursor[1]).toBe(3);
    unmount();
  });

  it('calls onSubmit on return', async () => {
    mockBuffer.setText('test');
    const { waitUntilReady, unmount } = render(
      <TextInput buffer={mockBuffer} onSubmit={onSubmit} onCancel={onCancel} />,
    );
    await waitUntilReady();
    const keypressHandler = mockedUseKeypress.mock.calls[0][0];

    await act(async () => {
      keypressHandler({
        name: 'return',
        shift: false,
        alt: false,
        ctrl: false,
        cmd: false,
        sequence: '',
      });
    });
    await waitUntilReady();

    expect(onSubmit).toHaveBeenCalledWith('test');
    unmount();
  });

  it('calls onCancel on escape', async () => {
    vi.useFakeTimers();
    const { waitUntilReady, unmount } = render(
      <TextInput buffer={mockBuffer} onCancel={onCancel} onSubmit={onSubmit} />,
    );
    await waitUntilReady();
    const keypressHandler = mockedUseKeypress.mock.calls[0][0];

    await act(async () => {
      keypressHandler({
        name: 'escape',
        shift: false,
        alt: false,
        ctrl: false,
        cmd: false,
        sequence: '',
      });
    });
    // Escape key has a 50ms timeout in KeypressContext, so we need to wrap waitUntilReady in act
    await act(async () => {
      await waitUntilReady();
    });

    await waitFor(() => {
      expect(onCancel).toHaveBeenCalled();
    });
    vi.useRealTimers();
    unmount();
  });

  it('renders the input value', async () => {
    mockBuffer.setText('secret');
    const { lastFrame, waitUntilReady, unmount } = render(
      <TextInput buffer={mockBuffer} onSubmit={onSubmit} onCancel={onCancel} />,
    );
    await waitUntilReady();
    expect(lastFrame()).toContain('secret');
    unmount();
  });

  it('does not show cursor when not focused', async () => {
    mockBuffer.setText('test');
    const { lastFrame, waitUntilReady, unmount } = render(
      <TextInput
        buffer={mockBuffer}
        focus={false}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />,
    );
    await waitUntilReady();
    expect(lastFrame()).not.toContain('\u001b[7m'); // Inverse video chalk
    unmount();
  });

  it('renders multiple lines when text wraps', async () => {
    mockBuffer.text = 'line1\nline2';
    mockBuffer.viewportVisualLines = ['line1', 'line2'];

    const { lastFrame, waitUntilReady, unmount } = render(
      <TextInput buffer={mockBuffer} onSubmit={onSubmit} onCancel={onCancel} />,
    );
    await waitUntilReady();

    expect(lastFrame()).toContain('line1');
    expect(lastFrame()).toContain('line2');
    unmount();
  });
});
