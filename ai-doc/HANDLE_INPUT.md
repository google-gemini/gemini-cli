# Interactive Mode Input Handling

This document outlines how user input is processed in the Gemini CLI's interactive mode.

## Overview

User input is primarily managed within the React component `packages/cli/src/ui/components/InputPrompt.tsx`. This component is responsible for capturing keystrokes, managing the text buffer of the input prompt, handling special commands (like history and autocomplete), and triggering the submission of the prompt to the Gemini API.

## Key Components and Hooks

- **`InputPrompt.tsx`**: The central React component that renders the input prompt and orchestrates all input-related logic.

- **`useKeypress` Hook**: This hook is used within `InputPrompt.tsx` to register a global listener for keyboard events. It captures every keypress and passes it to a central handler function.

- **`handleInput` Function**: Located in `InputPrompt.tsx`, this is the core callback function that receives key events from `useKeypress`. It contains a large switch-like structure to delegate actions based on the specific key or key combination pressed.

- **`TextBuffer` (`useTextBuffer` hook)**: The state of the input field (the text itself, cursor position, line wrapping, etc.) is managed by a `buffer` object. This object is created in `AppContainer.tsx` via the `useTextBuffer` hook and is passed down to `InputPrompt.tsx`. The `handleInput` function calls methods on the `buffer` (e.g., `buffer.newline()`, `buffer.deleteWordLeft()`) to manipulate the input text.

## Input Handling Logic

The `handleInput` function in `InputPrompt.tsx` processes keys as follows:

1.  **VIM Mode**: If VIM mode is enabled, the keypress is first offered to the VIM handler (`vimHandleInput`).

2.  **Character Input**: For standard alphanumeric characters and symbols, the event is passed to `buffer.handleInput(key)`, which appends the character to the input buffer at the current cursor position.

3.  **Submission (`Enter`)**: When the `Enter` key is pressed, `handleInput` calls the `handleSubmitAndClear` function. This triggers the submission flow and then clears the input buffer.

4.  **Special Keys & Shortcuts**: A comprehensive set of key matchers (`keyMatchers.ts`) is used to identify and handle a wide variety of commands:
    - **History**: Up/Down arrow keys are used to navigate through previous inputs, managed by the `useInputHistory` hook.
    - **Autocomplete & Suggestions**: `Tab` and arrow keys are used to interact with the command and file path completion system, managed by the `useCommandCompletion` hook.
    - **Editing**: Shortcuts like `Ctrl+K` (kill line), `Alt+Backspace` (delete word), and `Ctrl+L` (clear screen) are mapped to corresponding methods on the `TextBuffer`.
    - **Navigation**: `Home`, `End`, and arrow keys move the cursor within the buffer.
    - **Cancellation**: The `Escape` key is used to close suggestion menus or, when pressed twice, to clear the entire input buffer.

## Submission Flow

When a user types a prompt and presses `Enter`, the following sequence is initiated:

1.  The `useKeypress` hook in `InputPrompt.tsx` captures the `Enter` key event.
2.  The `handleInput` function identifies it as a `SUBMIT` command.
3.  It calls `handleSubmitAndClear(buffer.text)`.
4.  This function calls the `onSubmit` prop, which is wired to the `handleFinalSubmit` action in `AppContainer.tsx`.
5.  `handleFinalSubmit` adds the user's message to a processing queue (`useMessageQueue`).
6.  The message queue, once ready, calls the `submitQuery` function provided by the `useGeminiStream` hook.
7.  `useGeminiStream` takes the prompt and sends it to the Gemini API for processing.

## useGeminiStream Hook

`useGeminiStream` Hook（`packages/cli/src/ui/hooks/useGeminiStream.ts`）是所有 Gemini API 互動的核心協調器，管理使用者查詢從提交到回應的完整生命週期。

### 核心職責

1.  **查詢預處理**（`prepareQueryForGemini`）：
    - 處理斜線命令（`/`）- UI 專用命令或提示詞轉換
    - 處理 @ 命令（`@`）- 特殊上下文注入命令
    - 在啟用時處理 Shell 模式命令
    - 驗證並清理使用者輸入

2.  **串流事件處理**（`processGeminiStreamEvents`）：
    - **Thought**：即時顯示 AI 推理過程
    - **Content**：串流文字回應，使用智慧訊息分割以提升效能
    - **ToolCallRequest**：透過 `useReactToolScheduler` 排程工具執行
    - **Error**：處理 API 錯誤並顯示格式化錯誤訊息
    - **ChatCompressed**：當對話歷史被壓縮時發出通知
    - **Citation**：啟用時顯示來源引用
    - **LoopDetected**：防止無限工具呼叫迴圈
    - **Finished**：報告完成原因（token 限制、安全性封鎖等）

3.  **工具呼叫管理**（透過 `useReactToolScheduler`）：
    - 根據審批模式設定排程工具執行
    - 追蹤工具狀態轉換：`scheduled` → `executing` → `success`/`error`/`cancelled`
    - 自動將工具回應以函數呼叫結果的形式提交回 Gemini
    - 支援敏感操作的審批工作流程

4.  **狀態管理**：
    - **StreamingState.Idle**：準備接受新輸入
    - **StreamingState.Responding**：正在處理使用者查詢或執行工具
    - **StreamingState.WaitingForConfirmation**：等待使用者批准工具執行

5.  **特殊功能**：
    - **訊息分割**：大型回應在安全的 markdown 邊界處分割，以提升 UI 渲染效能
    - **Checkpointing**：對於檔案編輯工具（`replace`、`write_file`），執行前建立 Git 快照以實現回滾
    - **Memory 工具整合**：成功執行 `save_memory` 操作後自動重新整理記憶體上下文
    - **取消機制**：支援 ESC 鍵取消和基於 AbortController 的請求取消

### 回傳值

```typescript
{
  (streamingState, // 串流的當前狀態
    submitQuery, // 提交新查詢的函數
    initError, // 初始化錯誤（如有）
    pendingHistoryItems, // 尚未提交到歷史記錄的項目
    thought, // 當前 AI 思考摘要
    cancelOngoingRequest, // 取消活動請求的函數
    pendingToolCalls, // 活動/待處理的工具執行
    handleApprovalModeChange, // 處理審批模式切換
    activePtyId, // Shell 工具的活動虛擬終端 ID
    loopDetectionConfirmationRequest); // 迴圈偵測使用者確認
}
```

### 整合流程

```
使用者輸入 (InputPrompt)
    ↓
handleFinalSubmit (AppContainer)
    ↓
useMessageQueue
    ↓
submitQuery (useGeminiStream)
    ↓
prepareQueryForGemini
    ↓
geminiClient.sendMessageStream
    ↓
processGeminiStreamEvents
    ├─→ Content Events → 使用串流文字更新 UI
    ├─→ Tool Call Requests → scheduleToolCalls → useReactToolScheduler
    │       ↓
    │   執行工具
    │       ↓
    │   handleCompletedTools → submitQuery（續接）
    └─→ Finished Event → 更新最終狀態
```

此 Hook 是 Gemini CLI 的核心，以無縫串流體驗協調使用者互動、AI 回應、工具執行和狀態管理。

## submitQuery 函數

`submitQuery` 是 `useGeminiStream` 中最關鍵的函數，負責將使用者查詢提交至 Gemini API 並處理整個請求-回應循環。

### 函數簽名

```typescript
const submitQuery = async (
  query: PartListUnion, // 查詢內容（字串或 Part 陣列）
  options?: { isContinuation: boolean }, // 是否為續接請求（工具回應）
  prompt_id?: string, // 提示詞 ID（用於追蹤）
) => Promise<void>;
```

### 執行流程

1. **前置檢查**：
   - 如果正在回應中且非續接請求，直接返回
   - 防止重複提交

2. **初始化狀態**：
   - 重置配額錯誤標記（非續接時）
   - 建立新的 `AbortController` 用於取消
   - 重置取消標記
   - 生成或使用提供的 `prompt_id`

3. **查詢預處理**（透過 `prepareQueryForGemini`）：
   - Slash 命令處理（`/help`、`/chat` 等）
   - @ 命令處理（`@file`、`@memory` 等）
   - Shell 模式命令
   - 一般文字查詢驗證與清理

4. **記錄與統計**：
   - 記錄使用者提示詞事件（僅文字查詢）
   - 啟動新的提示詞計數
   - 重置思考狀態

5. **發送串流請求**：
   - 設定 `isResponding` 為 true
   - 呼叫 `geminiClient.sendMessageStream` 發送請求
   - 呼叫 `processGeminiStreamEvents` 處理串流事件
   - 處理完成後提交待處理的歷史項目

6. **迴圈偵測處理**：
   - 如果偵測到迴圈，顯示確認對話框

7. **錯誤處理**：
   - **UnauthorizedError**：觸發認證錯誤回調
   - **AbortError**：靜默處理（使用者取消）
   - **其他錯誤**：顯示格式化錯誤訊息

8. **清理**：
   - 設定 `isResponding` 為 false

### 兩種呼叫模式

#### 使用者發起的查詢

```typescript
submitQuery('幫我寫一個函數');
// isContinuation: undefined (false)
// 會記錄到歷史、產生新的 prompt_id、重置狀態
```

#### 工具回應續接

```typescript
submitQuery(
  [{ functionResponse: { name: "read_file", response: {...} } }],
  { isContinuation: true },
  existing_prompt_id
)
// isContinuation: true
// 不重置配額錯誤、不記錄新提示詞、使用相同 prompt_id
```

### 關鍵特性

- **Prompt ID Context**：使用 `promptIdContext.run` 在整個請求週期中追蹤 prompt ID
- **中止機制**：透過 `AbortController` 支援請求取消
- **狀態同步**：更新多個狀態（`isResponding`、`thought`、`initError`）
- **錯誤韌性**：區分不同錯誤類型並適當處理
- **續接支援**：工具執行完成後自動續接對話，形成多輪互動

### 遞迴續接流程

```
submitQuery("幫我讀取檔案")
    ↓
processGeminiStreamEvents
    ↓
收到 ToolCallRequest (read_file)
    ↓
scheduleToolCalls → 執行 read_file 工具
    ↓
handleCompletedTools
    ↓
submitQuery([functionResponse], { isContinuation: true })  ← 遞迴呼叫
    ↓
processGeminiStreamEvents（處理包含檔案內容的回應）
    ↓
收到 Content Event（Gemini 根據檔案內容回應）
    ↓
完成
```

此函數是整個對話流程的入口點，協調了預處理、API 通訊、事件處理和狀態管理，並透過遞迴續接實現了複雜的多輪工具互動。

## sendMessageStream 函數

`sendMessageStream` 是 `GeminiClient` 類別（`packages/core/src/core/client.ts`）中的核心方法，負責將訊息發送至 Gemini API 並以非同步串流方式處理回應。

### 函數簽名

```typescript
async *sendMessageStream(
  request: PartListUnion,      // 請求內容（字串或 Part 陣列）
  signal: AbortSignal,         // 中止訊號
  prompt_id: string,           // 提示詞 ID（用於追蹤）
  turns: number = MAX_TURNS,   // 最大回合數（預設 100）
): AsyncGenerator<ServerGeminiStreamEvent, Turn>
```

### 執行流程

1. **Prompt ID 追蹤與重置**：
   - 如果 `prompt_id` 改變，重置迴圈偵測器和當前序列模型

2. **Session 回合限制檢查**：
   - 檢查是否超過最大 session 回合數（可設定）
   - 超過則產生 `MaxSessionTurns` 事件並提前返回

3. **聊天壓縮**（`tryCompressChat`）：
   - 當 token 數超過模型限制的 70%（`COMPRESSION_TOKEN_THRESHOLD`）時自動觸發
   - 保留最近 30% 的歷史記錄（`COMPRESSION_PRESERVE_THRESHOLD`）
   - 將前 70% 的內容透過 AI 壓縮為摘要
   - 壓縮成功時產生 `ChatCompressed` 事件

4. **IDE 上下文注入**：
   - 在 IDE 模式下，注入編輯器上下文資訊：
     - 活動檔案路徑
     - 游標位置（行號、字元位置）
     - 選取的文字
     - 其他開啟的檔案
   - 使用差異更新（delta）機制減少重複資訊
   - **重要限制**：在等待工具回應時不注入上下文，避免破壞 `functionCall` → `functionResponse` 的順序要求

5. **迴圈偵測**：
   - 在回合開始時呼叫 `loopDetector.turnStarted`
   - 偵測到迴圈則產生 `LoopDetected` 事件並提前返回

6. **模型路由與黏性（Routing & Stickiness）**：
   - **黏性邏輯**：如果 `currentSequenceModel` 已設定，繼續使用相同模型
   - **路由邏輯**：否則透過 `ModelRouterService.route` 根據上下文選擇最適合的模型
   - 選定後鎖定模型（`currentSequenceModel`），確保整個提示詞序列使用同一模型

7. **執行 Turn 並串流事件**：
   - 建立 `Turn` 物件並呼叫 `turn.run()`
   - 逐一 `yield` 串流事件（`Content`、`ToolCallRequest`、`Thought` 等）
   - 在每個事件中檢查迴圈偵測
   - 遇到 `Error` 事件時提前返回

8. **Next Speaker Check（續接檢查）**：
   - 如果沒有待處理的工具呼叫，呼叫 `checkNextSpeaker` 判斷下一個發言者
   - 如果是 `model`（模型應繼續回應），**遞迴呼叫** `sendMessageStream` 並傳入 `"Please continue."`
   - 使用 `yield*` 將遞迴呼叫的所有事件串流出去
   - 遞迴時減少剩餘回合數（`boundedTurns - 1`），防止無限遞迴

### 關鍵特性

#### 1. 非同步生成器（AsyncGenerator）

```typescript
async *sendMessageStream(...): AsyncGenerator<ServerGeminiStreamEvent, Turn>
```

- 使用 `yield` 逐一產生串流事件
- 最終返回 `Turn` 物件（包含完整回應資訊）

#### 2. 聊天壓縮機制

```typescript
const COMPRESSION_TOKEN_THRESHOLD = 0.7; // 70% 觸發壓縮
const COMPRESSION_PRESERVE_THRESHOLD = 0.3; // 保留最近 30%
```

壓縮流程：

1. 計算當前 token 數是否超過限制的 70%
2. 找到分割點（保留最近 30% 的使用者訊息）
3. 將前 70% 的歷史記錄發送給 AI 生成摘要
4. 建立新的聊天會話，包含：摘要 + 保留的歷史記錄
5. 如果壓縮後 token 數反而增加，標記失敗並回滾

#### 3. IDE 上下文差異更新

**首次發送**（完整上下文）：

```json
{
  "activeFile": {
    "path": "src/app.ts",
    "cursor": { "line": 42, "character": 10 },
    "selectedText": "function foo() {"
  },
  "otherOpenFiles": ["src/utils.ts", "src/types.ts"]
}
```

**後續發送**（僅差異）：

```json
{
  "changes": {
    "cursorMoved": {
      "path": "src/app.ts",
      "cursor": { "line": 45, "character": 0 }
    }
  }
}
```

#### 4. 模型黏性（Model Stickiness）

```typescript
if (this.currentSequenceModel) {
  modelToUse = this.currentSequenceModel; // 使用已鎖定的模型
} else {
  const decision = await router.route(routingContext);
  modelToUse = decision.model;
  this.currentSequenceModel = modelToUse; // 鎖定模型
}
```

確保同一個提示詞序列（包含多輪工具呼叫）使用相同模型，避免不一致。

#### 5. 遞迴續接（Recursive Continuation）

```typescript
if (nextSpeakerCheck?.next_speaker === 'model') {
  yield *
    this.sendMessageStream(
      [{ text: 'Please continue.' }],
      signal,
      prompt_id,
      boundedTurns - 1, // 減少剩餘回合數
    );
}
```

自動續接不完整的回應，最多支援 `MAX_TURNS = 100` 回合。

#### 6. AbortSignal 組合

```typescript
const controller = new AbortController();
const linkedSignal = AbortSignal.any([signal, controller.signal]);
```

支援雙重取消機制：

- 外部取消（使用者按 ESC）
- 內部取消（迴圈偵測觸發）

### 完整事件流程圖

```
sendMessageStream(request, signal, prompt_id)
    ↓
檢查 prompt_id 是否改變 → 重置迴圈偵測器
    ↓
檢查 session 回合限制 → yield MaxSessionTurns（如超過）
    ↓
嘗試聊天壓縮 (tryCompressChat)
    ├─→ token 數 < 70% 限制 → 跳過
    └─→ token 數 ≥ 70% 限制 → 壓縮並 yield ChatCompressed
    ↓
注入 IDE 上下文（僅在非工具回應等待期間）
    ├─→ 首次：完整上下文（activeFile, otherOpenFiles）
    └─→ 後續：差異更新（filesOpened, cursorMoved, selectionChanged）
    ↓
迴圈偵測 (loopDetector.turnStarted)
    └─→ 偵測到迴圈 → yield LoopDetected，提前返回
    ↓
模型路由與黏性
    ├─→ 已鎖定模型 → 使用 currentSequenceModel
    └─→ 未鎖定 → router.route() 選擇模型 → 鎖定
    ↓
執行 Turn (turn.run(modelToUse, request, signal))
    ↓
串流事件迴圈：
    ├─→ yield Thought 事件（AI 推理過程）
    ├─→ yield Content 事件（文字回應）
    ├─→ yield ToolCallRequest 事件（工具呼叫請求）
    ├─→ yield Error 事件（錯誤） → 提前返回
    ├─→ yield Citation 事件（引用來源）
    └─→ yield Finished 事件（完成原因）
    ↓
檢查是否有待處理的工具呼叫
    ├─→ 有 → 返回 Turn（等待工具執行完成）
    └─→ 無 → 執行 Next Speaker Check
        ↓
    checkNextSpeaker(chat, signal)
        ├─→ next_speaker === 'user' → 返回 Turn（對話結束）
        └─→ next_speaker === 'model' → 遞迴續接
            ↓
        yield* sendMessageStream("Please continue.", signal, prompt_id, turns-1)
            ↓
        （遞迴處理，最終返回頂層 Turn）
    ↓
返回 Turn 物件
```

### 與其他元件的互動

```
useGeminiStream.submitQuery
    ↓
geminiClient.sendMessageStream
    │
    ├─→ tryCompressChat
    │   └─→ contentGenerator.generateContent（生成摘要）
    │
    ├─→ getIdeContextParts
    │   └─→ ideContextStore.get()
    │
    ├─→ loopDetector.turnStarted / addAndCheck
    │
    ├─→ ModelRouterService.route
    │   └─→ 根據歷史和請求選擇模型
    │
    ├─→ Turn.run
    │   └─→ contentGenerator.generateContentStream
    │       └─→ 產生 ServerGeminiStreamEvent
    │
    ├─→ checkNextSpeaker
    │   └─→ baseLlmClient（判斷是否續接）
    │
    └─→ sendMessageStream（遞迴續接）
```

### 重要注意事項

1. **函數呼叫順序要求**：API 要求 `functionCall`（模型發起）必須立即由 `functionResponse`（使用者回應）跟隨，因此在工具呼叫等待期間不注入 IDE 上下文。

2. **模型黏性的必要性**：防止在工具呼叫過程中切換模型，確保對話一致性。

3. **壓縮失敗處理**：如果壓縮後 token 數反而增加，會設定 `hasFailedCompressionAttempt` 標記，避免後續自動壓縮（除非強制）。

4. **遞迴深度限制**：透過 `boundedTurns` 參數限制最大遞迴深度為 100，防止無限續接。

此函數是 Gemini CLI 與 AI 模型互動的最底層核心，處理了壓縮、路由、串流、迴圈偵測、上下文管理和自動續接等所有複雜邏輯。
