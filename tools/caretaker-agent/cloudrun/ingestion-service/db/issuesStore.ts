/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { FieldValue } from '@google-cloud/firestore';
import type {
  Firestore,
  DocumentReference,
  Transaction,
  Timestamp,
} from '@google-cloud/firestore';

export type IssueStatus =
  | 'UNTRIAGED'
  | 'TRIAGING'
  | 'NEEDS_INFO'
  | 'TRIAGED'
  | 'NEEDS_HUMAN'
  | 'LOW_QUALITY';

export interface IssueDocument {
  status: IssueStatus;
  triage_attempts: number;
  // The ingestion layer does not enforce the schema of workable_spec
  workable_spec: Record<string, unknown>;
  lock: {
    holder: string | null;
    expires_at: Timestamp | FieldValue | null;
  };
  created_at: Timestamp | FieldValue;
  updated_at: Timestamp | FieldValue;
  github_metadata: {
    owner: string;
    repo: string;
    issue_number: number;
    title: string;
  };
}

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

    try {
      return await this.db.runTransaction(async (transaction: Transaction) => {
        const snapshot = await transaction.get(docRef);

        if (!snapshot.exists) {
          const newIssue: IssueDocument = {
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
              owner,
              repo,
              issue_number: issueNumber,
              title,
            },
          };

          transaction.set(docRef, newIssue);
          return true;
        }
        return false;
      });
    } catch (error) {
      console.error(
        'Firestore transaction failed for issue:',
        `${owner}/${repo}#${issueNumber}`,
        error,
      );
      throw error;
    }
  }
}
