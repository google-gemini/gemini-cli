/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export class LinkedListNode<T> {
  constructor(
    public value: T,
    public next: LinkedListNode<T> | null = null,
  ) {}
}

export class LinkedList<T> {
  private head: LinkedListNode<T> | null = null;
  private tail: LinkedListNode<T> | null = null;

  append(value: T): void {
    const newNode = new LinkedListNode(value);

    if (!this.head) {
      this.head = newNode;
      this.tail = newNode;
      return;
    }

    if (this.tail) {
      this.tail.next = newNode;
    }
    this.tail = newNode;
  }

  prepend(value: T): void {
    const newNode = new LinkedListNode(value, this.head);
    this.head = newNode;

    if (!this.tail) {
      this.tail = newNode;
    }
  }

  delete(value: T): boolean {
    if (!this.head) {
      return false;
    }

    let deleted = false;

    // Delete head
    while (this.head && this.head.value === value) {
      this.head = this.head.next;
      deleted = true;
    }

    let currentNode = this.head;

    if (currentNode !== null) {
      while (currentNode.next) {
        if (currentNode.next.value === value) {
          currentNode.next = currentNode.next.next;
          deleted = true;
        } else {
          currentNode = currentNode.next;
        }
      }
    }

    // Check if tail must be updated
    if (this.tail && this.tail.value === value) {
      this.tail = currentNode;
    }

    return deleted;
  }

  find(value: T): LinkedListNode<T> | null {
    if (!this.head) {
      return null;
    }

    let currentNode: LinkedListNode<T> | null = this.head;

    while (currentNode) {
      if (currentNode.value === value) {
        return currentNode;
      }
      currentNode = currentNode.next;
    }

    return null;
  }

  toArray(): T[] {
    const nodes: T[] = [];
    let currentNode = this.head;
    while (currentNode) {
      nodes.push(currentNode.value);
      currentNode = currentNode.next;
    }
    return nodes;
  }
}
