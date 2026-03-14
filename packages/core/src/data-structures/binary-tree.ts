/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export class BinaryTreeNode<T> {
  constructor(
    public value: T,
    public left: BinaryTreeNode<T> | null = null,
    public right: BinaryTreeNode<T> | null = null,
  ) {}
}

export class BinarySearchTree<T> {
  private root: BinaryTreeNode<T> | null = null;

  insert(value: T): void {
    const newNode = new BinaryTreeNode(value);

    if (!this.root) {
      this.root = newNode;
      return;
    }

    this.insertNode(this.root, newNode);
  }

  private insertNode(
    node: BinaryTreeNode<T>,
    newNode: BinaryTreeNode<T>,
  ): void {
    if (newNode.value < node.value) {
      if (!node.left) {
        node.left = newNode;
      } else {
        this.insertNode(node.left, newNode);
      }
    } else {
      if (!node.right) {
        node.right = newNode;
      } else {
        this.insertNode(node.right, newNode);
      }
    }
  }

  find(value: T): BinaryTreeNode<T> | null {
    return this.findNode(this.root, value);
  }

  private findNode(
    node: BinaryTreeNode<T> | null,
    value: T,
  ): BinaryTreeNode<T> | null {
    if (!node) {
      return null;
    }

    if (value < node.value) {
      return this.findNode(node.left, value);
    } else if (value > node.value) {
      return this.findNode(node.right, value);
    } else {
      return node;
    }
  }

  inOrderTraversal(): T[] {
    const result: T[] = [];
    this.inOrder(this.root, result);
    return result;
  }

  private inOrder(node: BinaryTreeNode<T> | null, result: T[]): void {
    if (node) {
      this.inOrder(node.left, result);
      result.push(node.value);
      this.inOrder(node.right, result);
    }
  }
}
