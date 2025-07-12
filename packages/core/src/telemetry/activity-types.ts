/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Types of user activities that can be tracked
 */
export enum ActivityType {
  USER_INPUT_START = 'user_input_start',
  USER_INPUT_END = 'user_input_end',
  MESSAGE_ADDED = 'message_added',
  TOOL_CALL_SCHEDULED = 'tool_call_scheduled',
  TOOL_CALL_COMPLETED = 'tool_call_completed',
  STREAM_START = 'stream_start',
  STREAM_END = 'stream_end',
  HISTORY_UPDATED = 'history_updated',
  MANUAL_TRIGGER = 'manual_trigger',
}
