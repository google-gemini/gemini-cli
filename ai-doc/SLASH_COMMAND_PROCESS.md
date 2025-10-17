# slashCommandProcessor.ts 處理流程說明

## 檔案位置

`packages/cli/src/ui/hooks/slashCommandProcessor.ts`

## 主要功能

這個檔案是處理所有 slash commands（如 `/help`、`/clear`、`/theme`）的核心 React Hook。

---

## 一、命令載入與管理

### 載入器 (256-276 行)

使用三種 loader 依序載入命令：

```typescript
const loaders: CommandLoader[] = [
  new McpPromptLoader(mcpContext), // MCP prompt 命令
  new BuiltinCommandLoader(), // 內建命令
  new FileCommandLoader(workingDir), // 檔案自訂命令
];
```

每個 loader 負責載入特定類型的命令，最終合併為 `commands` 陣列。

---

## 二、命令處理流程

### 主要流程

```
用戶輸入 (如 "/theme dark")
    ↓
parseSlashCommand(input, commands)  // 解析命令名稱和參數
    ↓
找到對應的 SlashCommand
    ↓
執行 command.action(context, args)
    ↓
根據返回的 SlashCommandActionReturn 類型處理
    ↓
更新 UI / 執行對應操作
```

### CommandContext 結構 (180-232 行)

提供給所有命令的執行上下文：

```typescript
{
  invocation: {
    raw: string,      // 原始輸入
    name: string,     // 命令名稱
    args: string,     // 參數字串
  },
  services: {
    config: Config,
    settings: LoadedSettings,
    git: GitService,
    logger: Logger,
  },
  ui: {
    addItem,              // 添加歷史項目
    clear,                // 清空畫面
    loadHistory,          // 載入歷史
    setPendingItem,       // 設置待處理項目
    toggleCorgiMode,
    toggleVimEnabled,
    reloadCommands,
    // ...
  },
  session: {
    stats,                      // 會話統計
    sessionShellAllowlist,      // 本次會話批准的 shell 命令
  },
  overwriteConfirmed,  // 確認覆寫時為 true
}
```

---

## 三、返回類型處理

### 1. `type: 'tool'` (341-346 行)

調度工具調用，返回給外層處理：

```typescript
case 'tool':
  return {
    type: 'tool_call',
    toolName: result.toolName,
    toolArgs: result.toolArgs,
  };
```

### 2. `type: 'message'` (347-358 行)

顯示訊息（info 或 error）：

```typescript
case 'message':
  addItem({
    role: 'info',
    messageType: result.messageType,
    content: result.content,
  });
  return { type: 'handled' };
```

### 3. `type: 'dialog'` (359-390 行)

打開對應的 dialog：

```typescript
case 'dialog':
  switch (result.dialog) {
    case 'auth':
      actions.openAuthDialog();
      return { type: 'handled' };
    case 'theme':
      actions.openThemeDialog();
      return { type: 'handled' };
    case 'editor':
      actions.openEditorDialog();
      return { type: 'handled' };
    case 'privacy':
      actions.openPrivacyNotice();
      return { type: 'handled' };
    case 'settings':
      actions.openSettingsDialog();
      return { type: 'handled' };
    case 'model':
      actions.openModelDialog();
      return { type: 'handled' };
    case 'permissions':
      actions.openPermissionsDialog();
      return { type: 'handled' };
  }
```

### 4. `type: 'load_history'` (391-398 行)

載入聊天歷史：

```typescript
case 'load_history':
  clearScreen();
  loadHistory(result.history);
  return {
    type: 'load_history',
    clientHistory: result.clientHistory,
  };
```

### 5. `type: 'submit_prompt'` (404-408 行)

提交 prompt 給 Gemini：

```typescript
case 'submit_prompt':
  return {
    type: 'submit_prompt',
    content: result.content,
  };
```

### 6. `type: 'confirm_shell_commands'` (409-448 行)

顯示 shell 命令確認對話框：

```typescript
case 'confirm_shell_commands':
  // 顯示確認對話框
  setShellConfirmationRequest({
    commands: result.commandsToConfirm,
    onComplete: async (confirmed, alwaysAllow) => {
      if (confirmed) {
        if (alwaysAllow) {
          // 加入本次 session 的 allowlist
          result.commandsToConfirm.forEach(cmd =>
            sessionShellAllowlist.add(cmd)
          );
        }
        // 重新執行原始命令
        await handleSlashCommand(result.originalInvocation.raw);
      }
      setShellConfirmationRequest(null);
    },
  });
  return { type: 'handled' };
```

**Shell Allowlist 機制：**

- 追蹤本次 session 已批准的 shell 命令
- 選擇"永遠允許"會加入 `sessionShellAllowlist`
- 下次執行相同命令時不再詢問

### 7. `type: 'confirm_action'` (449-478 行)

通用確認對話框：

```typescript
case 'confirm_action':
  setConfirmationRequest({
    prompt: result.prompt,
    onConfirm: async (confirmed) => {
      if (confirmed) {
        // 帶 overwriteConfirmed: true 重新執行
        const contextWithConfirmation = {
          ...commandContext,
          overwriteConfirmed: true,
        };
        // 重新執行命令
        await runCommand(parsedCommand, contextWithConfirmation);
      }
      setConfirmationRequest(null);
    },
  });
  return { type: 'handled' };
```

---

## 四、完整執行範例

### 範例：`/theme dark`

```
1. 用戶輸入: "/theme dark"
   ↓
2. parseSlashCommand("/theme dark", commands)
   → 找到 themeCommand
   → args = "dark"
   ↓
3. 執行 themeCommand.action(context, "dark")
   ↓
4. themeCommand 返回:
   { type: 'dialog', dialog: 'theme' }
   ↓
5. switch (result.dialog) case 'theme':
   → actions.openThemeDialog()
   ↓
6. 設置 isThemeDialogOpen = true
   ↓
7. DialogManager 渲染 <ThemeDialog />
```

### 範例：`/run npm test` (需要 shell 確認)

```
1. 用戶輸入: "/run npm test"
   ↓
2. runCommand.action() 檢查:
   - "npm test" 不在 sessionShellAllowlist
   - 需要用戶確認
   ↓
3. 返回:
   {
     type: 'confirm_shell_commands',
     commandsToConfirm: ['npm test'],
     originalInvocation: { raw: '/run npm test' }
   }
   ↓
4. 設置 shellConfirmationRequest
   ↓
5. 顯示 <ShellConfirmationDialog />
   ↓
6. 用戶選擇:
   - "執行一次" → 執行命令
   - "永遠允許" → 加入 allowlist + 執行命令
   - "取消" → 不執行
   ↓
7. 如果確認，重新執行 handleSlashCommand('/run npm test')
```

---

## 五、Hook 返回值

```typescript
return {
  handleSlashCommand, // 處理命令的主函數
  slashCommands: commands, // 所有可用命令列表
  pendingHistoryItems, // 待處理的歷史項目
  commandContext, // 命令執行上下文
  shellConfirmationRequest, // Shell 確認請求狀態
  confirmationRequest, // 通用確認請求狀態
};
```

---

## 六、錯誤處理 (509-527 行)

```typescript
try {
  // 執行命令
} catch (error) {
  logger.error(`Error processing slash command: ${error}`);
  addItem({
    role: 'info',
    messageType: 'error',
    content: `Error: ${error instanceof Error ? error.message : String(error)}`,
  });
}
```

---

## 七、相關檔案

### 類型定義

- `packages/cli/src/ui/commands/types.ts` - SlashCommandActionReturn 類型定義

### 命令實作

- `packages/cli/src/ui/commands/` - 所有內建命令
  - `themeCommand.ts`
  - `authCommand.ts`
  - `settingsCommand.ts`
  - `helpCommand.ts`
  - 等等...

### UI 組件

- `packages/cli/src/ui/components/DialogManager.tsx` - 管理所有 dialog 的渲染
- `packages/cli/src/ui/components/ShellConfirmationDialog.tsx` - Shell 確認對話框
- `packages/cli/src/ui/components/ConsentPrompt.tsx` - 通用確認對話框

### 工具函數

- `packages/cli/src/utils/commands.ts` - parseSlashCommand() 等工具函數

---

## 八、關鍵機制

### 1. 命令解析

使用 `parseSlashCommand()` 匹配命令名稱（支援 `altNames`）並分離參數。

### 2. 延遲執行

使用 `pendingHistoryItems` 暫存需要稍後添加到歷史的項目。

### 3. 確認流程

- Shell 命令確認：防止執行危險命令
- 通用確認：處理覆寫等需要用戶確認的操作
- 確認後重新執行命令，但帶上確認標記

### 4. Session Allowlist

- 只在當前 session 有效
- 重啟應用後清空
- 避免重複詢問相同的 shell 命令

---

## 九、擴展指南

### 新增自訂命令

1. 建立命令檔案（三種方式）：
   - **內建命令**: 在 `packages/cli/src/ui/commands/` 新增
   - **檔案命令**: 在專案根目錄新增 `.gemini/commands/*.js`
   - **MCP Prompt**: 透過 MCP server 提供

2. 實作 `SlashCommand` 介面：

```typescript
export const myCommand: SlashCommand = {
  name: 'mycommand',
  altNames: ['mc'],
  description: 'My custom command',
  kind: CommandKind.BUILT_IN,

  action: async (context, args) => {
    // 處理邏輯

    // 返回適當的 ActionReturn
    return {
      type: 'message',
      messageType: 'info',
      content: 'Command executed!',
    };
  },
};
```

3. 選擇返回類型：
   - `'message'` - 簡單訊息
   - `'dialog'` - 打開設定 dialog
   - `'tool'` - 調用工具
   - `'submit_prompt'` - 提交給 Gemini
   - `'confirm_shell_commands'` - 需要 shell 確認
   - `'confirm_action'` - 需要通用確認

### 新增 Dialog 類型

1. 在 `OpenDialogActionReturn` 新增類型
2. 在 `slashCommandProcessor.ts` 的 switch 新增 case
3. 實作對應的 `openXxxDialog()` action
4. 在 `DialogManager.tsx` 新增渲染邏輯
