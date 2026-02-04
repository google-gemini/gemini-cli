/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// The models that workflow evals should target.
// These workflows (triage, dedup) run in GitHub Actions using the default CLI model.
// We restrict evals to this model to avoid noise from other models in the nightly matrix.
export const WORKFLOW_TARGET_MODELS = ['gemini-2.5-pro'];
