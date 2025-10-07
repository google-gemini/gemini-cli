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
export const EVENT_EXTENSION_DISABLE = 'gemini_cli.extension_disable';
export const EVENT_EXTENSION_ENABLE = 'gemini_cli.extension_enable';
export const EVENT_EXTENSION_INSTALL = 'gemini_cli.extension_install';
export const EVENT_EXTENSION_UNINSTALL = 'gemini_cli.extension_uninstall';
export const EVENT_FLASH_FALLBACK = 'gemini_cli.flash_fallback';
export const EVENT_RIPGREP_FALLBACK = 'gemini_cli.ripgrep_fallback';
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
export const EVENT_FILE_OPERATION = 'gemini_cli.file_operation';
export const EVENT_TOOL_OUTPUT_TRUNCATED = 'gemini_cli.tool_output_truncated';
export const EVENT_MODEL_SLASH_COMMAND = 'gemini_cli.slash_command.model';
export const EVENT_SMART_EDIT_STRATEGY = 'gemini_cli.smart_edit.strategy';
export const EVENT_MODEL_ROUTING = 'gemini_cli.model_routing';
export const EVENT_SMART_EDIT_CORRECTION = 'gemini_cli.smart_edit.correction';

// Performance Events
export const EVENT_STARTUP_PERFORMANCE = 'gemini_cli.startup.performance';
export const EVENT_MEMORY_USAGE = 'gemini_cli.memory.usage';
export const EVENT_PERFORMANCE_BASELINE = 'gemini_cli.performance.baseline';
export const EVENT_PERFORMANCE_REGRESSION = 'gemini_cli.performance.regression';
