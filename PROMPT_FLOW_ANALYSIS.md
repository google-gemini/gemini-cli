# Gemini CLI: User Prompt Flow Analysis

## Executive Summary
This document details how user prompts flow through the Gemini CLI system from initial capture through API delivery. The system operates in both interactive (React/Ink UI) and non-interactive (CLI) modes, with prompts undergoing systematic enrichment through system prompts, context injection, and message history management.

---

## 1. INPUT CAPTURE

### 1.1 Interactive Mode (TUI)
**Entry Point:** `/packages/cli/src/ui/AppContainer.tsx`

#### Input Capture Flow:
```
User types in terminal
    ↓
KeyPress Handler (useKeypress hook)
    ↓
InputPrompt Component (TextBuffer)
    ↓
Buffer.setText() - Updates text state
    ↓
Return key press detected
    ↓
handleSubmitAndClear()
    ↓
handleFinalSubmit() callback
```

**Key Components:**
- **InputPrompt.tsx** (lines 100-123): Main input UI component using Ink
  - Manages text input via `TextBuffer`
  - Handles keyboard navigation and special keys
  - Supports reverse search, command completion
  - Detects multi-line paste detection with safety checks

- **TextInput.tsx**: Lower-level input handler
  - Uses `useKeypress` hook to capture individual key events
  - Formats input for submission on Enter

- **useInputHistory.ts**: Manages input history navigation (Up/Down arrows)

#### Code Flow (AppContainer.tsx, line 727-732):
```typescript
const handleFinalSubmit = useCallback(
  (submittedValue: string) => {
    addMessage(submittedValue);  // Queues message for processing
  },
  [addMessage],
);
```

**addMessage** flow:
1. Creates `HistoryItemWithoutId` object
2. Adds to history via `historyManager.addItem()`
3. Calls `submitQuery()` which initiates the full prompt processing pipeline

### 1.2 Non-Interactive Mode (CLI)
**Entry Point:** `/packages/cli/src/gemini.tsx` (main() function, lines 257-567)

#### Input Capture Flow:
```
Process Arguments (parseArguments)
    ↓
Check for stdin input (process.stdin.isTTY)
    ↓
If not TTY: readStdin()
    ↓
If TTY: Use --prompt argument
    ↓
Combine stdin + prompt argument
    ↓
Validate and prepare input
    ↓
Pass to runNonInteractive()
```

**readStdin() Implementation** (`/packages/cli/src/utils/readStdin.ts`):
- Listens for `readable` event on stdin
- Chunks data in real-time
- Max size limit: 8MB (configurable)
- 500ms timeout for non-piped input detection
- Handles errors and cleanup gracefully

**Code Snippet (gemini.tsx, lines 516-528):**
```typescript
if (!process.stdin.isTTY) {
  const stdinData = await readStdin();
  if (stdinData) {
    input = `${stdinData}\n\n${input}`;  // Prepend stdin to prompt
  }
}
```

### 1.3 Special Input Types

#### Slash Commands
- **Format:** `/command [args]`
- **Detection:** `isSlashCommand()` in `commandUtils.ts`
- **Interactive Processing:** Handled in `useGeminiStream.ts` (lines 378-414)
- **Non-Interactive Processing:** Handled in `nonInteractiveCliCommands.ts`

#### @ Commands (File Inclusion)
- **Format:** `@path/to/file` or `@/absolute/path`
- **Detection:** `isAtCommand()` in `commandUtils.ts`
- **Processing:** `handleAtCommand()` in `atCommandProcessor.ts`
- **Result:** Converts file content into PartListUnion for inclusion in prompt

#### Shell Mode Commands
- **Entry:** When `shellModeActive` is true
- **Processing:** `useShellCommandProcessor()` hook
- **Execution:** Direct shell command execution via tools

---

## 2. PROMPT PROCESSING PIPELINE

### 2.1 Processing Flow Diagram
```
Raw User Input
    ↓
[Input Validation]
  - Check for empty input
  - Verify not cancelled
    ↓
[Command Detection]
  - Is it a slash command?  → handleSlashCommand()
  - Is it a @ command?      → handleAtCommand()
  - Is it shell mode?       → handleShellCommand()
  - Otherwise: Normal text
    ↓
[User Message Recording]
  - Log to history
  - Log to session
  - Add to UI history
    ↓
[Query Preparation]
  - Convert to PartListUnion
  - Resolve @ command includes
  - Format for API
    ↓
[Gemini Chat Submission]
  - Add IDE context (if IDE mode)
  - Include chat history
  - Include system prompt
  - Build complete request
    ↓
[API Call]
  - sendMessageStream()
  - Streaming response handling
```

### 2.2 Interactive Mode Pipeline

**Location:** `useGeminiStream.ts` (lines 352-473)

```typescript
const prepareQueryForGemini = useCallback(
  async (query: PartListUnion, ...) => {
    // 1. Validate query
    if (typeof query === 'string' && query.trim().length === 0) {
      return { queryToSend: null, shouldProceed: false };
    }

    // 2. Process based on type
    if (typeof query === 'string') {
      // Handle slash commands
      if (isSlashCommand(trimmedQuery)) {
        const slashCommandResult = await handleSlashCommand(trimmedQuery);
        // Process result (schedule_tool, submit_prompt, or handled)
      }

      // Handle @ commands
      if (isAtCommand(trimmedQuery)) {
        const atCommandResult = await handleAtCommand({...});
        localQueryToSendToGemini = atCommandResult.processedQuery;
      }

      // Add user message to history
      addItem(
        { type: MessageType.USER, text: trimmedQuery },
        userMessageTimestamp,
      );
    }

    // 3. Return prepared query
    return { queryToSend: localQueryToSendToGemini, shouldProceed: true };
  },
  [...dependencies],
);
```

**Key Processing Points:**
1. **Slash Command Handling** (lines 378-414)
   - Checks if input starts with `/`
   - Routes to `handleSlashCommand()` 
   - Can return tool scheduling or prompt submission

2. **@ Command Handling** (lines 422-441)
   - Detects `@path/to/file` patterns
   - Calls `handleAtCommand()` to resolve files
   - Inlines file content into prompt

3. **Normal Query Processing** (lines 442-449)
   - Adds user message to history
   - Prepares query for submission

### 2.3 Non-Interactive Mode Pipeline

**Location:** `nonInteractiveCli.ts` (lines 57-452)

```typescript
export async function runNonInteractive({
  config,
  input,
  prompt_id,
}: RunNonInteractiveParams): Promise<void> {
  // 1. Initialize chat
  if (resumedSessionData) {
    await geminiClient.resumeChat(
      convertSessionToHistoryFormats(...).clientHistory,
      resumedSessionData,
    );
  }

  // 2. Process slash commands
  if (isSlashCommand(input)) {
    const slashCommandResult = await handleSlashCommand(
      input,
      abortController,
      config,
      settings,
    );
    if (slashCommandResult) {
      query = slashCommandResult as Part[];
    }
  }

  // 3. Process @ commands
  if (!query) {
    const { processedQuery, shouldProceed } = await handleAtCommand({
      query: input,
      config,
      ...
    });
    if (!shouldProceed) {
      throw new FatalInputError('Error processing @ command');
    }
    query = processedQuery as Part[];
  }

  // 4. Create message
  let currentMessages: Content[] = [{ role: 'user', parts: query }];

  // 5. Send message stream
  while (true) {
    const responseStream = geminiClient.sendMessageStream(
      currentMessages[0]?.parts || [],
      abortController.signal,
      prompt_id,
    );
    // Process stream events...
  }
}
```

### 2.4 Context Enrichment

#### IDE Context (If IDE Mode Enabled)
**Location:** `client.ts` (lines 237-403)

IDE context is injected before each message send:
```typescript
if (this.config.getIdeMode() && !hasPendingToolCall) {
  const { contextParts, newIdeContext } = this.getIdeContextParts(
    this.forceFullIdeContext || history.length === 0,
  );
  if (contextParts.length > 0) {
    this.getChat().addHistory({
      role: 'user',
      parts: [{ text: contextParts.join('\n') }],
    });
  }
}
```

**IDE Context Structure:**
- **Full Context (First time or reset):**
  ```json
  {
    "activeFile": {
      "path": "/path/to/file",
      "cursor": {"line": 10, "character": 5},
      "selectedText": "selected code"
    },
    "otherOpenFiles": ["/path/to/other/file"]
  }
  ```

- **Delta Context (Subsequent messages):**
  ```json
  {
    "changes": {
      "filesOpened": ["/new/file"],
      "filesClosed": ["/removed/file"],
      "activeFileChanged": {...},
      "cursorMoved": {...},
      "selectionChanged": {...}
    }
  }
  ```

#### Memory Context
**Location:** `prompts.ts` (lines 78-346)

User memory is appended to the system prompt:
```typescript
const memorySuffix =
  userMemory && userMemory.trim().length > 0
    ? `\n\n---\n\n${userMemory.trim()}`
    : '';

return `${basePrompt}${memorySuffix}`;
```

---

## 3. SYSTEM PROMPT CONSTRUCTION

### 3.1 System Prompt Architecture

**Location:** `/packages/core/src/core/prompts.ts`

The system prompt is dynamically constructed in `getCoreSystemPrompt()` with the following structure:

```
1. PREAMBLE
   └─ Role definition and primary goal

2. CORE MANDATES
   ├─ Code conventions adherence
   ├─ Library verification
   ├─ Style & structure consistency
   ├─ Comments policy
   ├─ Proactiveness guidelines
   └─ Change management rules

3. PRIMARY WORKFLOWS
   ├─ If CodebaseInvestigator + WriteTodosTool:
   │  └─ primaryWorkflows_prefix_ci_todo
   ├─ Else if CodebaseInvestigator:
   │  └─ primaryWorkflows_prefix_ci
   ├─ Else if WriteTodosTool:
   │  └─ primaryWorkflows_todo
   └─ Else:
      └─ primaryWorkflows_prefix
   
   Followed by:
   └─ primaryWorkflows_suffix (Implement, Verify, Finalize)

4. OPERATIONAL GUIDELINES
   ├─ Shell output efficiency (if enabled)
   ├─ Tone and style for CLI
   ├─ Security and safety rules
   ├─ Tool usage best practices
   └─ Remembering user preferences

5. SANDBOX CONTEXT
   └─ Seatbelt / container / unrestricted notice

6. GIT CONTEXT (if in git repo)
   ├─ Commit message guidelines
   ├─ Git workflow instructions
   └─ Best practices

7. FINAL REMINDER
   └─ Summary of core function

8. USER MEMORY (if set)
   └─ Appended as suffix with separator
```

### 3.2 Dynamic Prompt Selection

**Preamble** (line 120):
```typescript
preamble: `You are an interactive CLI agent specializing in software engineering tasks. Your primary goal is to help users safely and efficiently, adhering strictly to the following instructions and utilizing your available tools.`
```

**Environment Variable Overrides:**
Each section can be disabled via environment variables:
```bash
GEMINI_PROMPT_PREAMBLE=0          # Disable preamble
GEMINI_PROMPT_COREMANDATES=false  # Disable core mandates
# etc.
```

**Custom System Prompt:**
Users can provide custom system prompt via:
```bash
GEMINI_SYSTEM_MD=/path/to/custom.md  # Override entire system prompt
GEMINI_WRITE_SYSTEM_MD=true           # Write current system prompt to file
```

### 3.3 Tool Declarations Injection

**Location:** `client.ts` (lines 147-152)

Tool declarations are injected into the request:
```typescript
async setTools(): Promise<void> {
  const toolRegistry = this.config.getToolRegistry();
  const toolDeclarations = toolRegistry.getFunctionDeclarations();
  const tools: Tool[] = [{ functionDeclarations: toolDeclarations }];
  this.getChat().setTools(tools);
}
```

**Tool Declaration Sources:**
1. **Built-in tools:** `tools/` directory
   - read-file, write-file, edit, grep, glob, shell, web-search, etc.

2. **MCP tools:** Dynamically loaded from MCP servers
   - Converted to OpenAPI function declarations

3. **Tool Filtering:**
   - Non-interactive mode: Excludes shell unless YOLO mode
   - IDE mode: Includes IDE-specific tools
   - Extension tools: Dynamically added

---

## 4. REQUEST BUILDING

### 4.1 Final Request Structure

**Location:** `/packages/core/src/core/geminiChat.ts`

The request is built in `GeminiChat.sendMessageStream()`:

```typescript
async sendMessageStream(
  model: string,
  params: SendMessageParameters,
  prompt_id: string,
): Promise<AsyncGenerator<StreamEvent>>
```

**Request Components:**

```typescript
const requestConfig: GenerateContentConfig = {
  temperature: 0,
  topP: 1,
  // Thinking config (for Gemini 2.5 models)
  thinkingConfig: {
    includeThoughts: true,
    thinkingBudget: DEFAULT_THINKING_MODE,
  },
  abortSignal,
  systemInstruction,  // Core system prompt
};

const request = {
  model: "gemini-2.0-flash",
  contents: [
    // Initial chat history with environment context
    { role: 'user', parts: [{ text: 'Setup context...' }] },
    
    // Previous conversation messages
    { role: 'user', parts: [...] },
    { role: 'model', parts: [...] },
    
    // IDE context (if applicable)
    { role: 'user', parts: [{ text: 'IDE context JSON...' }] },
    
    // Current user message
    { role: 'user', parts: query }  // query = PartListUnion
  ],
  tools: [
    {
      functionDeclarations: [
        // All available tools...
      ]
    }
  ],
  config: requestConfig,
  systemInstruction: {
    role: 'user',
    parts: [{ text: getCoreSystemPrompt(...) }]
  }
}
```

### 4.2 Message History Management

**Location:** `/packages/core/src/core/geminiChat.ts` (663 lines)

The chat maintains conversation history with:

**Key Methods:**
```typescript
addHistory(content: Content): void
  // Adds user or model message to history

getHistory(curated?: boolean): Content[]
  // Returns full history or curated version

setHistory(history: Content[]): void
  // Replaces entire history (for resume/compression)

recordCompletedToolCalls(model: string, toolCalls: CompletedToolCall[])
  // Records tool execution results for history
```

**History Structure:**
```typescript
interface Content {
  role: 'user' | 'model';
  parts: Part[];  // Array of text, tool calls, tool responses, etc.
}

interface Part {
  text?: string;
  inlineData?: { data: string; mimeType: string };
  fileData?: { uri: string };
  functionCall?: { name: string; args: object };
  functionResponse?: { name: string; response: object };
  thought?: string;  // For thinking mode
}
```

### 4.3 Chat Compression

**Location:** `/packages/core/src/services/chatCompressionService.ts`

When context window nears limit, chat is compressed:

```typescript
async compress(
  chat: GeminiChat,
  prompt_id: string,
  force: boolean,
  model: string,
  config: Config,
): Promise<{ newHistory: Content[]; info: ChatCompressionInfo }>
```

**Compression Process:**
1. Detects if token count exceeds threshold
2. Uses special compression prompt from `prompts.ts` (lines 353-411)
3. Generates XML state snapshot of conversation
4. Replaces history with compressed version
5. Maintains context of goals, key knowledge, and recent actions

### 4.4 Request Validation

**Location:** `/packages/core/src/core/geminiChat.ts`

Before sending, the request is validated:

```typescript
function isValidResponse(response: GenerateContentResponse): boolean {
  if (response.candidates === undefined || 
      response.candidates.length === 0) {
    return false;
  }
  const content = response.candidates[0]?.content;
  if (content === undefined) return false;
  return isValidContent(content);
}

function isValidContent(content: Content): boolean {
  // Check for valid parts (text, tool calls, etc.)
  // Reject responses without meaningful content
}
```

**Retry Logic:**
- Failed requests trigger retry with backoff
- Max 2 attempts (1 initial + 1 retry)
- Configurable via `GEMINI_CONTINUE_ON_FAILED_API_CALL`

---

## 5. CONTENT GENERATOR & API CALL

### 5.1 ContentGenerator Interface

**Location:** `/packages/core/src/core/contentGenerator.ts`

```typescript
export interface ContentGenerator {
  generateContent(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<GenerateContentResponse>;

  generateContentStream(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<AsyncGenerator<GenerateContentResponse>>;

  countTokens(request: CountTokensParameters): 
    Promise<CountTokensResponse>;

  embedContent(request: EmbedContentParameters): 
    Promise<EmbedContentResponse>;

  userTier?: UserTierId;
}
```

### 5.2 ContentGenerator Creation Flow

**Location:** `createContentGenerator()` function (lines 107-169)

```
Create ContentGenerator
    ↓
[Auth Type Check]
├─ LOGIN_WITH_GOOGLE
│  └─ createCodeAssistContentGenerator()
│     └─ Uses OAuth credentials via CodeAssistServer
├─ USE_GEMINI
│  └─ GoogleGenAI with API key
├─ USE_VERTEX_AI
│  └─ GoogleGenAI with Vertex AI config
└─ CLOUD_SHELL
   └─ CodeAssistServer with cloud auth
    ↓
[Wrap with Decorators]
├─ LoggingContentGenerator (add telemetry)
├─ RecordingContentGenerator (if recording)
└─ FakeContentGenerator (if testing)
    ↓
Return wrapped generator
```

### 5.3 LoggingContentGenerator

**Location:** `/packages/core/src/core/loggingContentGenerator.ts`

Wraps the actual content generator to add:

**1. Request Logging:**
```typescript
logApiRequest(contents: Content[], model: string, promptId: string) {
  const requestText = JSON.stringify(contents);
  logApiRequest(
    this.config,
    new ApiRequestEvent(model, promptId, requestText),
  );
}
```

**2. Response Logging:**
```typescript
_logApiResponse(
  requestContents: Content[],
  durationMs: number,
  model: string,
  prompt_id: string,
  responseId: string | undefined,
  responseCandidates?: Candidate[],
  usageMetadata?: GenerateContentResponseUsageMetadata,
  responseText?: string,
  generationConfig?: GenerateContentConfig,
  serverDetails?: ServerDetails,
): void
```

**3. Error Logging:**
```typescript
_logApiError(
  durationMs: number,
  error: unknown,
  model: string,
  prompt_id: string,
  requestContents: Content[],
): void
```

### 5.4 API Call Execution

**Location:** `client.ts` (lines 605-678)

```typescript
async generateContent(
  modelConfigKey: ModelConfigKey,
  contents: Content[],
  abortSignal: AbortSignal,
): Promise<GenerateContentResponse> {
  const systemInstruction = getCoreSystemPrompt(this.config, userMemory);
  
  const apiCall = () => {
    const requestConfig: GenerateContentConfig = {
      ...currentAttemptGenerateContentConfig,
      abortSignal,
      systemInstruction,
    };

    return this.getContentGeneratorOrFail().generateContent(
      {
        model: currentAttemptModel,
        config: requestConfig,
        contents,
      },
      this.lastPromptId,
    );
  };

  const result = await retryWithBackoff(apiCall, {
    onPersistent429: onPersistent429Callback,
    authType: this.config.getContentGeneratorConfig()?.authType,
  });

  return result;
}
```

### 5.5 Authentication Handling

**Auth Types Supported:**
1. **OAuth (LOGIN_WITH_GOOGLE):**
   - Via CodeAssistServer
   - Redirects to browser for Google login
   - Uses stored OAuth tokens

2. **API Key (USE_GEMINI):**
   - Stored in `~/.gemini/api-key`
   - Passed to GoogleGenAI client
   - Falls back to `GEMINI_API_KEY` env var

3. **Vertex AI (USE_VERTEX_AI):**
   - Uses service account or user credentials
   - Region-specific endpoints
   - Configured via env vars:
     - `GOOGLE_CLOUD_PROJECT`
     - `GOOGLE_CLOUD_LOCATION`
     - `GOOGLE_API_KEY`

4. **Cloud Shell (CLOUD_SHELL):**
   - Uses existing Cloud Shell credentials
   - Automatic auth detection

---

## 6. STREAM PROCESSING & RESPONSE HANDLING

### 6.1 Stream Event Types

**Location:** `/packages/core/src/core/turn.ts` (lines 49-65)

```typescript
export enum GeminiEventType {
  Content = 'content',                    // Text response
  ToolCallRequest = 'tool_call_request',  // Model requests tool execution
  ToolCallResponse = 'tool_call_response',// Tool result returned
  ToolCallConfirmation = 'tool_call_confirmation',
  UserCancelled = 'user_cancelled',
  Error = 'error',
  ChatCompressed = 'chat_compressed',
  Thought = 'thought',                    // Thinking mode thoughts
  MaxSessionTurns = 'max_session_turns',
  Finished = 'finished',
  LoopDetected = 'loop_detected',
  Citation = 'citation',
  Retry = 'retry',
  ContextWindowWillOverflow = 'context_window_will_overflow',
  InvalidStream = 'invalid_stream',
}
```

### 6.2 Stream Processing in Interactive Mode

**Location:** `useGeminiStream.ts` (lines 800+)

```typescript
const processGeminiStreamEvents = async (
  stream: AsyncGenerator<ServerGeminiStreamEvent>,
  userMessageTimestamp: number,
  abortSignal: AbortSignal,
): Promise<StreamProcessingStatus> => {
  for await (const event of stream) {
    switch (event.type) {
      case GeminiEventType.Content:
        // Update UI with streamed text
        handleContentEvent(event.value, ...);
        break;

      case GeminiEventType.Thought:
        // Update loading indicator with thought
        setThought(event.value);
        break;

      case GeminiEventType.ToolCallRequest:
        // Schedule tool execution
        scheduleToolCalls([event.value], abortSignal);
        break;

      case GeminiEventType.ToolCallConfirmation:
        // Show confirmation dialog to user
        // Wait for user approval
        break;

      case GeminiEventType.Finished:
        // Mark stream as complete
        addItem(pendingHistoryItem, userMessageTimestamp);
        setPendingHistoryItem(null);
        break;

      case GeminiEventType.Error:
        // Handle error gracefully
        handleErrorEvent(event.value);
        break;

      case GeminiEventType.LoopDetected:
        // Notify user of loop detection
        loopDetectedRef.current = true;
        break;
    }
  }
};
```

### 6.3 Stream Processing in Non-Interactive Mode

**Location:** `nonInteractiveCli.ts` (lines 287-431)

```typescript
const responseStream = geminiClient.sendMessageStream(
  currentMessages[0]?.parts || [],
  abortController.signal,
  prompt_id,
);

let responseText = '';
for await (const event of responseStream) {
  if (abortController.signal.aborted) {
    handleCancellationError(config);
  }

  if (event.type === GeminiEventType.Content) {
    // Accumulate response text
    if (config.getOutputFormat() === OutputFormat.JSON) {
      responseText += event.value;
    } else {
      textOutput.write(event.value);  // Write to stdout
    }
  } 
  else if (event.type === GeminiEventType.ToolCallRequest) {
    // Execute tool and collect response
    const completedToolCall = await executeToolCall(
      config,
      requestInfo,
      abortController.signal,
    );
    toolResponseParts.push(...completedToolCall.response.responseParts);
  }
  else if (event.type === GeminiEventType.Error) {
    throw event.value.error;
  }
}
```

---

## 7. SPECIAL HANDLING

### 7.1 Tool Confirmation Flow

**Interactive Mode:**
1. Model requests tool execution
2. ToolCallConfirmation event sent
3. Dialog displayed to user
4. User clicks "Confirm" or "Cancel"
5. Response sent back to model
6. Tool executes or gets skipped

**Non-Interactive Mode (YOLO):**
- Tools auto-execute without confirmation
- Errors are caught and reported

### 7.2 Loop Detection

**Location:** `/packages/core/src/services/loopDetectionService.ts`

Detects when:
- Same query is sent multiple times
- Tool is called with same args repeatedly
- Model keeps returning same content

**User Options:**
1. Keep loop detection enabled (halt request)
2. Disable for session (continue request)

### 7.3 Next Speaker Check

**Location:** `/packages/core/src/utils/nextSpeakerChecker.ts`

After model response, checks if:
- Model should continue speaking
- User should provide input next
- Tool is needed next

Triggers continuation if model should continue.

### 7.4 Context Window Management

**Detection** (client.ts, lines 445-460):
```typescript
const estimatedRequestTokenCount = Math.floor(
  JSON.stringify(request).length / 4,
);

const remainingTokenCount =
  tokenLimit(modelForLimitCheck) - this.getChat().getLastPromptTokenCount();

if (estimatedRequestTokenCount > remainingTokenCount * 0.95) {
  yield {
    type: GeminiEventType.ContextWindowWillOverflow,
    value: { estimatedRequestTokenCount, remainingTokenCount },
  };
  return new Turn(this.getChat(), prompt_id);
}
```

**Recovery:**
- Automatic chat compression
- Removes oldest messages first
- Preserves recent context
- Falls back to fallback model if needed

---

## 8. DETAILED FLOW DIAGRAM: End-to-End

```
┌─────────────────────────────────────────────────────────────────┐
│                     USER INPUT                                   │
├─────────────────────────────────────────────────────────────────┤
│ Interactive Mode:              Non-Interactive Mode:             │
│ - Terminal keyboard input      - CLI arguments (--prompt)        │
│ - Readline/keypress events     - Piped stdin                     │
│ - Buffer management            - Environment variables           │
└────────────┬────────────────────────────┬────────────────────────┘
             │                            │
             ▼                            ▼
        ┌──────────────┐           ┌──────────────┐
        │  InputPrompt │           │  readStdin   │
        │  Component   │           │  Function    │
        └────────┬─────┘           └──────┬───────┘
                 │                        │
                 └────────────┬───────────┘
                              ▼
                    ┌──────────────────┐
                    │  Input Validation│
                    │  & Trimming      │
                    └─────────┬────────┘
                              ▼
                    ┌──────────────────┐
                    │ Command Detection│
                    │ - Slash (/)      │
                    │ - @ Command      │
                    │ - Shell mode     │
                    └─────────┬────────┘
                              │
          ┌───────────────────┼───────────────────┐
          │                   │                   │
          ▼                   ▼                   ▼
    ┌────────────┐    ┌──────────────┐    ┌────────────┐
    │Slash Cmd   │    │@ Command     │    │Normal Text │
    │Handler     │    │Handler       │    │Processing  │
    │- Query     │    │- File Include│    │            │
    │- Tool Call │    │- Resolve     │    │            │
    └─────┬──────┘    │  files       │    └──────┬─────┘
          │           └──────┬───────┘           │
          │                  │                   │
          └──────────┬───────┴───────────────────┘
                     ▼
         ┌─────────────────────┐
         │ Add to History      │
         │ (User Message Item) │
         └──────────┬──────────┘
                    ▼
         ┌─────────────────────┐
         │ Log User Prompt     │
         │ (Telemetry)         │
         └──────────┬──────────┘
                    ▼
         ┌────────────────────────┐
         │ Get/Initialize Chat    │
         │ (startChat/resumeChat) │
         └──────────┬─────────────┘
                    ▼
         ┌────────────────────────┐
         │ Build System Prompt    │
         │ (getCoreSystemPrompt)  │
         │ + User Memory          │
         │ + Dynamic Sections     │
         └──────────┬─────────────┘
                    ▼
         ┌────────────────────────┐
         │ Initialize Chat Config │
         │ - Temperature: 0       │
         │ - TopP: 1              │
         │ - Tools (declarations) │
         │ - Thinking config      │
         └──────────┬─────────────┘
                    ▼
         ┌────────────────────────┐
         │ Get Initial History    │
         │ (getInitialChatHistory)│
         │ - Environment context  │
         │ - Directory structure  │
         │ - Date & OS info       │
         └──────────┬─────────────┘
                    ▼
         ┌────────────────────────┐
         │ Add IDE Context (if    │
         │ IDE mode enabled)      │
         │ - Full or Delta        │
         │ - Active file info     │
         │ - Cursor position      │
         └──────────┬─────────────┘
                    ▼
         ┌────────────────────────┐
         │ Check Context Window   │
         │ - Count tokens         │
         │ - Remaining capacity   │
         │ - Trigger compression? │
         └──────────┬─────────────┘
                    ▼
         ┌────────────────────────┐
         │ Try Chat Compression   │
         │ - Generate summary     │
         │ - Replace history      │
         │ - Update token count   │
         └──────────┬─────────────┘
                    ▼
         ┌────────────────────────┐
         │ Check for Loop         │
         │ Detection              │
         └──────────┬─────────────┘
                    ▼
         ┌────────────────────────┐
         │ Select Model (if auto) │
         │ via Model Router       │
         └──────────┬─────────────┘
                    ▼
         ┌────────────────────────┐
         │ Build API Request      │
         │ - Model                │
         │ - System prompt        │
         │ - Chat history         │
         │ - Tools                │
         │ - Current message      │
         │ - Config               │
         └──────────┬─────────────┘
                    ▼
         ┌────────────────────────┐
         │ LoggingContentGenerator│
         │ - Log request          │
         └──────────┬─────────────┘
                    ▼
         ┌────────────────────────┐
         │ Send to API            │
         │ - GoogleGenAI          │
         │ - CodeAssistServer     │
         │ - Vertex AI            │
         │ (based on auth type)   │
         │                        │
         │ Returns async stream   │
         └──────────┬─────────────┘
                    ▼
         ┌────────────────────────┐
         │ Streaming Response     │
         │ Processing             │
         │ for each event:        │
         └───┬──────┬──────┬──────┬┘
             │      │      │      │
      ┌──────▼─┐ ┌──▼────┐ ┌──▼──┐ ┌──▼────┐
      │Content │ │Thought│ │Tool  │ │Finish │
      │- Text  │ │- Brief│ │- Req │ │- Res  │
      │- Update│ │  Summ │ │- Exec│ │- Meta │
      │  UI    │ │       │ │- Resp│ │       │
      └────────┘ └───────┘ └──────┘ └───────┘
             │      │      │      │
             └──────┴──────┴──────┘
                    │
                    ▼
         ┌────────────────────────┐
         │ Add to Chat History    │
         │ - Model message        │
         │ - Tool responses       │
         └──────────┬─────────────┘
                    ▼
         ┌────────────────────────┐
         │ Check for More Turns   │
         │ - Loop detection?      │
         │ - Next speaker check?  │
         │ - Max turns exceeded?  │
         └──────────┬─────────────┘
                    │
            ┌───────┴────────┐
            │                │
            ▼                ▼
    ┌──────────────┐   ┌────────────┐
    │Continue Loop │   │End Stream  │
    │Send response │   │Return to   │
    │back to model │   │User/CLI    │
    └──────────────┘   └────────────┘
```

---

## 9. KEY FILES SUMMARY

| File Path | Purpose | Key Functions |
|-----------|---------|----------------|
| `/packages/cli/src/gemini.tsx` | Main CLI entry point (interactive) | `main()`, `startInteractiveUI()` |
| `/packages/cli/src/nonInteractiveCli.ts` | Non-interactive CLI entry | `runNonInteractive()` |
| `/packages/cli/src/ui/AppContainer.tsx` | Interactive UI container | Input handling, state management |
| `/packages/cli/src/ui/components/InputPrompt.tsx` | Input UI component | Keyboard capture, text buffer |
| `/packages/cli/src/ui/hooks/useGeminiStream.ts` | Stream processing hook | `prepareQueryForGemini()`, event handling |
| `/packages/core/src/core/client.ts` | GeminiClient main class | `sendMessageStream()`, request building |
| `/packages/core/src/core/geminiChat.ts` | Chat management | History, tools, message sending |
| `/packages/core/src/core/prompts.ts` | System prompt builder | `getCoreSystemPrompt()`, prompt sections |
| `/packages/core/src/core/turn.ts` | Single conversation turn | Stream event processing |
| `/packages/core/src/core/contentGenerator.ts` | API abstraction | `createContentGenerator()`, auth routing |
| `/packages/core/src/core/loggingContentGenerator.ts` | API logging wrapper | Request/response/error logging |
| `/packages/core/src/utils/environmentContext.ts` | Context injection | `getInitialChatHistory()`, env info |
| `/packages/cli/src/nonInteractiveCliCommands.ts` | Slash command handler | `handleSlashCommand()` |
| `/packages/cli/src/ui/hooks/slashCommandProcessor.ts` | Interactive slash commands | Command execution |
| `/packages/cli/src/ui/hooks/atCommandProcessor.ts` | @ command handler | File inclusion |
| `/packages/core/src/services/chatCompressionService.ts` | Chat compression | History summarization |
| `/packages/core/src/services/loopDetectionService.ts` | Loop detection | Circular request detection |
| `/packages/cli/src/utils/readStdin.ts` | Stdin reader | Piped input handling |

---

## 10. DATA FLOW SUMMARY

### Request Flow
```
User Input → Input Buffer → Command Detection → History + Enrichment
  ↓
System Prompt + Tools + Context → GeminiChat → API Request
  ↓
ContentGenerator (with auth) → Google Gemini API
```

### Response Flow
```
API Stream → Turn Event Parser → Stream Events
  ↓
Interactive: UI Update + Event Handling
Non-Interactive: Text Output + Tool Execution
  ↓
Tool Execution (if needed) → Response Parts
  ↓
Add to History → Check for Continuation
  ↓
Next Turn or End Stream
```

### State Management
```
Interactive Mode:
  - TextBuffer: Input text state
  - History (useHistory): Conversation items
  - GeminiClient: API connection + chat state
  - UIState: Terminal UI state
  - Settings: User configuration

Non-Interactive Mode:
  - Config: All settings and tools
  - Chat: Conversation state
  - AbortController: Cancellation handling
  - Variables: Response accumulation
```

---

## 11. ORCHESTRATION POINTS

### Critical Decision Points:
1. **Input Validation** - Empty, cancelled, or too large?
2. **Command Detection** - Special handling needed?
3. **History Management** - Chat continuation or new session?
4. **Context Injection** - Add IDE context? Environment context?
5. **Request Building** - Model selection, tool availability, compression?
6. **Error Handling** - Retry? Fallback? Compression? New model?
7. **Stream Processing** - How to handle each event type?
8. **Tool Scheduling** - Execute? Confirm? Skip?
9. **Continuation** - Another turn or end?

### Extensibility Points:
1. **Tools** - Add via plugin/MCP system
2. **System Prompt** - Override via environment or settings
3. **Commands** - Add slash commands via files/MCP
4. **Auth** - Add auth types via extension
5. **Models** - Add via model router configuration
6. **Compression** - Customize via service injection

