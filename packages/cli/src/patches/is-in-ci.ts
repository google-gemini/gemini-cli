/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// This is a replacement for the `is-in-ci` package that always returns false.
// We are doing this to avoid the issue where `ink` does not render the UI
// when it detects that it is running in a CI environment.
// This is safe because `ink` (and thus `is-in-ci`) is only used in the
// interactive code path of the CLI.
// See issue #1563 for more details.

const isInCi = false;

// eslint-disable-next-line import/no-default-export
export default isInCi;
