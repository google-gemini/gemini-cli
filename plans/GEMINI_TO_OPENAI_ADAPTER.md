# Gemini-to-OpenAI Protocol Adapter Implementation Plan

## Problem

Local backends (Ollama, LM Studio, llama.cpp) expose OpenAI-compatible
`/v1/chat/completions` endpoints, but the Gemini CLI uses the Google Gen AI SDK
which sends **Gemini-protocol** requests (`/v1/models/{model}:generateContent`).
Ollama returns `405 Method Not Allowed` for Gemini-protocol calls. The CLI
currently has no protocol translation layer.

## Solution

Build a `ContentGenerator` adapter that translates Gemini-protocol requests to
OpenAI-protocol and maps responses back, inserted at the
`createContentGenerator()` factory in `contentGenerator.ts` for local backends.

---

## Architecture

### Insertion Point

```
Current stack for local backends:
  RecordingContentGenerator (optional)
    └── LoggingContentGenerator
          └── GoogleGenAI.models        ← fails: sends Gemini protocol to Ollama

New stack with adapter:
  RecordingContentGenerator (optional)
    └── LoggingContentGenerator
          └── GeminiToOpenAiContentGenerator   ← NEW: translates to OpenAI protocol
```

The adapter is created in `createContentGenerator()`
(`contentGenerator.ts:501-521`) when `isLocalBackendAuthType(config.authType)`
is true. The exact insertion is:
`new LoggingContentGenerator(new GeminiToOpenAiContentGenerator(config), gcConfig)`
— replacing `googleGenAI.models`.

### How ContentGenerator Works

From `contentGenerator.ts:36-58`:

```typescript
interface ContentGenerator {
  generateContent(
    request: GenerateContentParameters,
    userPromptId: string,
    role: LlmRole,
  ): Promise<GenerateContentResponse>;

  generateContentStream(
    request: GenerateContentParameters,
    userPromptId: string,
    role: LlmRole,
  ): Promise<AsyncGenerator<GenerateContentResponse>>;

  countTokens(request: CountTokensParameters): Promise<CountTokensResponse>;
  embedContent(...): Promise<...>;
}
```

The adapter implements this interface, translating before/after each call.

---

## Phase 1: Translator Layer (Pure Functions)

### New File: `packages/core/src/core/geminiToOpenAiTranslator.ts`

Pure translation functions with no network I/O. Separated for testability.

#### 1.1 Request Translation

```
geminiToOpenAiRequest(params: GenerateContentParameters) → OpenAIRequest
```

**Gemini → OpenAI mappings:**

| Gemini field                         | OpenAI field                                                              | Notes                                                                                            |
| ------------------------------------ | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `model`                              | `model`                                                                   | Pass through as-is (e.g., `gemma4:26b`)                                                          |
| `config.temperature`                 | `temperature`                                                             | Direct                                                                                           |
| `config.topP`                        | `top_p`                                                                   | Direct                                                                                           |
| `config.topK`                        | —                                                                         | No OpenAI equivalent; omit (Ollama supports `top_k`)                                             |
| `config.maxOutputTokens`             | `max_tokens`                                                              | Direct                                                                                           |
| `config.stopSequences`               | `stop`                                                                    | Direct array                                                                                     |
| `config.systemInstruction` (string)  | `messages[{ role: "system", content: text }]`                             | Prepend to messages array                                                                        |
| `config.systemInstruction` (Content) | `messages[{ role: "system", content: ... }]`                              | Flatten parts to text                                                                            |
| `config.tools`                       | `tools`                                                                   | Map `functionDeclarations` → `{ type: "function", function: { name, description, parameters } }` |
| `config.toolConfig.toolChoice`       | `tool_choice`                                                             | `"auto"` → `"auto"`, `"any"` → `"required"`, `"none"` → `"none"`                                 |
| `config.responseMimeType`            | `response_format: { type: "json_object" }`                                | Only if `"application/json"`                                                                     |
| `config.responseJsonSchema`          | `response_format: { type: "json_schema", json_schema: { name, schema } }` | OpenAI structured output                                                                         |
| `config.thinkingConfig`              | —                                                                         | No OpenAI equivalent; omit (Ollama passes native reasoning)                                      |
| `config.safetySettings`              | —                                                                         | No OpenAI equivalent; omit                                                                       |
| `config.abortSignal`                 | `signal` (fetch AbortSignal)                                              | Pass through to fetch                                                                            |
| `contents[]`                         | `messages[]`                                                              | See content translation below                                                                    |
| —                                    | `stream: true/false`                                                      | Set based on `generateContentStream` vs `generateContent`                                        |

**Content/messages translation (the core mapping):**

| Gemini Content                                                            | OpenAI Message                                                                                                                      |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `{ role: "user", parts: [{ text }] }`                                     | `{ role: "user", content: text }`                                                                                                   |
| `{ role: "user", parts: [{ text }, { inlineData }] }`                     | `{ role: "user", content: [{ type: "text", text }, { type: "image_url", image_url: { url: "data:..." } }] }`                        |
| `{ role: "model", parts: [{ text }] }`                                    | `{ role: "assistant", content: text }`                                                                                              |
| `{ role: "model", parts: [{ functionCall: { id, name, args } }] }`        | `{ role: "assistant", tool_calls: [{ id, type: "function", function: { name, arguments: JSON.stringify(args) } }], content: null }` |
| `{ role: "model", parts: [{ text, thought: true }] }`                     | `{ role: "assistant", content: text }` (thought merged; reasoning stripped if embedded)                                             |
| Mixed model parts (text + functionCall)                                   | Separate into text content + tool_calls                                                                                             |
| `{ role: "user", parts: [{ functionResponse: { id, name, response } }] }` | `{ role: "tool", tool_call_id: id, content: JSON.stringify(response) }`                                                             |

**Multi-part content handling:** When `parts` has multiple entries:

- `text` parts → concatenated to `content` string (or content array if images
  present)
- `inlineData` → `content` array with image_url objects
- `functionCall` → `tool_calls` on the assistant message
- `functionResponse` → separate `tool` role messages (one per part)
- `thought` parts → stripped (reasoning) or appended to content string

**Edge cases:**

- **Consecutive model messages**: OpenAI requires alternating user/assistant. If
  two model messages appear in sequence, insert a synthetic user message with
  empty content OR merge them. The codebase already enforces alternating pattern
  via `geminiChat.ts`.
- **Consecutive tool messages**: Valid in OpenAI — no merging needed.
- **System instruction as Content object with multiple parts**: Convert all text
  parts to the system message string, skip non-text parts (images, files in
  system instruction are atypical).
- **CountTokens**: Map `/v1/models/{model}:countTokens` → `/v1/chat/completions`
  with `max_tokens: 0` (if supported) OR `/v1/tokenizers/{model}/tokenize`
  (Ollama-specific API). Fallback: estimate tokens with tiktoken for
  `gemma4-26b` if Ollama doesn't support.
- **EmbedContent**: Likely not used for local models; return empty or
  unimplemented error.

#### 1.2 Non-Streaming Response Translation

```
openAiToGeminiResponse(openAiResp: OpenAIResponse, model: string) → GenerateContentResponse
```

**OpenAI → Gemini mappings:**

| OpenAI field                           | Gemini field                                                                                                          |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `choices[0].message.content`           | `candidates[0].content.parts[{ text }]`                                                                               |
| `choices[0].message.reasoning_content` | `candidates[0].content.parts[{ text, thought: true }]` (Gemma reasoning)                                              |
| `choices[0].message.tool_calls`        | `functionCalls[{ id, name, args }]` + `candidates[0].content.parts[{ functionCall }]`                                 |
| `choices[0].finish_reason`             | `candidates[0].finishReason` (map: `"stop"` → `"STOP"`, `"tool_calls"` → `"TOOL_CALLS"`, `"length"` → `"MAX_TOKENS"`) |
| `usage.prompt_tokens`                  | `usageMetadata.promptTokenCount`                                                                                      |
| `usage.completion_tokens`              | `usageMetadata.candidatesTokenCount`                                                                                  |
| `usage.total_tokens`                   | `usageMetadata.totalTokenCount`                                                                                       |
| `model`                                | `modelVersion`                                                                                                        |
| `id`                                   | `responseId`                                                                                                          |

**Tool call extraction from response:**

```typescript
// openAiResp.choices[0].message.tool_calls
// → candidates[0].content.parts: parts with functionCall
// → functionCalls: top-level array (SDK convenience)
```

#### 1.3 Streaming Response Translation

```
openAiChunkToGeminiChunk(chunk: OpenAiStreamChunk, model: string, accumulator: StreamAccumulator) → GenerateContentResponse | null
```

OpenAI SSE chunks are granular deltas. We need to accumulate tool_call deltas
into complete function calls.

**Stream accumulator state:**

```typescript
interface StreamAccumulator {
  textContent: string; // accumulated text (non-reasoning)
  reasoningContent: string; // accumulated reasoning_content
  finishReason: string | null;
  toolCallDeltas: Map<
    number,
    {
      // index → partial tool call
      id: string;
      name: string;
      arguments: string;
    }
  >;
  usage: UsageData | null;
  finished: boolean;
  sentToolCalls: Set<number>; // indices of tool calls already emitted
  callIndexCounter: number;
}
```

**Per-chunk mapping:**

```
OpenAI delta:
  { choices: [{ delta: { content: "hello" }, finish_reason: null }] }

→ Gemini chunk:
  { candidates: [{ content: { parts: [{ text: "hello" }] } }], usageMetadata: null }
```

```
OpenAI delta (tool_call start):
  { choices: [{ delta: { tool_calls: [{ index: 0, id: "call_1", function: { name: "read", arguments: "" } }] } }] }

→ No Gemini chunk emitted yet (accumulating)

OpenAI delta (tool_call argument):
  { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: "foo=1" } }] } }] }

→ No Gemini chunk emitted yet

OpenAI delta (tool_call complete + finish):
  { choices: [{ delta: {}, finish_reason: "tool_calls" }] }

→ Gemini chunk:
  {
    candidates: [{ content: { role: "model", parts: [{ functionCall: { id: "call_1", name: "read", args: { foo: 1 } } }] }, finishReason: "TOOL_CALLS" }],
    functionCalls: [{ id: "call_1", name: "read", args: { foo: 1 } }]
  }
```

**Tool call completion detection:** A tool call is "complete" and ready to emit
when:

1. Its `id`, `name`, and `arguments` are all populated (no empty strings)
2. AND the next chunk has a different `tool_calls` set (or finish_reason
   appears)

Alternative: emit tool calls only at the end of the stream (at
`finish_reason === "tool_calls"`). This matches how Gemini works.

**Usage metadata in streaming:** OpenAI needs
`stream_options: { include_usage: true }` to get `usage` in the final chunk.
This is in the request, not per-chunk config. We add it always for streaming.

---

## Phase 2: ContentGenerator Adapter

### New File: `packages/core/src/core/geminiToOpenAiContentGenerator.ts`

```typescript
export class GeminiToOpenAiContentGenerator implements ContentGenerator {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey?: string,
    private readonly customHeaders?: Record<string, string>,
  ) {}

  async generateContent(
    request: GenerateContentParameters,
    userPromptId: string,
    role: LlmRole,
  ): Promise<GenerateContentResponse> {
    const openAiRequest = geminiToOpenAiRequest(request, { stream: false });
    const response = await this.fetchOpenAi(
      openAiRequest,
      request.config?.abortSignal,
    );
    return openAiToGeminiResponse(response, request.model);
  }

  async generateContentStream(
    request: GenerateContentParameters,
    userPromptId: string,
    role: LlmRole,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    const openAiRequest = geminiToOpenAiRequest(request, { stream: true });
    const response = await this.fetchOpenAiStream(
      openAiRequest,
      request.config?.abortSignal,
    );

    return this.streamTranslator(response, request.model);
  }

  private async fetchOpenAi(
    request: OpenAiRequest,
    signal?: AbortSignal,
  ): Promise<OpenAiResponse> {
    const url = `${this.baseUrl.replace(/\/v1\/?$/, '')}/v1/chat/completions`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.customHeaders,
      },
      body: JSON.stringify(request),
      signal,
    });
    if (!resp.ok) {
      throw new Error(`OpenAI API error: ${resp.status} ${await resp.text()}`);
    }
    return resp.json();
  }

  private async fetchOpenAiStream(
    request: OpenAiRequest,
    signal?: AbortSignal,
  ): Promise<Response> {
    // ... similar, but returns raw Response for SSE parsing
  }

  private async *streamTranslator(
    response: Response,
    model: string,
  ): AsyncGenerator<GenerateContentResponse> {
    const accumulator = createStreamAccumulator();
    const reader = response.body?.getReader();
    // Parse SSE chunks, call openAiChunkToGeminiChunk(), yield non-null results
    // At stream end, emit final chunk with usage + finishReason
  }
}
```

### Non-streaming `countTokens()` implementation

Two strategies (fallback chain):

1. **Ollama-specific `/api/show` + estimation**: Use `/api/show` to get model
   info (parameter count, context length), then estimate tokens with
   character-based heuristic (1 token ≈ 4 chars for Gemma).

2. **OpenAI compatibility layer** (if Ollama supports it): Some Ollama versions
   expose `/v1/tokenizers/{model}/tokenize`. We try this first.

3. **Fallback to tiktoken**: For known models, use tiktoken tokenizer if
   available. Otherwise estimate.

For now, implement the simplest: make a `/v1/chat/completions` call with
`max_tokens: 1` and use the `usage.prompt_tokens` from the response. This is the
most reliable cross-backend approach.

### Non-streaming `embedContent()` implementation

If the backend supports `/v1/embeddings`, call it directly. Otherwise return an
empty/default response (local Gemma 4 isn't used for embeddings in practice).

---

## Phase 3: Integration

### 3.1 Modify `createContentGenerator()` in `contentGenerator.ts`

**Current code (lines 501-521):**

```typescript
if (isLocalBackendAuthType(config.authType)) {
  // ... headers ...
  const googleGenAI = new GoogleGenAI({
    apiKey: undefined,
    vertexai: false,
    httpOptions: { baseUrl: config.baseUrl, headers },
  });
  return new LoggingContentGenerator(googleGenAI.models, gcConfig);
}
```

**New code:**

```typescript
if (isLocalBackendAuthType(config.authType)) {
  // ... headers ...

  // vLLM and SGLang can serve Gemini protocol natively
  if (
    config.authType === AuthType.USE_LOCAL_VLLM ||
    config.authType === AuthType.USE_LOCAL_SGLANG
  ) {
    const googleGenAI = new GoogleGenAI({
      apiKey: undefined,
      vertexai: false,
      httpOptions: { baseUrl: config.baseUrl, headers },
    });
    return new LoggingContentGenerator(googleGenAI.models, gcConfig);
  }

  // Ollama, LM Studio, llama.cpp use OpenAI protocol
  const adapter = new GeminiToOpenAiContentGenerator(
    config.baseUrl,
    config.apiKey,
    { ...headers },
  );
  return new LoggingContentGenerator(adapter, gcConfig);
}
```

### 3.2 Add `protocol` to discovery result

In `localModelDiscoveryService.ts:38-45`, add a `protocol` field:

```typescript
export interface DiscoveredLocalBackend {
  authType: LocalBackendAuthType;
  backend: LocalBackendName;
  baseUrl: string;
  protocol: 'gemini' | 'openai'; // NEW
  models: LocalModel[];
  gemma4Models: LocalModel[];
  gemma4Metadata: LocalModelMetadata[];
}
```

Hardcode based on backend:

- `ollama`, `lm-studio`, `llama-cpp` → `'openai'`
- `vllm`, `sglang` → `'gemini'`

### 3.3 Config-level wiring

In `config.ts:596-604` (`LocalModelConfig`), add optional `protocol`:

```typescript
export interface LocalModelConfig {
  baseUrl?: string;
  modelMapping?: LocalModelMapping;
  toolFiltering?: boolean;
  providers?: Record<string, { baseUrl?: string }>;
  protocol?: 'gemini' | 'openai'; // NEW
}
```

---

## Phase 4: Edge Cases & Testing

### 4.1 Error Translation

Map OpenAI error codes to Gemini CLI error types:

| OpenAI error          | Gemini error          | Action                          |
| --------------------- | --------------------- | ------------------------------- |
| 401 Unauthorized      | `MissingApiKeyError`  | Show auth setup instructions    |
| 404 Not Found         | `ModelNotFoundError`  | "Model not found or is invalid" |
| 429 Too Many Requests | `RetryableQuotaError` | Backoff/retry                   |
| 500 Server Error      | Generic retryable     | Backoff/retry                   |
| 400 Bad Request       | `InvalidRequestError` | Log details, don't retry        |

### 4.2 Abort Signal Propagation

The `GenerateContentConfig.abortSignal` must cancel in-flight fetch requests.
This is handled by passing `signal` to the `fetch()` call. Both streaming and
non-streaming paths support this natively.

### 4.3 Empty/Malformed Responses

- Empty `choices[0].message.content` with no tool_calls → map to empty content
  with `TEXT_GENERATION` finish.
- `finish_reason` missing → set to `"STOP"` (default for simple text responses).
- `tool_calls` with missing `id` → generate synthetic ID (`call_{hash}`).

### 4.4 Token Counting Accuracy

For the `/v1/chat/completions`-based count, note:

- It counts **ALL** messages including history, not just the current request.
- The `CountTokensParameters` type includes `model` and
  `contents`/`generateContentRequest` — we map to messages and use
  `/v1/chat/completions` with `max_tokens: 1` to get prompt_tokens.

### 4.5 Reasoning/Thinking Support

Gemma 4 models on Ollama expose reasoning content via:

- Ollama 0.5.0+: `reasoning_content` field in message (mapped to `thinking` in
  OpenAI format)
- We map `reasoning_content` → `part.thought: true`

Ollama config for streaming must include
`stream_options: { include_usage: true }`.

### 4.6 Multi-Model Support

The adapter is generic — it works for any model exposed via OpenAI-compatible
`/v1/chat/completions`. No model-specific logic except for:

- `top_k`: Some Ollama models support it via `options.top_k` (non-standard
  extension). We pass it in the request body if the backend is Ollama.

---

## Implementation Order

| Step                                    | File(s)                                                   | Effort | Test file                                |
| --------------------------------------- | --------------------------------------------------------- | ------ | ---------------------------------------- |
| 1. Request translation                  | `geminiToOpenAiTranslator.ts`                             | Large  | `geminiToOpenAiTranslator.test.ts`       |
| 2. Response translation (non-streaming) | `geminiToOpenAiTranslator.ts`                             | Medium | same                                     |
| 3. Streaming chunk translation          | `geminiToOpenAiTranslator.ts`                             | Large  | same                                     |
| 4. ContentGenerator adapter             | `geminiToOpenAiContentGenerator.ts`                       | Medium | `geminiToOpenAiContentGenerator.test.ts` |
| 5. Integration wiring                   | `contentGenerator.ts`, `config.ts`, `discoveryService.ts` | Small  | Update `contentGenerator.test.ts`        |
| 6. countTokens + embedContent           | `geminiToOpenAiContentGenerator.ts`                       | Small  | same                                     |
| 7. Error handling                       | `geminiToOpenAiContentGenerator.ts`                       | Small  | same                                     |
| 8. End-to-end manual test               | —                                                         | Small  | Manual with Ollama                       |

---

## Test Plan

### Unit Tests (vitest)

#### `geminiToOpenAiTranslator.test.ts`

1. **Basic text request** — single user message, no tools
2. **System instruction** — string and Content object forms
3. **Multi-turn conversation** — user/model/user/model history
4. **Tool declarations** — single and multiple tools with parameters
5. **Tool choice modes** — auto/required/none → auto/required/none
6. **Function call in history** — model message with functionCall part
7. **Function response in history** — user message with functionResponse part
8. **Mixed parts** — text + functionCall in one model message
9. **Image content** — inlineData with base64 image
10. **Streaming request** — `stream: true` set
11. **Response: text only** — simple text response mapping
12. **Response: tool calls** — message with tool_calls → functionCalls
13. **Response: reasoning** — reasoning_content → thought parts
14. **Response: finish reasons** — stop/tool_calls/length mapping
15. **Streaming chunks: text delta** — content accumulation
16. **Streaming chunks: tool call accumulation** — index-based merge
17. **Streaming chunks: finish with tool calls** — emit at finish
18. **Streaming chunks: mixed text + tool calls** — text before tools
19. **Streaming chunks: usage metadata** — final chunk with usage

#### `geminiToOpenAiContentGenerator.test.ts`

1. **generateContent: happy path** — mock fetch, round-trip translation
2. **generateContent: 404 error** — model not found
3. **generateContent: 401 error** — auth error
4. **generateContentStream: text stream** — multiple SSE chunks
5. **generateContentStream: tool call stream** — accumulated tool calls
6. **generateContentStream: abort signal** — cancel mid-stream
7. **countTokens** — via proxy to chat/completions
8. **embedContent** — basic pass-through

### Integration Tests

1. **Ollama backend with `gemma4:26b`** — real request/response round-trip
2. **Multi-turn conversation with tool calls** — read_file → write_file cycle
3. **Streaming with large output** — verify no truncation

---

## Risks & Mitigations

| Risk                                                                | Likelihood | Mitigation                                                                                         |
| ------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------- |
| OpenAPI tool call deltas not perfectly reconstructing Gemini format | Medium     | Test with all tool-calling scenarios from e2e spec; handle edge cases (empty args, nested objects) |
| Token counting returning inaccurate values for local models         | Medium     | Warn if estimate; provide `--model-token-count` flag to override                                   |
| Ollama API version differences (top_k, reasoning, etc.)             | Low        | Feature-detect via Ollama `/api/version` endpoint; skip unsupported features                       |
| Performance overhead of translation layer                           | Low        | Pure function translation is O(n) on parts/messages; negligible vs network latency                 |
| LM Studio using different OpenAI schema variant                     | Low        | Add provider-specific overrides in the request builder; validate against LM Studio docs            |
| `functiongemma:270m` tool filtering also fails on OpenAI path       | Medium     | Fix tool filtering to use adapter path as well (or bypass for now)                                 |

---

## Success Criteria

1. `gemini-cli` can send a chat message to Ollama `gemma4:26b` and receive a
   streaming text response
2. Multi-turn conversation with tool calls (read_file → model reads →
   write_file) works end-to-end
3. All existing unit tests pass (no regressions for Gemini cloud backends)
4. Typecheck + lint pass with zero errors
5. Manual test: `npm run build && npm start` with `gemma4:26b` selected, ask
   "hello", get response
