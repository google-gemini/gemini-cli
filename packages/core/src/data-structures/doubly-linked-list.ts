/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export class DoublyLinkedListNode<T> {
  constructor(
    public value: T,
    public next: DoublyLinkedListNode<T> | null = null,
    public prev: DoublyLinkedListNode<T> | null = null,
  ) {}
}

export class DoublyLinkedList<T> {
  private head: DoublyLinkedListNode<T> | null = null;
  private tail: DoublyLinkedListNode<T> | null = null;

  append(value: T): void {
    const newNode = new DoublyLinkedListNode(value);

    if (!this.head) {
      this.head = newNode;
      this.tail = newNode;
      return;
    }

    if (this.tail) {
      this.tail.next = newNode;
      newNode.prev = this.tail;
    }
    this.tail = newNode;
  }

  prepend(value: T): void {
    const newNode = new DoublyLinkedListNode(value, this.head);

    if (this.head) {
      this.head.prev = newNode;
    }
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
    let currentNode: DoublyLinkedListNode<T> | null = this.head;

    while (currentNode) {
      if (currentNode.value === value) {
        deleted = true;

        if (currentNode === this.head) {
          this.head = currentNode.next;
          if (this.head) {
            this.head.prev = null;
          } else {
            this.tail = null;
          }
        } else if (currentNode === this.tail) {
          this.tail = currentNode.prev;
          if (this.tail) {
            this.tail.next = null;
          }
        } else {
          const previousNode = currentNode.prev;
          const nextNode = currentNode.next;

          if (previousNode) {
            previousNode.next = nextNode;
          }
          if (nextNode) {
            nextNode.prev = previousNode;
          }
        }
      }
      currentNode = currentNode.next;
    }

    return deleted;
  }

  find(value: T): DoublyLinkedListNode<T> | null {
    if (!this.head) {
      return null;
    }

    let currentNode: DoublyLinkedListNode<T> | null = this.head;

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
