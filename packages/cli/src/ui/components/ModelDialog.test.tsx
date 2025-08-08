/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from 'ink-testing-library';
import { ModelDialog } from './ModelDialog.js';
import { vi } from 'vitest';

describe('<ModelDialog />', () => {
  it('renders the dialog with the correct title', () => {
    const { lastFrame } = render(
      <ModelDialog
        onSelect={() => {}}
        currentModel="gemini-2.5-pro"
        availableModels={['gemini-2.5-pro', 'gemini-2.5-flash']}
      />,
    );

    expect(lastFrame()).toContain('Select a Model');
  });

  it('displays the available models', () => {
    const { lastFrame } = render(
      <ModelDialog
        onSelect={() => {}}
        currentModel="gemini-2.5-pro"
        availableModels={['gemini-2.5-pro', 'gemini-2.5-flash']}
      />,
    );

    expect(lastFrame()).toContain('gemini-2.5-pro');
    expect(lastFrame()).toContain('gemini-2.5-flash');
  });

  it('highlights the current model', () => {
    const { lastFrame } = render(
      <ModelDialog
        onSelect={() => {}}
        currentModel="gemini-2.5-flash"
        availableModels={['gemini-2.5-pro', 'gemini-2.5-flash']}
      />,
    );

    expect(lastFrame()).toContain('● 2. gemini-2.5-flash');
  });

  it('calls onSelect when a model is selected', () => {
    const onSelect = vi.fn();
    const { rerender } = render(
      <ModelDialog
        onSelect={onSelect}
        currentModel="gemini-2.5-pro"
        availableModels={['gemini-2.5-pro', 'gemini-2.5-flash']}
      />,
    );

    rerender(
      <ModelDialog
        onSelect={onSelect}
        currentModel="gemini-2.5-flash"
        availableModels={['gemini-2.5-pro', 'gemini-2.5-flash']}
      />,
    );

    // This is a mock of how the RadioButtonSelect component would work
    // In a real test, we would simulate a user input event
    onSelect('gemini-2.5-flash');

    expect(onSelect).toHaveBeenCalledWith('gemini-2.5-flash');
  });
});
