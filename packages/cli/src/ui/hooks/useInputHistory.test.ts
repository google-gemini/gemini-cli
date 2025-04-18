// packages/cli/src/ui/hooks/useInputHistory.test.ts
import { renderHook, act } from '@testing-library/react';
import { useInput } from 'ink';
import { vi, describe, test, expect, beforeEach, Mock } from 'vitest';
import { useInputHistory } from './useInputHistory.js';

// Mock the useInput hook from Ink
vi.mock('ink', async (importOriginal) => {
  const originalInk = await importOriginal<typeof import('ink')>();
  return {
    ...originalInk, // Keep other exports
    useInput: vi.fn(), // Mock useInput
  };
});

// Helper type for the mocked useInput callback
type UseInputCallback = (input: string, key: any) => void;

describe('useInputHistory Hook', () => {
  let mockUseInputCallback: UseInputCallback | undefined;
  const mockUserMessages = ['msg1', 'msg2', 'msg3']; // Sample history

  beforeEach(() => {
    // Reset the mock before each test and capture the callback
    (useInput as Mock).mockImplementation((callback, options) => {
      // Only store the callback if the hook is active in the test
      if (options?.isActive !== false) {
        mockUseInputCallback = callback;
      } else {
        mockUseInputCallback = undefined;
      }
    });
  });

  // Helper function to simulate key press by invoking the captured callback
  const simulateKeyPress = (key: object, input: string = '') => {
    act(() => {
      if (mockUseInputCallback) {
        mockUseInputCallback(input, key);
      } else {
        // Optionally throw an error if trying to press key when inactive
        // console.warn('Simulated key press while useInput was inactive');
      }
    });
  };

  test('should initialize with empty query', () => {
    const { result } = renderHook(() =>
      useInputHistory({ userMessages: [], isActive: true }),
    );
    expect(result.current.query).toBe('');
  });

  test('up arrow should do nothing if history is empty', () => {
    const { result } = renderHook(() =>
      useInputHistory({ userMessages: [], isActive: true }),
    );
    simulateKeyPress({ upArrow: true });
    expect(result.current.query).toBe('');
  });

  test('up arrow should recall the last message', () => {
    const { result } = renderHook(() =>
      useInputHistory({ userMessages: mockUserMessages, isActive: true }),
    );
    simulateKeyPress({ upArrow: true });
    expect(result.current.query).toBe('msg3'); // Last message
  });

  test('repeated up arrows should navigate history', () => {
    const { result } = renderHook(() =>
      useInputHistory({ userMessages: mockUserMessages, isActive: true }),
    );
    simulateKeyPress({ upArrow: true }); // -> msg3
    simulateKeyPress({ upArrow: true }); // -> msg2
    expect(result.current.query).toBe('msg2');
    simulateKeyPress({ upArrow: true }); // -> msg1
    expect(result.current.query).toBe('msg1');
    simulateKeyPress({ upArrow: true }); // -> stays on msg1
    expect(result.current.query).toBe('msg1');
  });

  test('down arrow should navigate history forward', () => {
    const { result } = renderHook(() =>
      useInputHistory({ userMessages: mockUserMessages, isActive: true }),
    );
    simulateKeyPress({ upArrow: true }); // -> msg3
    simulateKeyPress({ upArrow: true }); // -> msg2
    simulateKeyPress({ upArrow: true }); // -> msg1
    expect(result.current.query).toBe('msg1');

    simulateKeyPress({ downArrow: true }); // -> msg2
    expect(result.current.query).toBe('msg2');
    simulateKeyPress({ downArrow: true }); // -> msg3
    expect(result.current.query).toBe('msg3');
  });

  test('down arrow should restore original query', () => {
    const { result } = renderHook(() =>
      useInputHistory({ userMessages: mockUserMessages, isActive: true }),
    );

    // Set initial query
    act(() => {
      result.current.setQuery('original typing');
    });
    expect(result.current.query).toBe('original typing');

    simulateKeyPress({ upArrow: true }); // -> msg3
    expect(result.current.query).toBe('msg3');

    simulateKeyPress({ downArrow: true }); // -> original typing
    expect(result.current.query).toBe('original typing');

    // Pressing down again should do nothing
    simulateKeyPress({ downArrow: true });
    expect(result.current.query).toBe('original typing');
  });

  test('typing should reset navigation', () => {
    const { result } = renderHook(() =>
      useInputHistory({ userMessages: mockUserMessages, isActive: true }),
    );

    simulateKeyPress({ upArrow: true }); // -> msg3
    expect(result.current.query).toBe('msg3');

    // Simulate typing 'x' (Note: we manually call setQuery here, as useInput is mocked)
    act(() => {
      result.current.setQuery(result.current.query + 'x');
    });
    // Also simulate the input event that would trigger the reset
    simulateKeyPress({}, 'x');
    expect(result.current.query).toBe('msg3x');

    simulateKeyPress({ upArrow: true }); // Should restart navigation -> msg3
    expect(result.current.query).toBe('msg3');
  });

  test('calling resetHistoryNav should clear navigation state', () => {
    const { result } = renderHook(() =>
      useInputHistory({ userMessages: mockUserMessages, isActive: true }),
    );

    // Set initial query and navigate
    act(() => {
      result.current.setQuery('original');
    });
    simulateKeyPress({ upArrow: true }); // -> msg3
    expect(result.current.query).toBe('msg3');

    // Reset
    act(() => {
      result.current.resetHistoryNav();
    });

    // Press down - should restore original query ('original') because nav was reset
    // However, our current resetHistoryNav also clears originalQueryBeforeNav.
    // Let's test that down does nothing because historyIndex is -1
    simulateKeyPress({ downArrow: true });
    expect(result.current.query).toBe('msg3'); // Stays msg3 because downArrow doesn't run when index is -1

    // Press up - should start nav again from the top
    simulateKeyPress({ upArrow: true });
    expect(result.current.query).toBe('msg3');
  });

  test('should not trigger callback if isActive is false', () => {
    renderHook(() =>
      useInputHistory({ userMessages: mockUserMessages, isActive: false }),
    );
    // mockUseInputCallback should be undefined because isActive was false
    expect(mockUseInputCallback).toBeUndefined();
    // Attempting to simulate should not throw error (or check internal state if possible)
    expect(() => simulateKeyPress({ upArrow: true })).not.toThrow();
  });
});
