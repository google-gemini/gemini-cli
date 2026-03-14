/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { DoublyLinkedList } from '../doubly-linked-list.js';

describe('DoublyLinkedList', () => {
  it('should append values', () => {
    const list = new DoublyLinkedList<number>();
    list.append(1);
    list.append(2);
    expect(list.toArray()).toEqual([1, 2]);
  });

  it('should prepend values', () => {
    const list = new DoublyLinkedList<number>();
    list.prepend(1);
    list.prepend(2);
    expect(list.toArray()).toEqual([2, 1]);
  });

  it('should find values', () => {
    const list = new DoublyLinkedList<number>();
    list.append(1);
    list.append(2);
    list.append(3);

    const node1 = list.find(1);
    expect(node1?.value).toBe(1);
    expect(node1?.next?.value).toBe(2);
    expect(node1?.prev).toBeNull();

    const node2 = list.find(2);
    expect(node2?.value).toBe(2);
    expect(node2?.prev?.value).toBe(1);
    expect(node2?.next?.value).toBe(3);

    expect(list.find(4)).toBeNull();
  });

  it('should delete values', () => {
    const list = new DoublyLinkedList<number>();
    list.append(1);
    list.append(2);
    list.append(3);
    list.append(2);

    expect(list.delete(2)).toBe(true);
    expect(list.toArray()).toEqual([1, 3]);

    expect(list.delete(1)).toBe(true);
    expect(list.toArray()).toEqual([3]);

    expect(list.delete(3)).toBe(true);
    expect(list.toArray()).toEqual([]);

    expect(list.delete(4)).toBe(false);
  });
});
