/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { EvalScenario } from '../../types.js';

export const checkAccessControl: EvalScenario = {
  id: 'review-check-access-control',
  name: 'Check Access Control Issues',
  category: 'code-review',
  difficulty: 'hard',
  description:
    'Identify missing authorization checks that allow users to access resources they should not.',
  setupFiles: {
    'src/api.ts': `
export interface User {
  id: string;
  role: 'admin' | 'user';
}

export interface Document {
  id: string;
  ownerId: string;
  content: string;
  isPublic: boolean;
}

const documents: Document[] = [];

export function getDocument(docId: string, _requestingUser: User): Document | null {
  return documents.find(d => d.id === docId) ?? null;
}

export function deleteDocument(docId: string, _requestingUser: User): boolean {
  const index = documents.findIndex(d => d.id === docId);
  if (index >= 0) {
    documents.splice(index, 1);
    return true;
  }
  return false;
}

export function updateDocument(docId: string, content: string, _requestingUser: User): Document | null {
  const doc = documents.find(d => d.id === docId);
  if (doc) {
    doc.content = content;
    return doc;
  }
  return null;
}
`,
  },
  prompt:
    'Review src/api.ts for access control issues. The requestingUser parameter is accepted but never checked. Add proper authorization: only owners and admins should modify/delete documents, and private documents should only be visible to owners and admins.',
  expectedOutcome: {
    fileChanges: [
      {
        path: 'src/api.ts',
        shouldExist: true,
        contentContains: ['role', 'ownerId', 'admin'],
      },
    ],
    outputContains: ['access control'],
  },
  tags: ['access-control', 'authorization', 'security', 'advanced'],
};
