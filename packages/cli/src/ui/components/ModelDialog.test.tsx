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

  it('calls onSelect when a model is selected via keyboard down arrow', async () => {
    const onSelect = vi.fn();
    const { stdin } = render(
      <ModelDialog
        onSelect={onSelect}
        currentModel="gemini-2.5-pro"
        availableModels={['gemini-2.5-pro', 'gemini-2.5-flash']}
      />,
    );

    // Initial selection is 'gemini-2.5-pro' (index 0).
    // Press down arrow to move to 'gemini-2.5-flash' (index 1).
    stdin.write('\u001B[B');

    // THE FIX: Wait for the event loop to tick and React to re-render.
    // This gives the component time to process the down-arrow state change.
    await new Promise((resolve) => setTimeout(resolve, 100)); // 100ms is a safe delay

    // Press Enter to select.
    stdin.write('\r');

    expect(onSelect).toHaveBeenCalledWith('gemini-2.5-flash');
  });

  it('selects the correct model when the user presses a number', async () => {
    const onSelect = vi.fn();

    const { stdin } = render(
      <ModelDialog
        onSelect={onSelect}
        currentModel="gemini-2.5-pro"
        availableModels={['gemini-2.5-pro', 'gemini-2.5-flash']}
      />,
    );

    // Simulate the user pressing the '2' key to select the second model.
    stdin.write('2');

    // Although this is a more direct action, it's still best practice
    // to wait briefly for React to process the state update.
    await new Promise((resolve) => setTimeout(resolve, 100));

    // The component should call onSelect immediately upon a valid number press.
    // The user does not need to press Enter after pressing a number.
    expect(onSelect).toHaveBeenCalledWith('gemini-2.5-flash');
  });
});
