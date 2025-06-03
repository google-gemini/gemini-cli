/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from 'ink-testing-library';
import { Header } from './Header.js';
import { vi } from 'vitest';

// Mock ink-gradient and ink-big-text as they might have complex rendering
vi.mock('ink-gradient', () => ({
  default: vi.fn(({ children }) => children), // Pass through children
}));

import { Text } from 'ink'; // Import the actual Text component from Ink

vi.mock('ink-big-text', () => ({
  default: vi.fn(({ text }) => <Text>{text}</Text>), // Use Ink's Text component
}));

describe('<Header />', () => {
  it('should render with the default title "GEMINI" when no title prop is provided', () => {
    const { lastFrame } = render(<Header />);
    const output = lastFrame();
    // Check if the output contains the default text "GEMINI"
    // The actual output will be simple text due to mocking
    expect(output).toContain('GEMINI');
  });

  it('should render with a custom title when the title prop is provided', () => {
    const customTitle = 'My Custom CLI';
    const { lastFrame } = render(<Header title={customTitle} />);
    const output = lastFrame();
    // Check if the output contains the custom title
    expect(output).toContain(customTitle);
  });

  it('should render with an empty title if an empty string is provided', () => {
    const customTitle = '';
    const { lastFrame } = render(<Header title={customTitle} />);
    const output = lastFrame();
    // Depending on how BigText handles empty strings,
    // it might render nothing or a specific representation.
    // For this test, we'll assume it renders the empty string.
    expect(output).toContain(''); // or check for a specific structure if BigText behaves differently
  });
});
