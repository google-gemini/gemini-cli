/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderWithProviders } from '../../../test-utils/render.js';
import { waitFor } from '../../../test-utils/async.js';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { act } from 'react';
import { TextInput } from './TextInput.js';
import { useKeypress } from '../../hooks/useKeypress.js';
import { useTextBuffer, type TextBuffer } from './text-buffer.js';
import { useMouseClick } from '../../hooks/useMouseClick.js';

// Mocks
vi.mock('../../hooks/useKeypress.js', () => ({
  useKeypress: vi.fn(),
}));

vi.mock('../../hooks/useMouseClick.js', () => ({
  useMouseClick: vi.fn(),
}));

vi.mock('./text-buffer.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./text-buffer.js')>();
  const mockTextBuffer = {
    text: '',
    lines: [''],
    cursor: [0, 0],
    visualCursor: [0, 0],
    viewportVisualLines: [''],
    handleInput: vi.fn(),
    setText: vi.fn((newText) => {
      mockTextBuffer.text = newText;
      mockTextBuffer.viewportVisualLines = [newText];
    }),
    moveCursor: vi.fn(),
    visualScrollRow: 0,
    viewport: { height: 10, width: 80 },
    pastedContent: {},
    openInExternalEditor: vi.fn(),
    moveToVisualPosition: vi.fn(),
  };

  return {
    ...actual,
    useTextBuffer: vi.fn(() => mockTextBuffer),
  };
});

const mockedUseKeypress = useKeypress as Mock;
const mockedUseTextBuffer = useTextBuffer as Mock;
const mockedUseMouseClick = useMouseClick as Mock;

describe('TextInput', () => {
  const onCancel = vi.fn();
  const onSubmit = vi.fn();
  let mockBuffer: TextBuffer;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the internal state of the mock buffer for each test
    const buffer = {
      text: '',
      lines: [''],
      cursor: [0, 0],
      visualCursor: [0, 0],
      visualScrollRow: 0,
      viewportVisualLines: [''],
      handleInput: vi.fn(),
      setText: vi.fn((newText) => {
        buffer.text = newText;
        buffer.viewportVisualLines = [newText];
      }),
      moveCursor: vi.fn(),
      viewport: { height: 10, width: 80 },
      pastedContent: {},
      openInExternalEditor: vi.fn(),
      moveToVisualPosition: vi.fn(),
    };
    mockBuffer = buffer as unknown as TextBuffer;
    mockedUseTextBuffer.mockReturnValue(mockBuffer);
  });

  it('renders correctly', async () => {
    const buffer = {
      text: 'test',
      lines: ['test'],
      cursor: [0, 4],
      visualCursor: [0, 4],
      visualScrollRow: 0,
      viewportVisualLines: ['test'],
      handleInput: vi.fn(),
      setText: vi.fn(),
    };
    const { lastFrame, unmount } = await renderWithProviders(
      <TextInput
        buffer={buffer as unknown as TextBuffer}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />,
    );
    expect(lastFrame()).toContain('test');
    unmount();
  });

  it('renders a placeholder', async () => {
    const buffer = {
      text: '',
      lines: [''],
      cursor: [0, 0],
      visualCursor: [0, 0],
      visualScrollRow: 0,
      viewportVisualLines: [''],
      handleInput: vi.fn(),
      setText: vi.fn(),
    };
    const { lastFrame, unmount } = await renderWithProviders(
      <TextInput
        buffer={buffer as unknown as TextBuffer}
        placeholder="testing"
        onSubmit={onSubmit}
        onCancel={onCancel}
      />,
    );
    expect(lastFrame()).toContain('testing');
    unmount();
  });

  it('handles character input', async () => {
    const { waitUntilReady, unmount } = await renderWithProviders(
      <TextInput buffer={mockBuffer} onSubmit={onSubmit} onCancel={onCancel} />,
    );
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

    await waitFor(async () => {
      await waitUntilReady();
      expect(mockBuffer.handleInput).toHaveBeenCalledWith(
        expect.objectContaining({
          sequence: 'a',
        }),
      );
    });
    unmount();
  });

  it('handles backspace', async () => {
    mockBuffer.setText('test');
    const { waitUntilReady, unmount } = await renderWithProviders(
      <TextInput buffer={mockBuffer} onSubmit={onSubmit} onCancel={onCancel} />,
    );
    const keypressHandler = mockedUseKeypress.mock.calls[0][0];

    await act(async () => {
      keypressHandler({
        name: 'backspace',
        shift: false,
        alt: false,
        ctrl: false,
        cmd: false,
        sequence: '\u0008',
      });
    });

    await waitFor(async () => {
      await waitUntilReady();
      expect(mockBuffer.handleInput).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'backspace',
        }),
      );
    });
    unmount();
  });

  it('handles left arrow', async () => {
    mockBuffer.setText('test');
    const { waitUntilReady, unmount } = await renderWithProviders(
      <TextInput buffer={mockBuffer} onSubmit={onSubmit} onCancel={onCancel} />,
    );
    const keypressHandler = mockedUseKeypress.mock.calls[0][0];

    await act(async () => {
      keypressHandler({
        name: 'left',
        shift: false,
        alt: false,
        ctrl: false,
        cmd: false,
        sequence: '\u001b[D',
      });
    });

    await waitFor(async () => {
      await waitUntilReady();
      expect(mockBuffer.handleInput).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'left',
        }),
      );
    });
    unmount();
  });

  it('handles right arrow', async () => {
    mockBuffer.setText('test');
    mockBuffer.visualCursor[1] = 2; // Set initial cursor for right arrow test
    const { waitUntilReady, unmount } = await renderWithProviders(
      <TextInput buffer={mockBuffer} onSubmit={onSubmit} onCancel={onCancel} />,
    );
    const keypressHandler = mockedUseKeypress.mock.calls[0][0];

    await act(async () => {
      keypressHandler({
        name: 'right',
        shift: false,
        alt: false,
        ctrl: false,
        cmd: false,
        sequence: '\u001b[C',
      });
    });

    await waitFor(async () => {
      await waitUntilReady();
      expect(mockBuffer.handleInput).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'right',
        }),
      );
    });
    unmount();
  });

  it('calls onSubmit on return', async () => {
    mockBuffer.setText('test');
    const { waitUntilReady, unmount } = await renderWithProviders(
      <TextInput buffer={mockBuffer} onSubmit={onSubmit} onCancel={onCancel} />,
    );
    const keypressHandler = mockedUseKeypress.mock.calls[0][0];

    await act(async () => {
      keypressHandler({
        name: 'enter',
        shift: false,
        alt: false,
        ctrl: false,
        cmd: false,
        sequence: '\r',
      });
    });

    await waitFor(async () => {
      await waitUntilReady();
      expect(onSubmit).toHaveBeenCalledWith('test');
    });
    unmount();
  });

  it('handles paste expanding placeholders on submit', async () => {
    const placeholder = '[Pasted Text: 6 lines]';
    const realContent = 'line1\nline2\nline3\nline4\nline5\nline6';
    mockBuffer.setText(placeholder);
    mockBuffer.pastedContent = { [placeholder]: realContent };
    const { waitUntilReady, unmount } = await renderWithProviders(
      <TextInput buffer={mockBuffer} onSubmit={onSubmit} onCancel={onCancel} />,
    );
    const keypressHandler = mockedUseKeypress.mock.calls[0][0];

    await act(async () => {
      keypressHandler({
        name: 'enter',
        shift: false,
        alt: false,
        ctrl: false,
        cmd: false,
        sequence: '\r',
      });
    });

    await waitFor(async () => {
      await waitUntilReady();
      expect(onSubmit).toHaveBeenCalledWith(realContent);
    });
    unmount();
  });

  it('submits text unchanged when pastedContent is empty', async () => {
    mockBuffer.setText('normal text');
    mockBuffer.pastedContent = {};
    const { waitUntilReady, unmount } = await renderWithProviders(
      <TextInput buffer={mockBuffer} onSubmit={onSubmit} onCancel={onCancel} />,
    );
    const keypressHandler = mockedUseKeypress.mock.calls[0][0];

    await act(async () => {
      keypressHandler({
        name: 'enter',
        shift: false,
        alt: false,
        ctrl: false,
        cmd: false,
        sequence: '\r',
      });
    });

    await waitFor(async () => {
      await waitUntilReady();
      expect(onSubmit).toHaveBeenCalledWith('normal text');
    });
    unmount();
  });

  it('calls onCancel on escape', async () => {
    vi.useFakeTimers();
    const { waitUntilReady, unmount } = await renderWithProviders(
      <TextInput buffer={mockBuffer} onCancel={onCancel} onSubmit={onSubmit} />,
    );
    const keypressHandler = mockedUseKeypress.mock.calls[0][0];

    await act(async () => {
      keypressHandler({
        name: 'escape',
        shift: false,
        alt: false,
        ctrl: false,
        cmd: false,
        sequence: '\u001b',
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
    const { lastFrame, unmount } = await renderWithProviders(
      <TextInput buffer={mockBuffer} onSubmit={onSubmit} onCancel={onCancel} />,
    );
    expect(lastFrame()).toContain('secret');
    unmount();
  });

  it('does not show cursor when not focused', async () => {
    mockBuffer.setText('test');
    const { lastFrame, unmount } = await renderWithProviders(
      <TextInput
        buffer={mockBuffer}
        focus={false}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />,
    );
    expect(lastFrame()).not.toContain('\u001b[7m'); // Inverse video chalk
    unmount();
  });

  it('renders multiple lines when text wraps', async () => {
    mockBuffer.text = 'line1\nline2';
    mockBuffer.viewportVisualLines = ['line1', 'line2'];

    const { lastFrame, unmount } = await renderWithProviders(
      <TextInput buffer={mockBuffer} onSubmit={onSubmit} onCancel={onCancel} />,
    );

    expect(lastFrame()).toContain('line1');
    expect(lastFrame()).toContain('line2');
    unmount();
  });

  it('registers mouse click handler', async () => {
    const { unmount } = await renderWithProviders(
      <TextInput buffer={mockBuffer} onSubmit={onSubmit} onCancel={onCancel} />,
    );

    expect(mockedUseMouseClick).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Function),
      expect.objectContaining({
        isActive: true,
        name: 'left-press',
      }),
    );
    unmount();
  });
});
