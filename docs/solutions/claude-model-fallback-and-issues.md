# Claude Model Fallback & Reliability Issue Tracker

## Overview

This document tracks problems, root causes, fixes, and verification status for
Claude model integration, LiteLLM proxy routing, retry logic, and fallback
policies in `gemini-cli-claude`.

---

## Issue Log

### Problem 1: Request Traffic Bypassing LiteLLM Proxy

- **Symptom:** LiteLLM request logs contained no failure entries even when model
  calls failed or experienced 529 overload errors.
- **Root Cause:** In `AnthropicContentGenerator`, the constructor checked
  `if (process.env['GOOGLE_CLOUD_PROJECT'])` before checking proxy variables. As
  a result, setting `GOOGLE_CLOUD_PROJECT` forced execution onto the Vertex AI
  SDK path, completely ignoring `ANTHROPIC_BASE_URL` (LiteLLM proxy).
- **Fix:** Updated `anthropicContentGenerator.ts` constructor to check
  `if (baseURL || apiKey)` first. When `ANTHROPIC_BASE_URL` is set, traffic
  routes to LiteLLM direct proxy even if `GOOGLE_CLOUD_PROJECT` is set.
- **Status:** **Fixed & Verified**

---

### Problem 2: Unhandled Transient Model Overload Errors (529 / 503 / 429)

- **Symptom:** Intermittent
  `Error: The model API is currently overloaded and may experience intermittent errors.`
  crashes during high-traffic streams.
- **Root Cause:** Standard streaming requests lacked exponential backoff retry
  wrappers around initial stream creation.
- **Fix:**
  1. Configured SDK client with `maxRetries: 5` (configurable via
     `ANTHROPIC_MAX_RETRIES`).
  2. Wrapped `this.client.messages.create({ stream: true })` inside
     `retryWithBackoff` with exponential delays up to 20 seconds.
- **Status:** **Fixed & Verified**

---

### Problem 3: Disallowed Model Version Downgrades During Fallback

- **Symptom:** Fallback policy previously allowed cross-tier or lower version
  model fallbacks when transient overload occurred.
- **Requirement:** User explicit directive: **Do NOT allow fallback to lower
  version numbers/tiers.**
- **Fix:** Updated `getClaudePolicyChain` in `policyCatalog.ts` to return
  single-model policy chains (`createSingleModelChain(requestedModel)`). Claude
  models now retry on transient errors with sticky retry policies on the exact
  requested model, rather than falling back or degrading to a lower version
  model tier.
- **Status:** **Fixed & Verified**

---

### Problem 4: Visual Indicator for Model Fallbacks

- **Symptom:** Users had no visibility into when a transient fallback or model
  transition took place.
- **Fix:** Added `[MODEL_FALLBACK]` debug logger output in
  `packages/core/src/fallback/handler.ts` to log primary model failure and
  target fallback model transition.
- **Status:** **Fixed & Verified**

---

### Problem 5: Raw Unparsed Anthropic/Vertex `overloaded_error` JSON Output in TUI

- **Symptom:** Terminal interface displayed raw JSON strings:
  `✕ [API Error: {"type":"error","error":{"details":null,"type":"overloaded_error","message":"Overloaded"},"request_id":"req_vrtx_011Ce174vWqcTd9JJRpZbMog"}]`.
- **Root Cause:** `parseAndFormatApiError()` only recognized standard Google API
  error objects (which contain `code` and `status` fields) and fell through to
  raw string printing for Anthropic/Vertex JSON structures.
- **Fix:** Updated `packages/core/src/utils/errorParsing.ts` to strip TUI error
  prefixes (`✕ [API Error: ...]`) and parse Anthropic/Vertex `overloaded_error`
  JSON payloads into clean, human-readable status messages:
  `[API Error: Overloaded (overloaded_error)]\nModel API is currently overloaded. Retrying...`.
- **Status:** **Fixed & Verified**

---

### Problem 6: Dedicated `claude-auto` Policy Chain & Default SDK `maxRetries` Configuration

- **Symptom:** Need explicit policy routing for `claude-auto` / `auto-claude`
  and configurable default SDK retry limits.
- **Fix:**
  1. Updated `getClaudePolicyChain` in `policyCatalog.ts` to handle
     `claude-auto` / `auto-claude` requests via an explicit fallback chain
     (`claude-sonnet-5` -> `claude-opus-5` -> `claude-3-7-sonnet` ->
     `claude-3-opus`).
  2. Updated `anthropicContentGenerator.ts` default SDK `maxRetries` to `0` when
     `ANTHROPIC_MAX_RETRIES` environment variable is omitted.
- **Status:** **Fixed & Verified**

---

### Problem 7: Plain Error Objects Bypassing Transient Retry Loop

- **Symptom:** When model overload errors occur without attached HTTP numeric
  status codes (e.g., standard `Error` objects with message
  `The model API is currently overloaded...`), `isRetryableError` returned
  `false`.
- **Fix:** Updated `isRetryableError` in `packages/core/src/utils/retry.ts` to
  explicitly detect `overloaded`, `overloaded_error`, and `529` in error
  messages as transient retryable errors.
- **Status:** **Fixed & Verified**

---

## Verification Matrix

| Check                     | Command / Harness                                                               | Result                      |
| ------------------------- | ------------------------------------------------------------------------------- | --------------------------- |
| Linting                   | `npm run lint`                                                                  | PASS (0 errors, 0 warnings) |
| Core Package Build        | `npm run build -w @google/gemini-cli-core`                                      | PASS                        |
| Claude Unit Tests         | `npm run test:claude`                                                           | PASS (16/16 passed)         |
| Policy Catalog Unit Tests | `npm test -w @google/gemini-cli-core -- src/availability/policyCatalog.test.ts` | PASS (14/14 passed)         |
| Error Parsing Unit Tests  | `npm test -w @google/gemini-cli-core -- src/utils/errorParsing.test.ts`         | PASS (13/13 passed)         |
