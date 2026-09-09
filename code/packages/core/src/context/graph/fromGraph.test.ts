/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { fromGraph } from './fromGraph.js';
import { NodeType, type ConcreteNode } from './types.js';
import { NodeIdService } from './nodeIdService.js';

describe('fromGraph', () => {
  it('should reconstruct an empty history from empty nodes', () => {
    expect(fromGraph([])).toEqual([]);
  });

  it('should reconstruct a single turn from a single node', () => {
    const nodes: ConcreteNode[] = [
      {
        id: 'node_1',
        turnId: 'turn_durable_1',
        role: 'user',
        type: NodeType.USER_PROMPT,
        payload: { text: 'hello' },
        timestamp: 100,
      },
    ];

    const history = fromGraph(nodes);
    expect(history).toEqual([
      {
        id: 'durable_1',
        content: {
          role: 'user',
          parts: [{ text: 'hello' }],
        },
      },
    ]);
  });

  it('should coalesce adjacent nodes with the same turnId into a single turn', () => {
    const nodes: ConcreteNode[] = [
      {
        id: 'node_1',
        turnId: 'turn_durable_1',
        role: 'user',
        type: NodeType.USER_PROMPT,
        payload: { text: 'hello' },
        timestamp: 100,
      },
      {
        id: 'node_2',
        turnId: 'turn_durable_1',
        role: 'user',
        type: NodeType.USER_PROMPT,
        payload: { text: 'world' },
        timestamp: 101,
      },
    ];

    const history = fromGraph(nodes);
    expect(history).toEqual([
      {
        id: 'durable_1',
        content: {
          role: 'user',
          parts: [{ text: 'hello' }, { text: 'world' }],
        },
      },
    ]);
  });

  it('should split turns when the role changes', () => {
    const nodes: ConcreteNode[] = [
      {
        id: 'node_1',
        turnId: 'turn_durable_1',
        role: 'user',
        type: NodeType.USER_PROMPT,
        payload: { text: 'hello' },
        timestamp: 100,
      },
      {
        id: 'node_2',
        turnId: 'turn_durable_2',
        role: 'model',
        type: NodeType.AGENT_THOUGHT,
        payload: { text: 'hi' },
        timestamp: 101,
      },
    ];

    const history = fromGraph(nodes);
    expect(history).toEqual([
      {
        id: 'durable_1',
        content: {
          role: 'user',
          parts: [{ text: 'hello' }],
        },
      },
      {
        id: 'durable_2',
        content: {
          role: 'model',
          parts: [{ text: 'hi' }],
        },
      },
    ]);
  });

  it('should split turns when the turnId changes, even if role is the same', () => {
    const nodes: ConcreteNode[] = [
      {
        id: 'node_1',
        turnId: 'turn_durable_1',
        role: 'user',
        type: NodeType.USER_PROMPT,
        payload: { text: 'hello' },
        timestamp: 100,
      },
      {
        id: 'node_2',
        turnId: 'turn_durable_2',
        role: 'user',
        type: NodeType.USER_PROMPT,
        payload: { text: 'world' },
        timestamp: 101,
      },
    ];

    const history = fromGraph(nodes);
    expect(history).toEqual([
      {
        id: 'durable_1',
        content: {
          role: 'user',
          parts: [{ text: 'hello' }],
        },
      },
      {
        id: 'durable_2',
        content: {
          role: 'user',
          parts: [{ text: 'world' }],
        },
      },
    ]);
  });

  it('should correctly strip the turn_ prefix from turnId', () => {
    const nodes: ConcreteNode[] = [
      {
        id: 'node_1',
        turnId: 'turn_my_stable_id_123',
        role: 'user',
        type: NodeType.USER_PROMPT,
        payload: { text: 'hello' },
        timestamp: 100,
      },
    ];

    const history = fromGraph(nodes);
    expect(history[0].id).toBe('my_stable_id_123');
  });

  it('should handle orphan nodes gracefully', () => {
    const nodes: ConcreteNode[] = [
      {
        id: 'node_1',
        role: 'user',
        type: NodeType.USER_PROMPT,
        payload: { text: 'orphan part' },
        timestamp: 100,
      } as unknown as ConcreteNode,
    ];

    const history = fromGraph(nodes);
    expect(history[0].id).toBe('orphan');
    expect(history[0].content.parts).toEqual([{ text: 'orphan part' }]);
  });

  it('should register identities with the NodeIdService if provided', () => {
    const idService = new NodeIdService();
    const payload = { text: 'hello' };
    const nodes: ConcreteNode[] = [
      {
        id: 'node_1',
        turnId: 'turn_1',
        role: 'user',
        type: NodeType.USER_PROMPT,
        payload,
        timestamp: 100,
      },
    ];

    fromGraph(nodes, idService);

    // The payload object reference should map to the node ID
    expect(idService.get(payload)).toBe('node_1');
  });
});
