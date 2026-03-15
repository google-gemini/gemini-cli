/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { BinarySearchTree } from '../binary-tree.js';

describe('BinarySearchTree', () => {
  it('should insert values and maintain order', () => {
    const tree = new BinarySearchTree<number>();
    tree.insert(5);
    tree.insert(3);
    tree.insert(7);
    tree.insert(1);
    tree.insert(9);
    expect(tree.inOrderTraversal()).toEqual([1, 3, 5, 7, 9]);
  });

  it('should find values', () => {
    const tree = new BinarySearchTree<number>();
    tree.insert(5);
    tree.insert(3);
    tree.insert(7);
    expect(tree.find(3)?.value).toBe(3);
    expect(tree.find(5)?.value).toBe(5);
    expect(tree.find(10)).toBeNull();
  });
});
