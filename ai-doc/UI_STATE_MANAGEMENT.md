# UI State Management 說明

## 概述

gemini-cli 使用 React Context 管理 UI 狀態，主要分為三個層次：

1. **UIState** - 所有 UI 狀態（唯讀）
2. **UIActions** - 修改 UI 狀態的 actions
3. **各種 hooks** - 提供特定功能的狀態和操作

---

## 一、核心 Context

### 1. UIStateContext

位置：[packages/cli/src/ui/contexts/UIStateContext.tsx](packages/cli/src/ui/contexts/UIStateContext.tsx)

使用了 context 讓程式中需要知道 uiState 的地方都能用 useUIState() 取得。

**包含所有 UI 狀態**，例如：

```typescript
export interface UIState {
  // Dialog 狀態
  isThemeDialogOpen: boolean;
  isAuthDialogOpen: boolean;
  isEditorDialogOpen: boolean;
  isSettingsDialogOpen: boolean;
  isModelDialogOpen: boolean;
  isPermissionsDialogOpen: boolean;
  showPrivacyNotice: boolean;
  isFolderTrustDialogOpen: boolean;
  showWorkspaceMigrationDialog: boolean;
  showIdeRestartPrompt: boolean;

  // 錯誤訊息
  themeError: string | null;
  authError: string | null;
  editorError: string | null;
  initError: string | null;

  // 請求/確認
  shellConfirmationRequest: ShellConfirmationRequest | null;
  confirmationRequest: ConfirmationRequest | null;
  loopDetectionConfirmationRequest: LoopDetectionConfirmationRequest | null;
  proQuotaRequest: ProQuotaDialogRequest | null;

  // 其他狀態
  history: HistoryItem[];
  streamingState: StreamingState;
  corgiMode: boolean;
  debugMessage: string;
  // ... 更多狀態
}
```

使用方式：

```typescript
const uiState = useUIState();
if (uiState.isThemeDialogOpen) {
  // 顯示 theme dialog
}
```

### 2. UIActionsContext

位置：[packages/cli/src/ui/contexts/UIActionsContext.tsx](packages/cli/src/ui/contexts/UIActionsContext.tsx)

**提供修改 UI 狀態的函數**：

```typescript
export interface UIActions {
  // Dialog 控制
  handleThemeSelect: (
    themeName: string | undefined,
    scope: SettingScope,
  ) => void;
  handleThemeHighlight: (themeName: string | undefined) => void;
  handleAuthSelect: (
    authType: AuthType | undefined,
    scope: SettingScope,
  ) => void;
  setAuthState: (state: AuthState) => void;
  onAuthError: (error: string) => void;
  handleEditorSelect: (
    editorType: EditorType | undefined,
    scope: SettingScope,
  ) => void;
  exitEditorDialog: () => void;
  exitPrivacyNotice: () => void;
  closeSettingsDialog: () => void;
  closeModelDialog: () => void;
  closePermissionsDialog: () => void;

  // 其他 actions
  setShellModeActive: (value: boolean) => void;
  vimHandleInput: (key: Key) => boolean;
  handleFolderTrustSelect: (choice: FolderTrustChoice) => void;
  setConstrainHeight: (value: boolean) => void;
  onEscapePromptChange: (show: boolean) => void;
  handleFinalSubmit: (value: string) => void;
  handleClearScreen: () => void;
  handleProQuotaChoice: (choice: 'auth' | 'continue') => void;
  // ...
}
```

使用方式：

```typescript
const uiActions = useUIActions();
uiActions.handleThemeSelect('dracula', 'user');
```

---

## 二、Dialog 開啟流程

### 完整流程範例：`/theme` 命令

```
1. 用戶輸入 "/theme"
   ↓
2. slashCommandProcessor.handleSlashCommand()
   解析命令，找到 themeCommand
   ↓
3. themeCommand.action(context, args)
   返回 { type: 'dialog', dialog: 'theme' }
   ↓
4. slashCommandProcessor 處理返回值
   case 'dialog': case 'theme':
   → actions.openThemeDialog()
   ↓
5. openThemeDialog() (來自 useThemeCommand hook)
   → setIsThemeDialogOpen(true)
   ↓
6. UIState 更新
   isThemeDialogOpen: true
   ↓
7. DialogManager 檢測狀態
   if (uiState.isThemeDialogOpen) { ... }
   ↓
8. 渲染 <ThemeDialog />
```

### 各 Dialog 的觸發機制

#### Theme Dialog

- **Open**: `useThemeCommand().openThemeDialog()` → `setIsThemeDialogOpen(true)`
- **Close**: `handleThemeSelect()` → `setIsThemeDialogOpen(false)`
- **狀態**: `uiState.isThemeDialogOpen`

#### Auth Dialog

- **Open**: `setAuthState(AuthState.Updating)`
- **Close**: `setAuthState(AuthState.Complete)`
- **狀態**: `uiState.isAuthDialogOpen` (由 `authState === AuthState.Updating` 決定)

#### Editor Dialog

- **Open**: `useEditorSettings().openEditorDialog()` → `setIsEditorDialogOpen(true)`
- **Close**: `exitEditorDialog()` → `setIsEditorDialogOpen(false)`
- **狀態**: `uiState.isEditorDialogOpen`

#### Settings Dialog

- **Open**: `openSettingsDialog()` → `setIsSettingsDialogOpen(true)`
- **Close**: `closeSettingsDialog()` → `setIsSettingsDialogOpen(false)`
- **狀態**: `uiState.isSettingsDialogOpen`

#### Model Dialog

- **Open**: `openModelDialog()` → `setIsModelDialogOpen(true)`
- **Close**: `closeModelDialog()` → `setIsModelDialogOpen(false)`
- **狀態**: `uiState.isModelDialogOpen`

#### Permissions Dialog

- **Open**: `openPermissionsDialog()` → `setPermissionsDialogOpen(true)`
- **Close**: `closePermissionsDialog()` → `setPermissionsDialogOpen(false)`
- **狀態**: `uiState.isPermissionsDialogOpen`

#### Privacy Notice

- **Open**: `setShowPrivacyNotice(true)`
- **Close**: `exitPrivacyNotice()` → `setShowPrivacyNotice(false)`
- **狀態**: `uiState.showPrivacyNotice`

---

## 三、狀態管理架構

### AppContainer.tsx 的角色

位置：[packages/cli/src/ui/AppContainer.tsx](packages/cli/src/ui/AppContainer.tsx)

**AppContainer** 是狀態管理的中樞：

```typescript
export function AppContainer({ config, settings }: AppContainerProps) {
  // 1. 使用各種 hooks 獲取狀態和 actions
  const { isThemeDialogOpen, openThemeDialog, handleThemeSelect, ... } = useThemeCommand(...);
  const { isAuthDialogOpen, setAuthState, ... } = useAuthCommand(...);
  const { isEditorDialogOpen, openEditorDialog, ... } = useEditorSettings(...);
  const { isSettingsDialogOpen, openSettingsDialog, closeSettingsDialog } = useSettingsCommand(...);
  const { isModelDialogOpen, openModelDialog, closeModelDialog } = useModelCommand(...);

  // 2. 組裝 slashCommandActions (給 slash command processor 使用)
  const slashCommandActions = useMemo(() => ({
    openAuthDialog: () => setAuthState(AuthState.Updating),
    openThemeDialog,
    openEditorDialog,
    openSettingsDialog,
    openModelDialog,
    openPermissionsDialog,
    openPrivacyNotice: () => setShowPrivacyNotice(true),
    quit: (messages) => { ... },
    // ...
  }), [...]);

  // 3. 初始化 slashCommandProcessor
  const { handleSlashCommand, ... } = useSlashCommandProcessor(
    config,
    settings,
    historyManager,
    slashCommandActions,  // 傳入 actions
    // ...
  );

  // 4. 組裝 UIState
  const uiState: UIState = useMemo(() => ({
    isThemeDialogOpen,
    isAuthDialogOpen,
    isEditorDialogOpen,
    isSettingsDialogOpen,
    isModelDialogOpen,
    isPermissionsDialogOpen,
    showPrivacyNotice,
    // ... 所有其他狀態
  }), [...]);

  // 5. 組裝 UIActions
  const uiActions: UIActions = useMemo(() => ({
    handleThemeSelect,
    handleThemeHighlight,
    handleAuthSelect,
    setAuthState,
    handleEditorSelect,
    exitEditorDialog,
    exitPrivacyNotice,
    closeSettingsDialog,
    closeModelDialog,
    closePermissionsDialog,
    // ...
  }), [...]);

  // 6. 提供 Context 給子組件
  return (
    <ConfigContext.Provider value={config}>
      <SettingsContext.Provider value={settings}>
        <UIStateContext.Provider value={uiState}>
          <UIActionsContext.Provider value={uiActions}>
            <App />
          </UIActionsContext.Provider>
        </UIStateContext.Provider>
      </SettingsContext.Provider>
    </ConfigContext.Provider>
  );
}
```

### DialogManager 的角色

位置：[packages/cli/src/ui/components/DialogManager.tsx](packages/cli/src/ui/components/DialogManager.tsx)

**DialogManager** 根據 `uiState` 決定渲染哪個 dialog（**優先級順序很重要**）：

```typescript
export const DialogManager = ({ addItem, terminalWidth }: DialogManagerProps) => {
  const uiState = useUIState();
  const uiActions = useUIActions();

  // 優先級從高到低檢查
  if (uiState.showIdeRestartPrompt) {
    return <IdeTrustChangeDialog reason={uiState.ideTrustRestartReason} />;
  }
  if (uiState.showWorkspaceMigrationDialog) {
    return <WorkspaceMigrationDialog ... />;
  }
  if (uiState.proQuotaRequest) {
    return <ProQuotaDialog ... />;
  }
  if (uiState.shouldShowIdePrompt) {
    return <IdeIntegrationNudge ... />;
  }
  if (uiState.isFolderTrustDialogOpen) {
    return <FolderTrustDialog ... />;
  }
  if (uiState.shellConfirmationRequest) {
    return <ShellConfirmationDialog request={uiState.shellConfirmationRequest} />;
  }
  if (uiState.loopDetectionConfirmationRequest) {
    return <LoopDetectionConfirmation ... />;
  }
  if (uiState.confirmationRequest) {
    return <ConsentPrompt ... />;
  }
  if (uiState.confirmUpdateExtensionRequests.length > 0) {
    return <ConsentPrompt ... />;
  }
  if (uiState.isThemeDialogOpen) {
    return <ThemeDialog ... />;
  }
  if (uiState.isSettingsDialogOpen) {
    return <SettingsDialog ... />;
  }
  if (uiState.isModelDialogOpen) {
    return <ModelDialog ... />;
  }
  if (uiState.isAuthenticating) {
    return <AuthInProgress ... />;
  }
  if (uiState.isAuthDialogOpen) {
    return <AuthDialog ... />;
  }
  if (uiState.isEditorDialogOpen) {
    return <EditorSettingsDialog ... />;
  }
  if (uiState.showPrivacyNotice) {
    return <PrivacyNotice ... />;
  }
  if (uiState.isPermissionsDialogOpen) {
    return <PermissionsModifyTrustDialog ... />;
  }

  return null; // 沒有 dialog 需要顯示
};
```

**重點**：

- 同一時間只能顯示一個 dialog
- 優先級由 `if` 順序決定（越上面優先級越高）
- 系統級 dialog（IDE restart、folder trust）優先級最高
- 用戶主動開啟的 dialog（theme、settings）優先級較低

---

## 四、專用 Hooks

### useThemeCommand

位置：[packages/cli/src/ui/hooks/useThemeCommand.ts](packages/cli/src/ui/hooks/useThemeCommand.ts)

管理 theme dialog 的狀態和操作：

```typescript
const {
  isThemeDialogOpen, // 狀態
  openThemeDialog, // 開啟 dialog
  handleThemeSelect, // 選擇 theme 並儲存
  handleThemeHighlight, // 預覽 theme（不儲存）
} = useThemeCommand(settings, setThemeError, addItem, initialThemeError);
```

### useAuthCommand

位置：[packages/cli/src/ui/auth/useAuth.ts](packages/cli/src/ui/auth/useAuth.ts)

管理 auth 相關狀態：

```typescript
const {
  authState,              // 當前認證狀態
  setAuthState,           // 設置認證狀態
  isAuthDialogOpen,       // dialog 開啟狀態
  handleAuthSelect,       // 選擇認證方式
  // ...
} = useAuthCommand(...);
```

### useEditorSettings

位置：[packages/cli/src/ui/hooks/useEditorSettings.ts](packages/cli/src/ui/hooks/useEditorSettings.ts)

管理編輯器設定：

```typescript
const {
  isEditorDialogOpen,
  openEditorDialog,
  handleEditorSelect,
  exitEditorDialog,
} = useEditorSettings(settings, setEditorError, addItem);
```

### useSettingsCommand

位置：[packages/cli/src/ui/hooks/useSettingsCommand.ts](packages/cli/src/ui/hooks/useSettingsCommand.ts)

管理 settings dialog：

```typescript
const { isSettingsDialogOpen, openSettingsDialog, closeSettingsDialog } =
  useSettingsCommand();
```

### useModelCommand

位置：[packages/cli/src/ui/hooks/useModelCommand.ts](packages/cli/src/ui/hooks/useModelCommand.ts)

管理 model selection dialog：

```typescript
const { isModelDialogOpen, openModelDialog, closeModelDialog } =
  useModelCommand();
```

---

## 五、狀態流向圖

```
用戶操作 (輸入 /theme)
    ↓
slashCommandProcessor
    ↓
themeCommand.action() 返回 { type: 'dialog', dialog: 'theme' }
    ↓
slashCommandActions.openThemeDialog()
    ↓
useThemeCommand hook
    ↓
useState: setIsThemeDialogOpen(true)
    ↓
AppContainer 重新渲染
    ↓
uiState.isThemeDialogOpen = true
    ↓
UIStateContext 更新
    ↓
DialogManager useUIState() 獲取新狀態
    ↓
if (uiState.isThemeDialogOpen) → 渲染 <ThemeDialog />
    ↓
用戶選擇 theme
    ↓
ThemeDialog 調用 onSelect
    ↓
handleThemeSelect (from useThemeCommand)
    ↓
儲存設定 + setIsThemeDialogOpen(false)
    ↓
Dialog 關閉
```

---

## 六、關鍵設計模式

### 1. 單一數據流

所有狀態變更都通過明確定義的 actions，不允許直接修改 state。

### 2. 狀態提升

所有 dialog 狀態都提升到 `AppContainer`，通過 Context 共享。

### 3. 關注點分離

- **Hooks** 負責邏輯和狀態管理
- **Components** 負責 UI 渲染
- **Context** 負責狀態分發

### 4. 優先級控制

`DialogManager` 通過 if 順序控制 dialog 顯示優先級，確保關鍵系統 dialog 優先顯示。

---

## 七、新增 Dialog 的步驟

假設要新增一個 "Advanced Settings" dialog：

### 1. 建立 Dialog 組件

```typescript
// packages/cli/src/ui/components/AdvancedSettingsDialog.tsx
export const AdvancedSettingsDialog = ({ onClose }: Props) => {
  // ... dialog UI
};
```

### 2. 建立 Hook（可選）

```typescript
// packages/cli/src/ui/hooks/useAdvancedSettings.ts
export const useAdvancedSettings = () => {
  const [isOpen, setIsOpen] = useState(false);

  return {
    isAdvancedSettingsDialogOpen: isOpen,
    openAdvancedSettingsDialog: () => setIsOpen(true),
    closeAdvancedSettingsDialog: () => setIsOpen(false),
  };
};
```

### 3. 在 AppContainer 整合

```typescript
// AppContainer.tsx
const {
  isAdvancedSettingsDialogOpen,
  openAdvancedSettingsDialog,
  closeAdvancedSettingsDialog,
} = useAdvancedSettings();

// 加入 slashCommandActions
const slashCommandActions = useMemo(
  () => ({
    // ... 其他 actions
    openAdvancedSettingsDialog,
  }),
  [openAdvancedSettingsDialog],
);

// 加入 uiState
const uiState: UIState = useMemo(
  () => ({
    // ... 其他狀態
    isAdvancedSettingsDialogOpen,
  }),
  [isAdvancedSettingsDialogOpen],
);

// 加入 uiActions
const uiActions: UIActions = useMemo(
  () => ({
    // ... 其他 actions
    closeAdvancedSettingsDialog,
  }),
  [closeAdvancedSettingsDialog],
);
```

### 4. 更新 UIStateContext 類型

```typescript
// UIStateContext.tsx
export interface UIState {
  // ... 其他狀態
  isAdvancedSettingsDialogOpen: boolean;
}
```

### 5. 更新 UIActionsContext 類型

```typescript
// UIActionsContext.tsx
export interface UIActions {
  // ... 其他 actions
  closeAdvancedSettingsDialog: () => void;
}
```

### 6. 在 DialogManager 加入渲染邏輯

```typescript
// DialogManager.tsx
if (uiState.isAdvancedSettingsDialogOpen) {
  return <AdvancedSettingsDialog onClose={uiActions.closeAdvancedSettingsDialog} />;
}
```

### 7. 建立 Slash Command（可選）

```typescript
// packages/cli/src/ui/commands/advancedCommand.ts
export const advancedCommand: SlashCommand = {
  name: 'advanced',
  description: 'Open advanced settings',
  kind: CommandKind.BUILT_IN,
  action: async () => {
    return {
      type: 'dialog',
      dialog: 'advanced',
    };
  },
};
```

### 8. 更新 OpenDialogActionReturn 類型

```typescript
// packages/cli/src/ui/commands/types.ts
export interface OpenDialogActionReturn {
  type: 'dialog';
  dialog:
    | 'help'
    | 'auth'
    | 'theme'
    | 'editor'
    | 'privacy'
    | 'settings'
    | 'model'
    | 'permissions'
    | 'advanced'; // 新增
}
```

### 9. 在 slashCommandProcessor 處理

```typescript
// slashCommandProcessor.ts
case 'dialog':
  switch (result.dialog) {
    // ... 其他 cases
    case 'advanced':
      actions.openAdvancedSettingsDialog();
      return { type: 'handled' };
  }
```

---

## 八、相關檔案索引

### Context

- [UIStateContext.tsx](packages/cli/src/ui/contexts/UIStateContext.tsx) - UI 狀態定義
- [UIActionsContext.tsx](packages/cli/src/ui/contexts/UIActionsContext.tsx) - UI actions 定義

### 核心

- [AppContainer.tsx](packages/cli/src/ui/AppContainer.tsx) - 狀態管理中樞
- [DialogManager.tsx](packages/cli/src/ui/components/DialogManager.tsx) - Dialog 渲染管理

### Hooks

- [useThemeCommand.ts](packages/cli/src/ui/hooks/useThemeCommand.ts)
- [useAuth.ts](packages/cli/src/ui/auth/useAuth.ts)
- [useEditorSettings.ts](packages/cli/src/ui/hooks/useEditorSettings.ts)
- [useSettingsCommand.ts](packages/cli/src/ui/hooks/useSettingsCommand.ts)
- [useModelCommand.ts](packages/cli/src/ui/hooks/useModelCommand.ts)
- [slashCommandProcessor.ts](packages/cli/src/ui/hooks/slashCommandProcessor.ts)

### Dialog 組件

- [ThemeDialog.tsx](packages/cli/src/ui/components/ThemeDialog.tsx)
- [AuthDialog.tsx](packages/cli/src/ui/auth/AuthDialog.tsx)
- [EditorSettingsDialog.tsx](packages/cli/src/ui/components/EditorSettingsDialog.tsx)
- [SettingsDialog.tsx](packages/cli/src/ui/components/SettingsDialog.tsx)
- [ModelDialog.tsx](packages/cli/src/ui/components/ModelDialog.tsx)
- [PermissionsModifyTrustDialog.tsx](packages/cli/src/ui/components/PermissionsModifyTrustDialog.tsx)
- [PrivacyNotice.tsx](packages/cli/src/ui/privacy/PrivacyNotice.tsx)

### 類型

- [types.ts](packages/cli/src/ui/commands/types.ts) - Slash command 返回類型
