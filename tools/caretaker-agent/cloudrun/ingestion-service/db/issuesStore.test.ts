/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import { IssuesStore } from './issuesStore.js';
import type { Firestore, Transaction } from '@google-cloud/firestore';

describe('IssuesStore', () => {
  let mockTransaction: {
    get: Mock;
    set: Mock;
  };
  let mockDb: Firestore;
  let store: IssuesStore;

  beforeEach(() => {
    // Assign mock read/write methods for transaction
    mockTransaction = {
      get: vi.fn(),
      set: vi.fn(),
    };

    // Mock Firestore client
    mockDb = {
      collection: vi.fn().mockReturnThis(),
      doc: vi.fn().mockReturnValue({}),
      runTransaction: vi
        .fn()
        .mockImplementation((callback: (tx: Transaction) => Promise<unknown>) =>
          callback(mockTransaction as unknown as Transaction),
        ),
    } as unknown as Firestore;

    store = new IssuesStore(mockDb, 'issues-collection');
  });

  it('should initialize a new issue if it does not exist', async () => {
    // The transaction should mock that the document does not exist
    mockTransaction.get.mockResolvedValue({ exists: false });

    const result = await store.createIssue(
      'google',
      'gemini-cli',
      123,
      'Test Title',
    );

    expect(result).toBe(true);
    expect(mockTransaction.get).toHaveBeenCalled();
    expect(mockTransaction.set).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        status: 'UNTRIAGED',
        github_metadata: expect.objectContaining({
          owner: 'google',
          repo: 'gemini-cli',
          issue_number: 123,
          title: 'Test Title',
        }),
      }),
    );
  });

  it('should return false and skip creation if the issue already exists', async () => {
    // The transaction should mock that the document already exists
    mockTransaction.get.mockResolvedValue({ exists: true });

    const result = await store.createIssue(
      'google',
      'gemini-cli',
      123,
      'Test Title',
    );

    expect(result).toBe(false);
    expect(mockTransaction.get).toHaveBeenCalled();
    expect(mockTransaction.set).not.toHaveBeenCalled();
  });
});
