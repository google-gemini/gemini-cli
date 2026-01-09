# Gemini CLI gateway architecture (detailed)

This document describes the request pipeline, where the gateway URL is applied,
and how to troubleshoot routing changes.

## System overview (components)

```
+----------------------------------------------------------------------------------+
|                                   Gemini CLI                                     |
|                                                                                  |
|  CLI entrypoint (packages/cli)                                                   |
|  - loads settings + env                                                          |w
|  - chooses auth mode                                                             |
|  - builds Config object                                                          |
+-----------------------------------+----------------------------------------------+
                                    |
                                    v
+----------------------------------------------------------------------------------+
| createContentGenerator (packages/core/src/core/contentGenerator.ts)              |
| - resolves model + headers                                                      |
| - applies base URL overrides (GEMINI_CLI_* -> GOOGLE_*_BASE_URL)                  |
| - constructs generator                                                          |
+-----------------------------------+----------------------------------------------+
                                    |
                                    v
+----------------------------------------------------------------------------------+
| LoggingContentGenerator (packages/core/src/core/loggingContentGenerator.ts)      |
| - logs request/response/latency                                                  |
| - records serverDetails based on base URL                                        |
+------------------------+---------------------------------------+-----------------+
                         |                                       |
                         v                                       v
+-------------------------------+                 +---------------------------------+
| CodeAssistServer               |                 | GoogleGenAI client              |
| (LOGIN_WITH_GOOGLE / ADC)      |                 | (API key auth for Gemini/Vertex)|
| - internal endpoint routing    |                 | - uses GOOGLE_*_BASE_URL        |
+-------------------------------+                 +---------------------------------+
                         |                                       |
                         v                                       v
+-------------------------------+                 +---------------------------------+
| Google internal services      |                 | Gateway / Base URL               |
| (no custom gateway)           |                 | (your service)                   |
+-------------------------------+                 +---------------------------------+
                                                                 |
                                                                 v
                                     +---------------------------+-----------------+
                                     | Upstream APIs                                |
                                     | - Vertex AI (aiplatform.googleapis.com)      |
                                     | - Gemini API (generativelanguage.googleapis) |
                                     +-----------------------------------------------+
```

## Request flow (API key path)

1. CLI loads config and determines `AuthType`.
2. `createContentGenerator` builds headers and applies gateway env overrides.
3. `LoggingContentGenerator` wraps the downstream generator.
4. `GoogleGenAI` sends HTTP requests to the resolved base URL.
5. The gateway forwards to Vertex AI or Gemini API.
6. Responses stream back through `LoggingContentGenerator` for telemetry.

## Request flow (Google login / ADC path)

1. CLI detects `AuthType.LOGIN_WITH_GOOGLE` or `AuthType.COMPUTE_ADC`.
2. `createCodeAssistContentGenerator` creates a `CodeAssistServer` client.
3. Requests are routed through the internal Code Assist server.
4. Gateway env vars are not used in this path.

## Base URL resolution (gateway + overrides)

```
                               +------------------------------+
                               | Base URL resolution          |
                               +------------------------------+
                                 | (Gemini API key?) (Vertex?)
                                 v
                 +---------------------------------------------+
                 | If Vertex: resolveVertexBaseUrl()           |
                 | If Gemini: resolveGeminiBaseUrl()           |
                 +---------------------------+-----------------+
                                             |
                                             v
                +---------------------------------------------------------------+
                | Priority order                                               |
                | - Gemini: GEMINI_CLI_GEMINI_BASE_URL                          |
                |           GEMINI_CLI_GATEWAY_URL                              |
                |           GOOGLE_GEMINI_BASE_URL                              |
                | - Vertex: GEMINI_CLI_VERTEX_BASE_URL                          |
                |           GEMINI_CLI_GATEWAY_URL                              |
                |           GOOGLE_VERTEX_BASE_URL                              |
                +---------------------------------------------------------------+
                                             |
                                             v
                +---------------------------------------------------------------+
                | Normalization                                                  |
                | - If no scheme provided:                                       |
                |   - localhost/127.0.0.1/[::1] -> http://                        |
                |   - otherwise -> https://                                      |
                +---------------------------------------------------------------+
```

## Telemetry and logging details

- Requests are logged before sending (`ApiRequestEvent`).
- Responses and errors are logged with duration, server details, and usage.
- `serverDetails` is derived from the resolved base URL (host + port).
- Streaming responses are aggregated for final telemetry logging.

## Key troubleshooting locations

- Routing + base URL overrides: `packages/core/src/core/contentGenerator.ts`
- Server address reporting: `packages/core/src/core/loggingContentGenerator.ts`
- Env resolution + normalization: `packages/core/src/utils/baseUrlUtils.ts`
- Gateway setup instructions: `how-to-configure.md`

## Common failure points

- Missing auth env vars (no API key, missing project/location for Vertex).
- Gateway URL missing scheme or not reachable.
- Gateway forwarding to the wrong upstream API.
- Mis-matched model + auth type (Vertex vs Gemini).
