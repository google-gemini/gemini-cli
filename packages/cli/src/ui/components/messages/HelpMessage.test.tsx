/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from 'ink-testing-library';
import { describe, it, expect } from 'vitest';
import { HelpMessage } from './HelpMessage.js';

describe('<HelpMessage />', () => {
  it('renders help content with proper structure', () => {
    const content =
      '**Basics:**\n\nSome help text\n\n**Commands:**\n **/test** - test command';
    const { lastFrame } = render(<HelpMessage content={content} />);

    const output = lastFrame();
    expect(output).toContain('Basics:');
    expect(output).toContain('Commands:');
    expect(output).toContain('Some help text');
    expect(output).toContain('/test');
  });

  it('handles empty lines correctly', () => {
    const content = '**Section:**\n\nLine 1\n\nLine 2';
    const { lastFrame } = render(<HelpMessage content={content} />);

    // Should render without errors and include the content
    const output = lastFrame();
    expect(output).toContain('Section:');
    expect(output).toContain('Line 1');
    expect(output).toContain('Line 2');
  });

  it('handles section headers without bold markers', () => {
    const content = '**Keyboard Shortcuts:**\n**Ctrl+L** - clear screen';
    const { lastFrame } = render(<HelpMessage content={content} />);

    const output = lastFrame();
    expect(output).toContain('Keyboard Shortcuts:');
    expect(output).toContain('Ctrl+L');
  });

  it('handles indented subcommands', () => {
    const content =
      ' **/command** - main command\n   **subcommand** - sub command';
    const { lastFrame } = render(<HelpMessage content={content} />);

    const output = lastFrame();
    expect(output).toContain('/command');
    expect(output).toContain('subcommand');
  });

  it('handles regular text without formatting', () => {
    const content = 'Plain text without any formatting';
    const { lastFrame } = render(<HelpMessage content={content} />);

    const output = lastFrame();
    expect(output).toContain('Plain text without any formatting');
  });

  it('renders with border and proper styling', () => {
    const content = '**Test:**\nContent';
    const { lastFrame } = render(<HelpMessage content={content} />);

    const output = lastFrame();
    // Check that it renders within a bordered box (indicated by border characters)
    expect(output).toMatch(/[┌┐└┘─│]/); // Border characters should be present
  });
});
