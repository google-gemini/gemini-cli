/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../../test-utils/render.js';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
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
    setText: vi.fn((newText) => {
      mockTextBuffer.text = newText;
      mockTextBuffer.viewportVisualLines = [newText];
      mockTextBuffer.visualCursor[1] = newText.length;
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
      setText: vi.fn((newText) => {
        buffer.text = newText;
        buffer.viewportVisualLines = [newText];
        buffer.visualCursor[1] = newText.length;
      }),
    };
    mockBuffer = buffer as unknown as TextBuffer;
    mockedUseTextBuffer.mockReturnValue(mockBuffer);
  });

  it('renders with an initial value', () => {
    const buffer = {
      text: 'test',
      lines: ['test'],
      cursor: [0, 4],
      visualCursor: [0, 4],
      viewportVisualLines: ['test'],
      handleInput: vi.fn(),
      setText: vi.fn(),
    };
    const { lastFrame } = render(
      <TextInput
        buffer={buffer as unknown as TextBuffer}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />,
    );
    expect(lastFrame()).toContain('test');
  });

  it('renders a placeholder', () => {
    const buffer = {
      text: '',
      lines: [''],
      cursor: [0, 0],
      visualCursor: [0, 0],
      viewportVisualLines: [''],
      handleInput: vi.fn(),
      setText: vi.fn(),
    };
    const { lastFrame } = render(
      <TextInput
        buffer={buffer as unknown as TextBuffer}
        placeholder="testing"
        onSubmit={onSubmit}
        onCancel={onCancel}
      />,
    );
    expect(lastFrame()).toContain('testing');
  });

  it('handles character input', () => {
    render(
      <TextInput buffer={mockBuffer} onSubmit={onSubmit} onCancel={onCancel} />,
    );
    const keypressHandler = mockedUseKeypress.mock.calls[0][0];

    keypressHandler({
      name: 'a',
      sequence: 'a',
      ctrl: false,
      meta: false,
      shift: false,
    });

    expect(mockBuffer.handleInput).toHaveBeenCalledWith({
      name: 'a',
      sequence: 'a',
      ctrl: false,
      meta: false,
      shift: false,
    });
    expect(mockBuffer.text).toBe('a');
  });

  it('handles backspace', () => {
    mockBuffer.setText('test');
    render(
      <TextInput buffer={mockBuffer} onSubmit={onSubmit} onCancel={onCancel} />,
    );
    const keypressHandler = mockedUseKeypress.mock.calls[0][0];

    keypressHandler({
      name: 'backspace',
      sequence: '',
      ctrl: false,
      meta: false,
      shift: false,
    });

    expect(mockBuffer.handleInput).toHaveBeenCalledWith({
      name: 'backspace',
      sequence: '',
      ctrl: false,
      meta: false,
      shift: false,
    });
    expect(mockBuffer.text).toBe('tes');
  });

  it('handles left arrow', () => {
    mockBuffer.setText('test');
    render(
      <TextInput buffer={mockBuffer} onSubmit={onSubmit} onCancel={onCancel} />,
    );
    const keypressHandler = mockedUseKeypress.mock.calls[0][0];

    keypressHandler({
      name: 'left',
      sequence: '',
      ctrl: false,
      meta: false,
      shift: false,
    });

    // Cursor moves from end to before 't'
    expect(mockBuffer.visualCursor[1]).toBe(3);
  });

  it('handles right arrow', () => {
    mockBuffer.setText('test');
    mockBuffer.visualCursor[1] = 2; // Set initial cursor for right arrow test
    render(
      <TextInput buffer={mockBuffer} onSubmit={onSubmit} onCancel={onCancel} />,
    );
    const keypressHandler = mockedUseKeypress.mock.calls[0][0];

    keypressHandler({
      name: 'right',
      sequence: '',
      ctrl: false,
      meta: false,
      shift: false,
    });

    expect(mockBuffer.visualCursor[1]).toBe(3);
  });

  it('calls onSubmit on return', () => {
    mockBuffer.setText('test');
    render(
      <TextInput buffer={mockBuffer} onSubmit={onSubmit} onCancel={onCancel} />,
    );
    const keypressHandler = mockedUseKeypress.mock.calls[0][0];

    keypressHandler({
      name: 'return',
      sequence: '',
      ctrl: false,
      meta: false,
      shift: false,
    });

    expect(onSubmit).toHaveBeenCalledWith('test');
  });

  it('calls onCancel on escape', async () => {
    vi.useFakeTimers();
    render(
      <TextInput buffer={mockBuffer} onCancel={onCancel} onSubmit={onSubmit} />,
    );
    const keypressHandler = mockedUseKeypress.mock.calls[0][0];

    keypressHandler({
      name: 'escape',
      sequence: '',
      ctrl: false,
      meta: false,
      shift: false,
    });
    await vi.runAllTimersAsync();

    expect(onCancel).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('renders the input value', () => {
    mockBuffer.setText('secret');
    const { lastFrame } = render(
      <TextInput buffer={mockBuffer} onSubmit={onSubmit} onCancel={onCancel} />,
    );
    expect(lastFrame()).toContain('secret');
  });

  it('does not show cursor when not focused', () => {
    mockBuffer.setText('test');
    const { lastFrame } = render(
      <TextInput
        buffer={mockBuffer}
        focus={false}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />,
    );
    expect(lastFrame()).not.toContain('\u001b[7m'); // Inverse video chalk
  });

  it('renders multiple lines when text wraps', () => {
    mockBuffer.text = 'line1\nline2';
    mockBuffer.viewportVisualLines = ['line1', 'line2'];

    const { lastFrame } = render(
      <TextInput buffer={mockBuffer} onSubmit={onSubmit} onCancel={onCancel} />,
    );

    expect(lastFrame()).toContain('line1');
    expect(lastFrame()).toContain('line2');
  });
});
