/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useHistory } from './useHistoryManager.js';
import { HistoryItem } from '../types.js';

describe('useHistoryManager', () => {
  it('should initialize with an empty history', () => {
    const { result } = renderHook(() => useHistory());
    expect(result.current.history).toEqual([]);
  });

  it('should add an item to history with a unique ID', () => {
    const { result } = renderHook(() => useHistory());
    const timestamp = Date.now();
    const itemData: Omit<HistoryItem, 'id'> = {
      type: 'user', // Replaced HistoryItemType.User
      text: 'Hello',
    };

    act(() => {
      result.current.addItem(itemData, timestamp);
    });

    expect(result.current.history).toHaveLength(1);
    expect(result.current.history[0]).toEqual(
      expect.objectContaining({
        ...itemData,
        id: expect.any(Number),
      }),
    );
    // Basic check that ID incorporates timestamp
    expect(result.current.history[0].id).toBeGreaterThanOrEqual(timestamp);
  });

  it('should generate unique IDs for items added with the same base timestamp', () => {
    const { result } = renderHook(() => useHistory());
    const timestamp = Date.now();
    const itemData1: Omit<HistoryItem, 'id'> = {
      type: 'user', // Replaced HistoryItemType.User
      text: 'First',
    };
    const itemData2: Omit<HistoryItem, 'id'> = {
      type: 'gemini', // Replaced HistoryItemType.Gemini
      text: 'Second',
    };

    let id1!: number;
    let id2!: number;

    act(() => {
      id1 = result.current.addItem(itemData1, timestamp);
      id2 = result.current.addItem(itemData2, timestamp);
    });

    expect(result.current.history).toHaveLength(2);
    expect(id1).not.toEqual(id2);
    expect(result.current.history[0].id).toEqual(id1);
    expect(result.current.history[1].id).toEqual(id2);
    // IDs should be sequential based on the counter
    expect(id2).toBeGreaterThan(id1);
  });

  it('should update an existing history item', () => {
    const { result } = renderHook(() => useHistory());
    const timestamp = Date.now();
    const initialItem: Omit<HistoryItem, 'id'> = {
      type: 'gemini', // Replaced HistoryItemType.Gemini
      text: 'Initial content',
    };
    let itemId!: number;

    act(() => {
      itemId = result.current.addItem(initialItem, timestamp);
    });

    const updatedText = 'Updated content';
    act(() => {
      result.current.updateItem(itemId, { text: updatedText });
    });

    expect(result.current.history).toHaveLength(1);
    expect(result.current.history[0]).toEqual({
      ...initialItem,
      id: itemId,
      text: updatedText,
    });
  });

  it('should not change history if updateHistoryItem is called with a nonexistent ID', () => {
    const { result } = renderHook(() => useHistory());
    const timestamp = Date.now();
    const itemData: Omit<HistoryItem, 'id'> = {
      type: 'user', // Replaced HistoryItemType.User
      text: 'Hello',
    };

    act(() => {
      result.current.addItem(itemData, timestamp);
    });

    const originalHistory = [...result.current.history]; // Clone before update attempt

    act(() => {
      result.current.updateItem(99999, { text: 'Should not apply' }); // Nonexistent ID
    });

    expect(result.current.history).toEqual(originalHistory);
  });

  it('should clear the history', () => {
    const { result } = renderHook(() => useHistory());
    const timestamp = Date.now();
    const itemData1: Omit<HistoryItem, 'id'> = {
      type: 'user', // Replaced HistoryItemType.User
      text: 'First',
    };
    const itemData2: Omit<HistoryItem, 'id'> = {
      type: 'gemini', // Replaced HistoryItemType.Gemini
      text: 'Second',
    };

    act(() => {
      result.current.addItem(itemData1, timestamp);
      result.current.addItem(itemData2, timestamp);
    });

    expect(result.current.history).toHaveLength(2);

    act(() => {
      result.current.clearItems();
    });

    expect(result.current.history).toEqual([]);
  });

  it('should not add consecutive duplicate user messages', () => {
    const { result } = renderHook(() => useHistory());
    const timestamp = Date.now();
    const itemData1: Omit<HistoryItem, 'id'> = {
      type: 'user', // Replaced HistoryItemType.User
      text: 'Duplicate message',
    };
    const itemData2: Omit<HistoryItem, 'id'> = {
      type: 'user', // Replaced HistoryItemType.User
      text: 'Duplicate message',
    };
    const itemData3: Omit<HistoryItem, 'id'> = {
      type: 'gemini', // Replaced HistoryItemType.Gemini
      text: 'Gemini response',
    };
    const itemData4: Omit<HistoryItem, 'id'> = {
      type: 'user', // Replaced HistoryItemType.User
      text: 'Another user message',
    };

    act(() => {
      result.current.addItem(itemData1, timestamp);
      result.current.addItem(itemData2, timestamp + 1); // Same text, different timestamp
      result.current.addItem(itemData3, timestamp + 2);
      result.current.addItem(itemData4, timestamp + 3);
    });

    expect(result.current.history).toHaveLength(3);
    expect(result.current.history[0].text).toBe('Duplicate message');
    expect(result.current.history[1].text).toBe('Gemini response');
    expect(result.current.history[2].text).toBe('Another user message');
  });

  it('should add duplicate user messages if they are not consecutive', () => {
    const { result } = renderHook(() => useHistory());
    const timestamp = Date.now();
    const itemData1: Omit<HistoryItem, 'id'> = {
      type: 'user', // Replaced HistoryItemType.User
      text: 'Message 1',
    };
    const itemData2: Omit<HistoryItem, 'id'> = {
      type: 'gemini', // Replaced HistoryItemType.Gemini
      text: 'Gemini response',
    };
    const itemData3: Omit<HistoryItem, 'id'> = {
      type: 'user', // Replaced HistoryItemType.User
      text: 'Message 1', // Duplicate text, but not consecutive
    };

    act(() => {
      result.current.addItem(itemData1, timestamp);
      result.current.addItem(itemData2, timestamp + 1);
      result.current.addItem(itemData3, timestamp + 2);
    });

    expect(result.current.history).toHaveLength(3);
    expect(result.current.history[0].text).toBe('Message 1');
    expect(result.current.history[1].text).toBe('Gemini response');
    expect(result.current.history[2].text).toBe('Message 1');
  });
});
