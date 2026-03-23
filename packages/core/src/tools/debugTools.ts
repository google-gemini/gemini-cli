/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @deprecated Import from './debug/index.js' instead.
 *
 * This file is kept for backward compatibility. All debug tool
 * implementations have been split into individual files under
 * the `./debug/` directory following the repo's one-file-per-tool
 * convention.
 */

export {
  DebugLaunchTool,
  DebugSetBreakpointTool,
  DebugGetStackTraceTool,
  DebugGetVariablesTool,
  DebugStepTool,
  DebugEvaluateTool,
  DebugDisconnectTool,
  DebugAttachTool,
  DebugSetFunctionBreakpointTool,
} from './debug/index.js';
