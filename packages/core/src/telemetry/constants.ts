/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export const SERVICE_NAME = 'gemini-cli';

export const EVENT_USER_PROMPT = 'gemini_cli.user_prompt';
export const EVENT_TOOL_CALL = 'gemini_cli.tool_call';
export const EVENT_API_REQUEST = 'gemini_cli.api_request';
export const EVENT_API_ERROR = 'gemini_cli.api_error';
export const EVENT_API_RESPONSE = 'gemini_cli.api_response';
export const EVENT_CLI_CONFIG = 'gemini_cli.config';
export const EVENT_FLASH_FALLBACK = 'gemini_cli.flash_fallback';
export const EVENT_NEXT_SPEAKER_CHECK = 'gemini_cli.next_speaker_check';
export const EVENT_SLASH_COMMAND = 'gemini_cli.slash_command';
export const EVENT_IDE_CONNECTION = 'gemini_cli.ide_connection';
export const EVENT_CONVERSATION_FINISHED = 'gemini_cli.conversation_finished';
export const EVENT_CHAT_COMPRESSION = 'gemini_cli.chat_compression';
export const EVENT_MALFORMED_JSON_RESPONSE =
  'gemini_cli.malformed_json_response';
export const EVENT_INVALID_CHUNK = 'gemini_cli.chat.invalid_chunk';
export const EVENT_CONTENT_RETRY = 'gemini_cli.chat.content_retry';
export const EVENT_CONTENT_RETRY_FAILURE =
  'gemini_cli.chat.content_retry_failure';

export const METRIC_TOOL_CALL_COUNT = 'gemini_cli.tool.call.count';
export const METRIC_TOOL_CALL_LATENCY = 'gemini_cli.tool.call.latency';
export const METRIC_API_REQUEST_COUNT = 'gemini_cli.api.request.count';
export const METRIC_API_REQUEST_LATENCY = 'gemini_cli.api.request.latency';
export const METRIC_TOKEN_USAGE = 'gemini_cli.token.usage';
export const METRIC_SESSION_COUNT = 'gemini_cli.session.count';
export const METRIC_FILE_OPERATION_COUNT = 'gemini_cli.file.operation.count';
export const METRIC_INVALID_CHUNK_COUNT = 'gemini_cli.chat.invalid_chunk.count';
export const METRIC_CONTENT_RETRY_COUNT = 'gemini_cli.chat.content_retry.count';
export const METRIC_CONTENT_RETRY_FAILURE_COUNT =
  'gemini_cli.chat.content_retry_failure.count';
