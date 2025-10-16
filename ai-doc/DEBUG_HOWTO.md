# Gemini CLI 偵錯指南 (DEBUG_HOWTO)

本文件說明如何對 `gemini-cli` 進行偵錯，並記錄程式執行過程中的日誌。

## 1. 如何輸出日誌

最簡單的方式是在程式碼中加入 `console.log()`。你可以使用 `console.log`, `console.warn`, `console.error` 來輸出不同層級的訊息。

**範例：**

```javascript
console.log('這是一條偵錯訊息');
```

## 2. 如何查看日誌

根據你啟動應用程式的方式，有兩種主要的方法可以查看日誌：

### 方法 A：在終端機中直接查看 (Debug 模式)

如果你想在終端機中即時看到所有輸出的日誌

```
DEBUG=1 npm run start
```

### 方法 B：在應用程式介面中查看 (互動模式)

當你正常啟動應用程式時，日誌會被收集並顯示在內建的偵錯面板中。

1.  **正常啟動**:
    ```bash
    npm run start
    ```
2.  **打開偵錯面板**:
    在應用程式執行時，按下快捷鍵 **`Ctrl+O`**，即可打開或關閉「錯誤詳情 (Error Details)」面板，所有被截獲的日誌都會顯示在這裡。

## 3. 如何對其他專案進行偵錯

有時候，你會需要讓 `gemini-cli` 在另一個專案的目錄下執行偵錯。推薦使用 VS Code 的 `launch.json` 設定来達成。

1.  **打開 `launch.json`**:
    在 `gemini-cli` 專案的根目錄下，找到並打開 `.vscode/launch.json` 檔案。

2.  **修改 "Build & Launch CLI" 設定**:
    在檔案中找到名為 `"Build & Launch CLI"` 的設定區塊。

3.  **更改 `cwd` 路徑**:
    將 `cwd` (Current Working Directory) 的值從 `"${workspaceFolder}"` 改成你想要偵錯的專案的 **絕對路徑**。

    **範例**:
    假設你的另一個專案位於 `E:\my-other-project`，請修改如下：

    **修改前**:

    ```json
    "cwd": "${workspaceFolder}",
    ```

    **修改後**:

    ```json
    "cwd": "E:\\my-other-project",
    ```

    > **注意**: 在 Windows 系統中，路徑中的反斜線 `\` 需要寫成兩個 `\\`。

4.  **啟動偵錯**:
    儲存 `launch.json` 檔案。然後到 VS Code 的「執行與偵錯」面板，從下拉選單中選擇 **"Build & Launch CLI"**，按下綠色播放按鈕 (F5) 啟動偵錯。

    這樣，`gemini-cli` 就會在 `E:\my-other-project` 的情境下執行，並載入該專案的相關檔案。
