# How to configure Gemini CLI with a custom gateway

This guide explains how to point Gemini CLI at a custom HTTP gateway (for
example, `http://localhost:8787`) that forwards requests to Vertex AI or the
Gemini API. It also documents the environment variables involved in routing and
authentication.

## Quick start

### Gemini API key + gateway

```sh
export GEMINI_API_KEY="YOUR_GEMINI_API_KEY"
export GEMINI_CLI_GATEWAY_URL="http://localhost:8787"

gemini
```

### Vertex AI API key + gateway

```sh
export GOOGLE_API_KEY="YOUR_VERTEX_API_KEY"
export GOOGLE_CLOUD_PROJECT="YOUR_GCP_PROJECT_ID"
export GOOGLE_CLOUD_LOCATION="us-central1"
export GEMINI_CLI_GATEWAY_URL="http://localhost:8787"

gemini
```

## Gateway-related environment variables

These variables control which base URL the CLI uses for Gemini or Vertex calls.
The CLI translates these values into the `@google/genai` base URL env vars.

- `GEMINI_CLI_GATEWAY_URL`
  - Applies to both Gemini and Vertex when no more specific override is set.
  - Example: `http://localhost:8787`
- `GEMINI_CLI_GEMINI_BASE_URL`
  - Optional override just for Gemini API requests.
  - Example: `https://my-gemini-gateway.internal`
- `GEMINI_CLI_VERTEX_BASE_URL`
  - Optional override just for Vertex AI requests.
  - Example: `https://my-vertex-gateway.internal`

### Precedence order

When determining the base URL, the CLI uses the first value it finds:

- Gemini: `GEMINI_CLI_GEMINI_BASE_URL` -> `GEMINI_CLI_GATEWAY_URL` ->
  `GOOGLE_GEMINI_BASE_URL`
- Vertex: `GEMINI_CLI_VERTEX_BASE_URL` -> `GEMINI_CLI_GATEWAY_URL` ->
  `GOOGLE_VERTEX_BASE_URL`

### URL format

- Include a scheme (`http://` or `https://`).
- If you omit the scheme for `GEMINI_CLI_*` variables, the CLI assumes:
  - `http://` for `localhost`, `127.0.0.1`, or `[::1]`.
  - `https://` for everything else.

## Authentication variables

You still need to provide the normal authentication variables for the target
API:

- Gemini API key
  - `GEMINI_API_KEY`
- Vertex AI API key
  - `GOOGLE_API_KEY`
  - `GOOGLE_CLOUD_PROJECT`
  - `GOOGLE_CLOUD_LOCATION`

If you use `gcloud auth login` (or ADC), requests are routed through the
internal Code Assist path and do not use the gateway env vars.

## Low-level base URL overrides

If you prefer to set the Google library variables directly, you can use:

- `GOOGLE_GEMINI_BASE_URL`
- `GOOGLE_VERTEX_BASE_URL`

These are read by `@google/genai`. The CLI only writes to these when you set one
of the `GEMINI_CLI_*` gateway variables.

## Optional request controls

These variables are not required for gateway routing, but are often useful:

- `GEMINI_CLI_CUSTOM_HEADERS`
  - Extra headers sent with each request.
  - Example: `X-Trace-Id: abc123, X-Env: local`
- `GEMINI_API_KEY_AUTH_MECHANISM`
  - Set to `bearer` to send the API key as an `Authorization: Bearer` header
    instead of `x-goog-api-key`.

## Troubleshooting checklist

- Verify your gateway URL is reachable: `curl http://localhost:8787/health`.
- Confirm the correct base URL is chosen (see precedence order above).
- Ensure your gateway forwards to the right upstream (Gemini vs Vertex).
- If using Vertex, confirm `GOOGLE_CLOUD_LOCATION` is set and matches the
  upstream endpoint region.
- Check gateway logs for incoming requests and headers.

export GEMINI_CLI_VERTEX_BASE_URL="https://tunnel.penify.info" export
GOOGLE_API_KEY="sdfsdfds" export GEMINI_CLI_CUSTOM_HEADERS="X-Trace-Id:
gateway-test, x-portkey-virtual-key:
ank_3e92acfe4f4cc0f6943d1c4a8d6bf239001651dbfa90a6e31dfa0e1430f21c1c" export
GOOGLE_GENAI_USE_VERTEXAI="true"
