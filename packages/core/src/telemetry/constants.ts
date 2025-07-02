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

export const METRIC_TOOL_CALL_COUNT = 'gemini_cli.tool.call.count';
export const METRIC_TOOL_CALL_LATENCY = 'gemini_cli.tool.call.latency';
export const METRIC_API_REQUEST_COUNT = 'gemini_cli.api.request.count';
export const METRIC_API_REQUEST_LATENCY = 'gemini_cli.api.request.latency';
export const METRIC_TOKEN_USAGE = 'gemini_cli.token.usage';
export const METRIC_SESSION_COUNT = 'gemini_cli.session.count';
export const METRIC_FILE_OPERATION_COUNT = 'gemini_cli.file.operation.count';

// Dynamic prompt system metrics
export const METRIC_WORK_CONTEXT_DETECTION_DURATION = 'gemini_cli.work_context.detection.duration';
export const METRIC_WORK_CONTEXT_DETECTION_SUCCESS = 'gemini_cli.work_context.detection.success';
export const METRIC_WORK_CONTEXT_DETECTION_FAILURE = 'gemini_cli.work_context.detection.failure';
export const METRIC_DYNAMIC_PROMPT_USAGE = 'gemini_cli.dynamic_prompt.usage';
export const METRIC_DETECTED_PROJECT_TYPE = 'gemini_cli.detected.project_type';
export const METRIC_DETECTED_LANGUAGE = 'gemini_cli.detected.language';
export const METRIC_DETECTED_FRAMEWORK = 'gemini_cli.detected.framework';
export const METRIC_PROMPT_GENERATION_DURATION = 'gemini_cli.prompt.generation.duration';
export const METRIC_WORK_CONTEXT_CACHE_HITS = 'gemini_cli.work_context.cache.hits';
