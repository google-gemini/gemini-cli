/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export interface CommitAnalysis {
  changedFiles: string[];
  changeType: 'feat' | 'fix' | 'docs' | 'style' | 'refactor' | 'perf' | 'test' | 'build' | 'ci' | 'chore' | 'revert';
  scope?: string;
  purpose: string;
  impact: string;
  hasSensitiveInfo: boolean;
}

export interface CommitMessageParts {
  header: string;
  body?: string;
  footer?: string;
}

export interface AICommitResponse {
  analysis: CommitAnalysis;
  commitMessage: CommitMessageParts;
}

export interface GitState {
  hasStagedChanges: boolean;
  hasUnstagedChanges: boolean;
  hasUntrackedFiles: boolean;
  hasDeletedFiles: boolean;
  hasRenamedFiles: boolean;
  hasConflicts: boolean;
  modifiedFileCount: number;
  addedFileCount: number;
  deletedFileCount: number;
  untrackedFileCount: number;
  stagedFileCount: number;
  unstagedFileCount: number;
  totalChangedFiles: number;
}

export interface CachedCommitData {
  statusOutput: string;
  diffOutput: string;
  logOutput: string;
  commitMessage: string;
  finalCommitMessage: string;
  timestamp: number;
  commitMode: 'staged-only' | 'all-changes';
  indexHash: string;
}

export type CommitMode = 'staged-only' | 'all-changes';

export interface ErrorDetails {
  message: string;
  originalError: Error | null;
}