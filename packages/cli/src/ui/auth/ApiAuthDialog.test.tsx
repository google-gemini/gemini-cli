/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../test-utils/render.js';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { ApiAuthDialog } from './ApiAuthDialog.js';
import { useKeypress } from '../hooks/useKeypress.js';
import {
  useTextBuffer,
  type TextBuffer,
} from '../components/shared/text-buffer.js';

// Mocks
vi.mock('../hooks/useKeypress.js', () => ({
  useKeypress: vi.fn(),
}));

vi.mock('../components/shared/text-buffer.js', () => ({
  useTextBuffer: vi.fn(),
}));

vi.mock('../contexts/UIStateContext.js', () => ({
  useUIState: vi.fn(() => ({
    mainAreaWidth: 80,
  })),
}));

const mockedUseKeypress = useKeypress as Mock;
const mockedUseTextBuffer = useTextBuffer as Mock;

describe('ApiAuthDialog', () => {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();
  let mockBuffer: TextBuffer;

  beforeEach(() => {
    vi.resetAllMocks();
    mockBuffer = {
      text: '',
      lines: [''],
      cursor: [0, 0],
      visualCursor: [0, 0],
      viewportVisualLines: [''],
      handleInput: vi.fn(),
      setText: vi.fn((newText) => {
        mockBuffer.text = newText;
        mockBuffer.viewportVisualLines = [newText];
      }),
    } as unknown as TextBuffer;
    mockedUseTextBuffer.mockReturnValue(mockBuffer);
  });

  it('renders correctly', () => {
    const { lastFrame } = render(
      <ApiAuthDialog onSubmit={onSubmit} onCancel={onCancel} />,
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders with a defaultValue', () => {
    render(
      <ApiAuthDialog
        onSubmit={onSubmit}
        onCancel={onCancel}
        defaultValue="test-key"
      />,
    );
    expect(mockedUseTextBuffer).toHaveBeenCalledWith(
      expect.objectContaining({
        initialText: 'test-key',
        viewport: expect.objectContaining({
          height: 4,
        }),
      }),
    );
  });

  it('calls onSubmit when the text input is submitted', () => {
    mockBuffer.text = 'submitted-key';
    render(<ApiAuthDialog onSubmit={onSubmit} onCancel={onCancel} />);
    const keypressHandler = mockedUseKeypress.mock.calls[0][0];

    keypressHandler({
      name: 'return',
      sequence: '\r',
      ctrl: false,
      meta: false,
      shift: false,
      paste: false,
    });

    expect(onSubmit).toHaveBeenCalledWith('submitted-key');
  });

  it('calls onCancel when the text input is cancelled', () => {
    render(<ApiAuthDialog onSubmit={onSubmit} onCancel={onCancel} />);
    const keypressHandler = mockedUseKeypress.mock.calls[0][0];

    keypressHandler({
      name: 'escape',
      sequence: '\u001b',
      ctrl: false,
      meta: false,
      shift: false,
      paste: false,
    });

    expect(onCancel).toHaveBeenCalled();
  });

  it('displays an error message', () => {
    const { lastFrame } = render(
      <ApiAuthDialog
        onSubmit={onSubmit}
        onCancel={onCancel}
        error="Invalid API Key"
      />,
    );

    expect(lastFrame()).toContain('Invalid API Key');
  });
});
