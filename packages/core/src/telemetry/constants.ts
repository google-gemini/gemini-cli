/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from 'crypto';

export const SERVICE_NAME = 'gemini-code';
export const sessionId = randomUUID();

export const EVENT_USER_PROMPT = 'gemini_code.user_prompt';
export const EVENT_TOOL_CALL = 'gemini_code.tool_call';
export const EVENT_API_REQUEST = 'gemini_code.api_request';
export const EVENT_API_ERROR = 'gemini_code.api_error';
export const EVENT_API_RESPONSE = 'gemini_code.api_response';
export const EVENT_CLI_CONFIG = 'gemini_code.config';

export const METRIC_TOOL_CALL_COUNT = 'gemini_code.tool.call.count';
export const METRIC_TOOL_CALL_LATENCY = 'gemini_code.tool.call.latency';
export const METRIC_API_REQUEST_COUNT = 'gemini_code.api.request.count';
export const METRIC_API_REQUEST_LATENCY = 'gemini_code.api.request.latency';
export const METRIC_TOKEN_INPUT_COUNT = 'gemini_code.token.input.count';
export const METRIC_SESSION_COUNT = 'gemini_code.session.count';
