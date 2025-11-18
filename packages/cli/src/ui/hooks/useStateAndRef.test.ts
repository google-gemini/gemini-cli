/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useStateAndRef } from './useStateAndRef.js';

describe('useStateAndRef', () => {
  describe('initialization', () => {
    it('should initialize with provided value', () => {
      const initialValue = { count: 0 };
      const { result } = renderHook(() => useStateAndRef(initialValue));

      const [state] = result.current;
      expect(state).toEqual(initialValue);
    });

    it('should initialize ref with same value', () => {
      const initialValue = { count: 0 };
      const { result } = renderHook(() => useStateAndRef(initialValue));

      const [, ref] = result.current;
      expect(ref.current).toEqual(initialValue);
    });

    it('should work with string values', () => {
      const { result } = renderHook(() => useStateAndRef('test'));

      const [state, ref] = result.current;
      expect(state).toBe('test');
      expect(ref.current).toBe('test');
    });

    it('should work with number values', () => {
      const { result } = renderHook(() => useStateAndRef(42));

      const [state, ref] = result.current;
      expect(state).toBe(42);
      expect(ref.current).toBe(42);
    });

    it('should work with null', () => {
      const { result } = renderHook(() => useStateAndRef(null));

      const [state, ref] = result.current;
      expect(state).toBeNull();
      expect(ref.current).toBeNull();
    });

    it('should work with undefined', () => {
      const { result } = renderHook(() => useStateAndRef(undefined));

      const [state, ref] = result.current;
      expect(state).toBeUndefined();
      expect(ref.current).toBeUndefined();
    });
  });

  describe('setState with direct value', () => {
    it('should update both state and ref', () => {
      const { result } = renderHook(() => useStateAndRef({ count: 0 }));

      act(() => {
        const [, , setState] = result.current;
        setState({ count: 1 });
      });

      const [state, ref] = result.current;
      expect(state).toEqual({ count: 1 });
      expect(ref.current).toEqual({ count: 1 });
    });

    it('should update string state', () => {
      const { result } = renderHook(() => useStateAndRef('initial'));

      act(() => {
        const [, , setState] = result.current;
        setState('updated');
      });

      const [state, ref] = result.current;
      expect(state).toBe('updated');
      expect(ref.current).toBe('updated');
    });

    it('should update number state', () => {
      const { result } = renderHook(() => useStateAndRef(0));

      act(() => {
        const [, , setState] = result.current;
        setState(100);
      });

      const [state, ref] = result.current;
      expect(state).toBe(100);
      expect(ref.current).toBe(100);
    });
  });

  describe('setState with callback function', () => {
    it('should use current ref value when updating with function', () => {
      const { result } = renderHook(() => useStateAndRef({ count: 0 }));

      act(() => {
        const [, , setState] = result.current;
        setState((prev) => ({ count: prev.count + 1 }));
      });

      const [state] = result.current;
      expect(state).toEqual({ count: 1 });
    });

    it('should support multiple sequential updates', () => {
      const { result } = renderHook(() => useStateAndRef(0));

      act(() => {
        const [, , setState] = result.current;
        setState((prev) => prev + 1);
        setState((prev) => prev + 1);
        setState((prev) => prev + 1);
      });

      const [state, ref] = result.current;
      expect(state).toBe(3);
      expect(ref.current).toBe(3);
    });

    it('should use most recent ref value in callback', () => {
      const { result } = renderHook(() => useStateAndRef({ count: 0 }));

      act(() => {
        const [, , setState] = result.current;
        // First update
        setState({ count: 5 });
        // Second update should use ref value of 5
        setState((prev) => ({ count: prev.count * 2 }));
      });

      const [state] = result.current;
      expect(state).toEqual({ count: 10 });
    });
  });

  describe('ref synchronization', () => {
    it('should keep ref and state in sync', () => {
      const { result } = renderHook(() => useStateAndRef({ value: 'test' }));

      act(() => {
        const [, , setState] = result.current;
        setState({ value: 'updated' });
      });

      const [state, ref] = result.current;
      expect(state).toEqual(ref.current);
    });

    it('should update ref before setState completes', () => {
      const { result } = renderHook(() => useStateAndRef(0));

      act(() => {
        const [, ref, setState] = result.current;
        setState((prev) => {
          // At this point, ref should still be accessible
          expect(prev).toBe(ref.current);
          return prev + 1;
        });
      });
    });
  });

  describe('setter function stability', () => {
    it('should return same setter function on re-renders', () => {
      const { result, rerender } = renderHook(() => useStateAndRef(0));

      const [, , initialSetter] = result.current;
      rerender();
      const [, , afterRerenderSetter] = result.current;

      expect(initialSetter).toBe(afterRerenderSetter);
    });
  });

  describe('complex scenarios', () => {
    it('should handle rapid state changes', () => {
      const { result } = renderHook(() => useStateAndRef({ count: 0 }));

      act(() => {
        const [, , setState] = result.current;
        for (let i = 0; i < 10; i++) {
          setState((prev) => ({ count: prev.count + 1 }));
        }
      });

      const [state, ref] = result.current;
      expect(state.count).toBe(10);
      expect(ref.current.count).toBe(10);
    });

    it('should work with nested objects', () => {
      const initial = { user: { name: 'John', age: 30 } };
      const { result } = renderHook(() => useStateAndRef(initial));

      act(() => {
        const [, , setState] = result.current;
        setState({ user: { name: 'Jane', age: 25 } });
      });

      const [state, ref] = result.current;
      expect(state.user.name).toBe('Jane');
      expect(ref.current.user.name).toBe('Jane');
    });

    it('should handle updating to same value', () => {
      const value = { data: 'test' };
      const { result } = renderHook(() => useStateAndRef(value));

      act(() => {
        const [, , setState] = result.current;
        setState(value);
      });

      const [state, ref] = result.current;
      expect(state).toBe(value);
      expect(ref.current).toBe(value);
    });
  });

  describe('return value structure', () => {
    it('should return array with 3 elements', () => {
      const { result } = renderHook(() => useStateAndRef(0));

      expect(Array.isArray(result.current)).toBe(true);
      expect(result.current).toHaveLength(3);
    });

    it('should return state as first element', () => {
      const { result } = renderHook(() => useStateAndRef('test'));

      const [state] = result.current;
      expect(state).toBe('test');
    });

    it('should return ref as second element', () => {
      const { result } = renderHook(() => useStateAndRef('test'));

      const [, ref] = result.current;
      expect(ref).toHaveProperty('current');
    });

    it('should return setter as third element', () => {
      const { result } = renderHook(() => useStateAndRef('test'));

      const [, , setter] = result.current;
      expect(typeof setter).toBe('function');
    });
  });
});
