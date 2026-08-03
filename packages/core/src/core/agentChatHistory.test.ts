/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { AgentChatHistory, type HistoryTurn } from './agentChatHistory.js';

describe('AgentChatHistory', () => {
  const dummyTurns: HistoryTurn[] = [
    {
      id: 'turn-1',
      content: { role: 'user', parts: [{ text: 'Hello' }] },
    },
    {
      id: 'turn-2',
      content: { role: 'model', parts: [{ text: 'Hi there' }] },
    },
    {
      id: 'turn-3',
      content: { role: 'user', parts: [{ text: 'How are you?' }] },
    },
  ];

  it('should initialize with empty history by default', () => {
    const history = new AgentChatHistory();
    expect(history.length).toBe(0);
    expect(history.get()).toEqual([]);
  });

  it('should initialize with provided turns', () => {
    const history = new AgentChatHistory(dummyTurns);
    expect(history.length).toBe(3);
    expect(history.get()).toEqual(dummyTurns);
  });

  it('should push new turns', () => {
    const history = new AgentChatHistory();
    history.push(dummyTurns[0]);
    expect(history.length).toBe(1);
    expect(history.get()[0]).toEqual(dummyTurns[0]);
  });

  it('should set and overwrite history turns', () => {
    const history = new AgentChatHistory(dummyTurns.slice(0, 1));
    expect(history.length).toBe(1);
    history.set(dummyTurns);
    expect(history.length).toBe(3);
    expect(history.get()).toEqual(dummyTurns);
  });

  it('should clear history', () => {
    const history = new AgentChatHistory(dummyTurns);
    expect(history.length).toBe(3);
    history.clear();
    expect(history.length).toBe(0);
    expect(history.get()).toEqual([]);
  });

  describe('rollback', () => {
    it('should roll back history to a specified length', () => {
      const history = new AgentChatHistory(dummyTurns);
      history.rollback(1);
      expect(history.length).toBe(1);
      expect(history.get()).toEqual([dummyTurns[0]]);
    });

    it('should roll back to 0', () => {
      const history = new AgentChatHistory(dummyTurns);
      history.rollback(0);
      expect(history.length).toBe(0);
      expect(history.get()).toEqual([]);
    });

    it('should do nothing if rollback length is out of bounds (negative)', () => {
      const history = new AgentChatHistory(dummyTurns);
      history.rollback(-1);
      expect(history.length).toBe(3);
      expect(history.get()).toEqual(dummyTurns);
    });

    it('should do nothing if rollback length is out of bounds (greater than current history length)', () => {
      const history = new AgentChatHistory(dummyTurns);
      history.rollback(5);
      expect(history.length).toBe(3);
      expect(history.get()).toEqual(dummyTurns);
    });
  });

  it('should return raw Content array via getContents()', () => {
    const history = new AgentChatHistory(dummyTurns);
    expect(history.getContents()).toEqual(
      dummyTurns.map((turn) => turn.content),
    );
  });

  it('should support mapping and flatMapping operations', () => {
    const history = new AgentChatHistory(dummyTurns);
    const mappedIds = history.map((turn) => turn.id);
    expect(mappedIds).toEqual(['turn-1', 'turn-2', 'turn-3']);

    const flatMappedParts = history.flatMap((turn) => turn.content.parts || []);
    expect(flatMappedParts).toEqual([
      { text: 'Hello' },
      { text: 'Hi there' },
      { text: 'How are you?' },
    ]);
  });
});
