/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { renderWithProviders } from '../../test-utils/render.js';
import { GoalSelectionPrompt } from './GoalSelectionPrompt.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';

// Mock RadioButtonSelect to test selection behavior
vi.mock('./shared/RadioButtonSelect.js', () => ({
  RadioButtonSelect: vi.fn(() => null),
}));

const MockedRadioButtonSelect = vi.mocked(RadioButtonSelect);

describe('GoalSelectionPrompt', () => {
  const mockOnSelect = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should render single goal and all new options', () => {
    const goals = ['Implementing user authentication'];

    renderWithProviders(
      <GoalSelectionPrompt
        goals={goals}
        onSelect={mockOnSelect}
        terminalWidth={80}
      />,
    );

    // Verify RadioButtonSelect was called with correct items
    expect(MockedRadioButtonSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        items: expect.arrayContaining([
          expect.objectContaining({
            label: 'Implementing user authentication',
            value: 'Implementing user authentication',
          }),
          expect.objectContaining({
            label: 'Auto-compress (default behavior)',
            value: 'auto',
          }),
          expect.objectContaining({
            label: 'Other (specify)',
            value: 'other',
          }),
          expect.objectContaining({
            label: "Don't ask me again",
            value: 'disable',
          }),
          expect.objectContaining({
            label: 'Check in less often',
            value: 'less_frequent',
          }),
        ]),
      }),
      undefined,
    );
  });

  it('should render multiple goals in correct order', () => {
    const goals = [
      'Refactoring API error handling',
      'Implementing rate limiting',
      'Adding request validation',
    ];

    renderWithProviders(
      <GoalSelectionPrompt
        goals={goals}
        onSelect={mockOnSelect}
        terminalWidth={80}
      />,
    );

    const callProps = MockedRadioButtonSelect.mock.calls[0][0];
    const items = callProps.items;

    // Goals should come first, then fixed options
    expect(items[0].label).toBe('Refactoring API error handling');
    expect(items[1].label).toBe('Implementing rate limiting');
    expect(items[2].label).toBe('Adding request validation');
    expect(items[3].value).toBe('auto');
    expect(items[4].value).toBe('other');
    expect(items[5].value).toBe('disable');
    expect(items[6].value).toBe('less_frequent');
  });

  it('should call onSelect with chosen goal when user selects', () => {
    const goals = ['Implementing OAuth', 'Adding JWT support'];

    renderWithProviders(
      <GoalSelectionPrompt
        goals={goals}
        onSelect={mockOnSelect}
        terminalWidth={80}
      />,
    );

    // Get the onSelect callback passed to RadioButtonSelect
    const radioOnSelect = MockedRadioButtonSelect.mock.calls[0][0].onSelect;

    // Simulate user selecting a goal
    radioOnSelect('Implementing OAuth');

    expect(mockOnSelect).toHaveBeenCalledWith('Implementing OAuth');
  });

  it('should call onSelect with "auto" when user selects auto-compress', () => {
    const goals = ['Some goal'];

    renderWithProviders(
      <GoalSelectionPrompt
        goals={goals}
        onSelect={mockOnSelect}
        terminalWidth={80}
      />,
    );

    const radioOnSelect = MockedRadioButtonSelect.mock.calls[0][0].onSelect;
    radioOnSelect('auto');

    expect(mockOnSelect).toHaveBeenCalledWith('auto');
  });

  it('should call onSelect with "other" when user selects Other option', () => {
    const goals = ['Some goal'];

    renderWithProviders(
      <GoalSelectionPrompt
        goals={goals}
        onSelect={mockOnSelect}
        terminalWidth={80}
      />,
    );

    const radioOnSelect = MockedRadioButtonSelect.mock.calls[0][0].onSelect;
    radioOnSelect('other');

    expect(mockOnSelect).toHaveBeenCalledWith('other');
  });

  it('should call onSelect with "disable" when user selects Don\'t ask again', () => {
    const goals = ['Some goal'];

    renderWithProviders(
      <GoalSelectionPrompt
        goals={goals}
        onSelect={mockOnSelect}
        terminalWidth={80}
      />,
    );

    const radioOnSelect = MockedRadioButtonSelect.mock.calls[0][0].onSelect;
    radioOnSelect('disable');

    expect(mockOnSelect).toHaveBeenCalledWith('disable');
  });

  it('should call onSelect with "less_frequent" when user selects Check in less often', () => {
    const goals = ['Some goal'];

    renderWithProviders(
      <GoalSelectionPrompt
        goals={goals}
        onSelect={mockOnSelect}
        terminalWidth={80}
      />,
    );

    const radioOnSelect = MockedRadioButtonSelect.mock.calls[0][0].onSelect;
    radioOnSelect('less_frequent');

    expect(mockOnSelect).toHaveBeenCalledWith('less_frequent');
  });

  it('should handle empty goals array', () => {
    renderWithProviders(
      <GoalSelectionPrompt
        goals={[]}
        onSelect={mockOnSelect}
        terminalWidth={80}
      />,
    );

    const callProps = MockedRadioButtonSelect.mock.calls[0][0];
    const items = callProps.items;

    // Should still have the fixed options
    expect(items).toHaveLength(4);
    expect(items[0].value).toBe('auto');
    expect(items[1].value).toBe('other');
    expect(items[2].value).toBe('disable');
    expect(items[3].value).toBe('less_frequent');
  });

  describe('Safety Valve Mode', () => {
    it('should hide opt-out options when isSafetyValve is true', () => {
      const goals = ['Some goal'];

      renderWithProviders(
        <GoalSelectionPrompt
          goals={goals}
          onSelect={mockOnSelect}
          terminalWidth={80}
          isSafetyValve={true}
        />,
      );

      const callProps = MockedRadioButtonSelect.mock.calls[0][0];
      const items = callProps.items;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const values = items.map((item: any) => item.value);

      // Should NOT include disable and less_frequent options
      expect(values).not.toContain('disable');
      expect(values).not.toContain('less_frequent');

      // Should still include goal, auto, and other
      expect(values).toContain('Some goal');
      expect(values).toContain('auto');
      expect(values).toContain('other');
    });

    it('should show opt-out options when isSafetyValve is false', () => {
      const goals = ['Some goal'];

      renderWithProviders(
        <GoalSelectionPrompt
          goals={goals}
          onSelect={mockOnSelect}
          terminalWidth={80}
          isSafetyValve={false}
        />,
      );

      const callProps = MockedRadioButtonSelect.mock.calls[0][0];
      const items = callProps.items;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const values = items.map((item: any) => item.value);

      // Should include all options including disable and less_frequent
      expect(values).toContain('disable');
      expect(values).toContain('less_frequent');
    });

    it('should show urgent message when isSafetyValve is true', () => {
      const { lastFrame } = renderWithProviders(
        <GoalSelectionPrompt
          goals={['Test goal']}
          onSelect={mockOnSelect}
          terminalWidth={80}
          isSafetyValve={true}
        />,
      );

      // Should show urgent message
      expect(lastFrame()).toContain(
        'Context window nearly full - compression required',
      );
      expect(lastFrame()).toContain(
        'Compressing now to avoid hitting context limits',
      );
    });

    it('should show normal message when isSafetyValve is false', () => {
      const { lastFrame } = renderWithProviders(
        <GoalSelectionPrompt
          goals={['Test goal']}
          onSelect={mockOnSelect}
          terminalWidth={80}
          isSafetyValve={false}
        />,
      );

      // Should show normal message
      expect(lastFrame()).toContain('Context window is filling up');
      expect(lastFrame()).toContain(
        "We'll compress the conversation to free up space",
      );
    });
  });

  describe('Countdown Timer', () => {
    it('should display countdown timer with initial timeout seconds', () => {
      const { lastFrame } = renderWithProviders(
        <GoalSelectionPrompt
          goals={['Test goal']}
          onSelect={mockOnSelect}
          terminalWidth={80}
          timeoutSeconds={30}
        />,
      );

      // Should show the countdown timer
      expect(lastFrame()).toContain('auto in 30s');
    });

    it('should decrement countdown timer each second', () => {
      vi.useFakeTimers();

      const { lastFrame } = renderWithProviders(
        <GoalSelectionPrompt
          goals={['Test goal']}
          onSelect={mockOnSelect}
          terminalWidth={80}
          timeoutSeconds={30}
        />,
      );

      expect(lastFrame()).toContain('auto in 30s');

      // Advance time by 5 seconds
      act(() => {
        vi.advanceTimersByTime(5000);
      });

      expect(lastFrame()).toContain('auto in 25s');
    });

    it('should call onSelect with "auto" when countdown reaches zero', () => {
      vi.useFakeTimers();

      renderWithProviders(
        <GoalSelectionPrompt
          goals={['Test goal']}
          onSelect={mockOnSelect}
          terminalWidth={80}
          timeoutSeconds={5}
        />,
      );

      // Advance time to trigger timeout
      act(() => {
        vi.advanceTimersByTime(5000);
      });

      expect(mockOnSelect).toHaveBeenCalledWith('auto');
    });

    it('should not show countdown timer when timeoutSeconds is not provided', () => {
      const { lastFrame } = renderWithProviders(
        <GoalSelectionPrompt
          goals={['Test goal']}
          onSelect={mockOnSelect}
          terminalWidth={80}
        />,
      );

      // Should not show countdown timer
      expect(lastFrame()).not.toContain('auto in');
    });

    it('should not trigger timeout if user selects before countdown ends', () => {
      vi.useFakeTimers();

      renderWithProviders(
        <GoalSelectionPrompt
          goals={['Test goal']}
          onSelect={mockOnSelect}
          terminalWidth={80}
          timeoutSeconds={30}
        />,
      );

      // User selects before timeout
      const radioOnSelect = MockedRadioButtonSelect.mock.calls[0][0].onSelect;
      radioOnSelect('Test goal');

      // Advance time past timeout
      act(() => {
        vi.advanceTimersByTime(35000);
      });

      // Should only have been called once with the user's selection
      expect(mockOnSelect).toHaveBeenCalledTimes(1);
      expect(mockOnSelect).toHaveBeenCalledWith('Test goal');
    });
  });
});
