/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export enum CompressionStatus {
  /** The compression was not necessary and no action was taken */
  NOOP,

  /** The compression was successful */
  COMPRESSED,

  /** The compression failed due to the compression inflating the token count */
  COMPRESSION_FAILED_INFLATED_TOKEN_COUNT,

  /** The compression failed due to an error counting tokens */
  COMPRESSION_FAILED_TOKEN_COUNT_ERROR,

  /** The compression failed because the summary was empty */
  COMPRESSION_FAILED_EMPTY_SUMMARY,

  /** The compression was skipped due to previous failure, but content was truncated to budget */
  CONTENT_TRUNCATED,
}

export interface ChatCompressionInfo {
  originalTokenCount: number;
  newTokenCount: number;
  compressionStatus: CompressionStatus;
}
