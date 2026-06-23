/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Firestore,
  FieldValue,
  DocumentReference,
  Transaction,
} from '@google-cloud/firestore';

export class IssuesStore {
  private readonly db: Firestore;
  private readonly collectionName: string;

  constructor(db: Firestore, collectionName: string) {
    this.db = db;
    this.collectionName = collectionName;
  }

  // Generates the standardized Firestore document reference for an issue
  getIssueRef(
    owner: string,
    repo: string,
    issueNumber: number,
  ): DocumentReference {
    const docId = `github_${owner}_${repo}_${issueNumber}`;
    return this.db.collection(this.collectionName).doc(docId);
  }

  // Initializes a new issue document in a transaction
  async createIssue(
    owner: string,
    repo: string,
    issueNumber: number,
    title: string,
  ): Promise<boolean> {
    const docRef = this.getIssueRef(owner, repo, issueNumber);

    return this.db.runTransaction(async (transaction: Transaction) => {
      const snapshot = await transaction.get(docRef);

      if (!snapshot.exists) {
        transaction.set(docRef, {
          status: 'UNTRIAGED',
          triage_attempts: 0,
          workable_spec: {},
          lock: {
            holder: null,
            expires_at: null,
          },
          created_at: FieldValue.serverTimestamp(),
          updated_at: FieldValue.serverTimestamp(),
          github_metadata: {
            owner: owner,
            repo: repo,
            issue_number: issueNumber,
            title: title,
          },
        });
        return true;
      }
      return false;
    });
  }
}
