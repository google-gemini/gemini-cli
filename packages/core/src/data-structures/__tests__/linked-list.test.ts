/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { LinkedList } from '../linked-list.js';

describe('LinkedList', () => {
  it('should append values', () => {
    const list = new LinkedList<number>();
    list.append(1);
    list.append(2);
    expect(list.toArray()).toEqual([1, 2]);
  });

  it('should prepend values', () => {
    const list = new LinkedList<number>();
    list.prepend(1);
    list.prepend(2);
    expect(list.toArray()).toEqual([2, 1]);
  });

  it('should find values', () => {
    const list = new LinkedList<number>();
    list.append(1);
    list.append(2);
    expect(list.find(1)).toBeDefined();
    expect(list.find(3)).toBeNull();
  });

  it('should delete values', () => {
    const list = new LinkedList<number>();
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

  it('should update tail when deleting tail value', () => {
    const list = new LinkedList<number>();
    list.append(1);
    list.append(2);
    list.delete(2);
    list.append(3);
    expect(list.toArray()).toEqual([1, 3]);
  });
});
