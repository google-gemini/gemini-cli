/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../test-utils/render.js';
import { act } from 'react';
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from 'vitest';
import { ValidationDialog } from './ValidationDialog.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';
import type { Key } from '../hooks/useKeypress.js';

// Mock the child components and utilities
vi.mock('./shared/RadioButtonSelect.js', () => ({
  RadioButtonSelect: vi.fn(),
}));

vi.mock('./CliSpinner.js', () => ({
  CliSpinner: vi.fn(() => null),
}));

const mockOpenBrowserSecurely = vi.fn();
const mockShouldLaunchBrowser = vi.fn();

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    openBrowserSecurely: (...args: unknown[]) =>
      mockOpenBrowserSecurely(...args),
    shouldLaunchBrowser: () => mockShouldLaunchBrowser(),
  };
});

// Capture keypress handler to test it
let mockKeypressHandler: (key: Key) => void;
let mockKeypressOptions: { isActive: boolean };

vi.mock('../hooks/useKeypress.js', () => ({
  useKeypress: vi.fn((handler, options) => {
    mockKeypressHandler = handler;
    mockKeypressOptions = options;
  }),
}));

describe('ValidationDialog', () => {
  const mockOnChoice = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockShouldLaunchBrowser.mockReturnValue(true);
    mockOpenBrowserSecurely.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initial render (choosing state)', () => {
    it('should render the main message and two options', () => {
      const { lastFrame, unmount } = render(
        <ValidationDialog onChoice={mockOnChoice} />,
      );

      expect(lastFrame()).toContain(
        'Further action is required to use this service.',
      );
      expect(RadioButtonSelect).toHaveBeenCalledWith(
        expect.objectContaining({
          items: [
            {
              label: 'Verify your account',
              value: 'verify',
              key: 'verify',
            },
            {
              label: 'Change authentication',
              value: 'change_auth',
              key: 'change_auth',
            },
          ],
        }),
        undefined,
      );
      unmount();
    });

    it('should render learn more URL when provided', () => {
      const { lastFrame, unmount } = render(
        <ValidationDialog
          learnMoreUrl="https://example.com/help"
          onChoice={mockOnChoice}
        />,
      );

      expect(lastFrame()).toContain('Learn more:');
      expect(lastFrame()).toContain('https://example.com/help');
      unmount();
    });

    it('should call onChoice with cancel when ESCAPE is pressed', () => {
      const { unmount } = render(<ValidationDialog onChoice={mockOnChoice} />);

      // Verify the keypress hook is active
      expect(mockKeypressOptions.isActive).toBe(true);

      // Simulate ESCAPE key press
      act(() => {
        mockKeypressHandler({
          name: 'escape',
          ctrl: false,
          shift: false,
          alt: false,
          cmd: false,
          insertable: false,
          sequence: '\x1b',
        });
      });

      expect(mockOnChoice).toHaveBeenCalledWith('cancel');
      unmount();
    });
  });

  describe('onChoice handling', () => {
    it('should call onChoice with change_auth when that option is selected', () => {
      const { unmount } = render(<ValidationDialog onChoice={mockOnChoice} />);

      const onSelect = (RadioButtonSelect as Mock).mock.calls[0][0].onSelect;
      act(() => {
        onSelect('change_auth');
      });

      expect(mockOnChoice).toHaveBeenCalledWith('change_auth');
      unmount();
    });

    it('should call onChoice with verify when no validation link is provided', () => {
      const { unmount } = render(<ValidationDialog onChoice={mockOnChoice} />);

      const onSelect = (RadioButtonSelect as Mock).mock.calls[0][0].onSelect;
      act(() => {
        onSelect('verify');
      });

      expect(mockOnChoice).toHaveBeenCalledWith('verify');
      unmount();
    });

    it('should open browser and transition to waiting state when verify is selected with a link', async () => {
      const { lastFrame, unmount } = render(
        <ValidationDialog
          validationLink="https://accounts.google.com/verify"
          onChoice={mockOnChoice}
        />,
      );

      const onSelect = (RadioButtonSelect as Mock).mock.calls[0][0].onSelect;
      await act(async () => {
        await onSelect('verify');
      });

      expect(mockOpenBrowserSecurely).toHaveBeenCalledWith(
        'https://accounts.google.com/verify',
      );
      expect(lastFrame()).toContain('Waiting for verification...');
      unmount();
    });
  });

  describe('headless mode', () => {
    it('should show URL in message when browser cannot be launched', async () => {
      mockShouldLaunchBrowser.mockReturnValue(false);

      const { lastFrame, unmount } = render(
        <ValidationDialog
          validationLink="https://accounts.google.com/verify"
          onChoice={mockOnChoice}
        />,
      );

      const onSelect = (RadioButtonSelect as Mock).mock.calls[0][0].onSelect;
      await act(async () => {
        await onSelect('verify');
      });

      expect(mockOpenBrowserSecurely).not.toHaveBeenCalled();
      expect(lastFrame()).toContain('Please open this URL in a browser:');
      expect(lastFrame()).toContain('https://accounts.google.com/verify');
      unmount();
    });
  });

  describe('error state', () => {
    it('should show error and options when browser fails to open', async () => {
      mockOpenBrowserSecurely.mockRejectedValue(new Error('Browser not found'));

      const { lastFrame, unmount } = render(
        <ValidationDialog
          validationLink="https://accounts.google.com/verify"
          onChoice={mockOnChoice}
        />,
      );

      const onSelect = (RadioButtonSelect as Mock).mock.calls[0][0].onSelect;
      await act(async () => {
        await onSelect('verify');
      });

      expect(lastFrame()).toContain('Browser not found');
      // RadioButtonSelect should be rendered again with options in error state
      expect((RadioButtonSelect as Mock).mock.calls.length).toBeGreaterThan(1);
      unmount();
    });
  });
});
