/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// This file is for testing the sensitive keyword linter.
const modelToFlag = 'gemini-3.0'; // This should be flagged by the linter.
const anotherModelToFlag = 'gemini-4.0'; // This should also be flagged.
const specificVersionToFlag = 'gemini-1.0 gemini-1.2'; // This should be flagged.

const allowedModel = 'gemini-1.5'; // This should NOT be flagged.
const anotherAllowedModel = 'gemini-2.0'; // This should NOT be flagged.

// Use the variables to avoid unused var errors.
console.log(
  modelToFlag,
  anotherModelToFlag,
  specificVersionToFlag,
  allowedModel,
  anotherAllowedModel,
);
