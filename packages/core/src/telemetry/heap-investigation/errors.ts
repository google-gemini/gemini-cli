/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export type HeapInvestigationErrorCode =
  | 'INSPECTOR_UNAVAILABLE'
  | 'SNAPSHOT_CAPTURE_FAILED'
  | 'SNAPSHOT_PARSE_FAILED'
  | 'DOMINATOR_TIMEOUT'
  | 'WORKER_UNAVAILABLE'
  | 'OUTPUT_PATH_TRAVERSAL'
  | 'INVESTIGATION_ABORTED'
  | 'SEA_BUNDLE_FALLBACK'
  | 'UNSUPPORTED_NODE_VERSION';

export class HeapInvestigationError extends Error {
  constructor(
    public readonly code: HeapInvestigationErrorCode,
    message: string,
    public override readonly cause?: Error,
  ) {
    super(message);
    this.name = 'HeapInvestigationError';
  }
}

export class SnapshotCaptureError extends HeapInvestigationError {
  constructor(message: string, cause?: Error) {
    super('SNAPSHOT_CAPTURE_FAILED', message, cause);
    this.name = 'SnapshotCaptureError';
  }
}

export class SnapshotParseError extends HeapInvestigationError {
  constructor(message: string, cause?: Error) {
    super('SNAPSHOT_PARSE_FAILED', message, cause);
    this.name = 'SnapshotParseError';
  }
}

export class DominatorTimeoutError extends HeapInvestigationError {
  constructor(timeoutMs: number) {
    super(
      'DOMINATOR_TIMEOUT',
      `Dominator tree computation timed out after ${timeoutMs}ms. ` +
        `Falling back to BFS retainer analysis.`,
    );
    this.name = 'DominatorTimeoutError';
  }
}

export class PathTraversalError extends HeapInvestigationError {
  constructor(path: string) {
    super(
      'OUTPUT_PATH_TRAVERSAL',
      `Output path "${path}" failed security validation. ` +
        `Path must be within the system temp directory or a user-specified safe directory.`,
    );
    this.name = 'PathTraversalError';
  }
}
