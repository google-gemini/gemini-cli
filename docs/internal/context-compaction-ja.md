# コンテキストCompaction処理 実装概要

## 概要

Gemini CLIのコンテキストCompaction（圧縮）機能は、会話履歴がモデルのトークン制限に近づいた際に、
古い会話履歴を要約してコンテキストウィンドウを効率的に利用するための機能です。

## アーキテクチャ概要

```
┌─────────────────┐     ┌──────────────────────────┐     ┌─────────────────┐
│  GeminiClient   │────▶│ ChatCompressionService   │────▶│   Gemini API    │
│  (client.ts)    │     │ (chatCompressionService) │     │ (要約生成用)    │
└─────────────────┘     └──────────────────────────┘     └─────────────────┘
        │                          │
        │                          ▼
        │               ┌──────────────────────────┐
        │               │  compressionPrompt       │
        │               │  (prompts.ts)            │
        │               └──────────────────────────┘
        ▼
┌─────────────────┐
│   tokenLimits   │
│ (tokenLimits.ts)│
└─────────────────┘
```

## 主要コンポーネント

### 1. ChatCompressionService

**ファイル**: `packages/core/src/services/chatCompressionService.ts`

Compaction処理の中核を担うサービスクラス。

#### 定数

| 定数名 | 値 | 説明 |
|--------|-----|------|
| `DEFAULT_COMPRESSION_TOKEN_THRESHOLD` | 0.5 | 圧縮を開始するトークン使用率の閾値（モデル制限の50%） |
| `COMPRESSION_PRESERVE_THRESHOLD` | 0.3 | 圧縮後に保持する最新履歴の割合（30%） |

### 2. トークン制限管理

**ファイル**: `packages/core/src/core/tokenLimits.ts`

各モデルのトークン制限を定義：

| モデル | トークン制限 |
|--------|-------------|
| gemini-1.5-pro | 2,097,152 |
| gemini-2.5-pro/flash/flash-lite | 1,048,576 |
| デフォルト | 1,048,576 |

### 3. トークン推定

**ファイル**: `packages/core/src/utils/tokenCalculation.ts`

```
ASCII文字:      0.25 トークン/文字
非ASCII文字:    1.3 トークン/文字（CJK文字等）
```

## Compactionアルゴリズム

### フェーズ1: 圧縮判定

```
if (estimatedRequestTokenCount > remainingTokenCount * 0.95) {
    // 自動圧縮をトリガー
    tryCompressChat(promptId, force=false)
}
```

または、ユーザーが手動で `/compress` コマンドを実行した場合：

```
tryCompressChat(promptId, force=true)
```

### フェーズ2: 圧縮閾値チェック

```typescript
// force=falseの場合のみ閾値チェック
if (!force) {
    const threshold = config.getCompressionThreshold() ?? 0.5;
    if (originalTokenCount < threshold * tokenLimit(model)) {
        return NOOP;  // 圧縮不要
    }
}
```

### フェーズ3: 分割点の決定（findCompressSplitPoint）

履歴を「圧縮する部分」と「保持する部分」に分割するアルゴリズム：

```
入力: contents[] - 会話履歴
     fraction - 圧縮対象の割合（1 - COMPRESSION_PRESERVE_THRESHOLD = 0.7）

アルゴリズム:
1. 各コンテンツの文字数をカウント
2. 総文字数の fraction (70%) を目標文字数とする
3. 先頭から順にスキャン:
   - userロール かつ functionResponseを含まない場合、有効な分割点としてマーク
   - 累積文字数が目標を超えた時点で、その位置を分割点として返す
4. 分割点が見つからない場合:
   - 最後がmodelロール かつ functionCallがない → 全履歴を圧縮
   - それ以外 → 最後の有効な分割点を使用

制約:
- 分割点は必ずuserメッセージ（functionResponse以外）の境界
- モデルがfunctionCallを実行中の場合は、その直前までしか圧縮しない
```

**図解:**

```
会話履歴: [U1, M1, U2, M2, U3, M3, U4, M4, U5, M5]
          ├──────────────────────┼─────────────────┤
          │   圧縮対象 (70%)     │  保持 (30%)     │
          │                      │                  │
          ▼                      ▼                  ▼
          splitPoint             historyToKeep
```

### フェーズ4: 要約生成

圧縮対象の履歴をLLMに送信し、構造化された要約を生成：

```typescript
const summaryResponse = await config.getBaseLlmClient().generateContent({
    modelConfigKey: { model: modelStringToModelConfigAlias(model) },
    contents: [
        ...historyToCompress,
        {
            role: 'user',
            parts: [{ text: 'First, reason in your scratchpad. Then, generate the <state_snapshot>.' }]
        }
    ],
    systemInstruction: { text: getCompressionPrompt() }
});
```

#### 圧縮モデルのマッピング

| メインモデル | 圧縮用モデル |
|-------------|-------------|
| gemini-3-pro-preview | chat-compression-3-pro |
| gemini-2.5-pro | chat-compression-2.5-pro |
| gemini-2.5-flash | chat-compression-2.5-flash |
| gemini-2.5-flash-lite | chat-compression-2.5-flash-lite |
| その他 | chat-compression-default |

### フェーズ5: 要約形式（State Snapshot）

生成される要約のXML構造：

```xml
<state_snapshot>
    <overall_goal>
        <!-- ユーザーの高レベル目標（1文） -->
        例: "認証サービスを新しいJWTライブラリを使用するようにリファクタリングする"
    </overall_goal>

    <key_knowledge>
        <!-- 重要な事実、規約、制約 -->
        - ビルドコマンド: `npm run build`
        - テスト: `npm test` で実行。テストファイルは `.test.ts` で終わる
        - APIエンドポイント: `https://api.example.com/v2`
    </key_knowledge>

    <file_system_state>
        <!-- 作成/読み込み/変更/削除されたファイルの状態 -->
        - CWD: `/home/user/project/src`
        - READ: `package.json` - 'axios' が依存関係であることを確認
        - MODIFIED: `services/auth.ts` - 'jsonwebtoken' を 'jose' に置換
        - CREATED: `tests/new-feature.test.ts` - 新機能のテスト構造
    </file_system_state>

    <recent_actions>
        <!-- 最近の重要なエージェントアクションとその結果 -->
        - `grep 'old_function'` を実行、2ファイルで3件の結果
        - `npm run test` を実行、UserProfile.test.ts でスナップショット不一致
        - `ls -F static/` で画像アセットが .webp 形式であることを発見
    </recent_actions>

    <current_plan>
        <!-- ステップバイステップの計画と進捗状況 -->
        1. [DONE] 非推奨の 'UserAPI' を使用しているファイルを特定
        2. [IN PROGRESS] src/components/UserProfile.tsx を新しい 'ProfileAPI' を使用するようリファクタリング
        3. [TODO] 残りのファイルをリファクタリング
        4. [TODO] テストをAPI変更に合わせて更新
    </current_plan>
</state_snapshot>
```

### フェーズ6: 新履歴の構築

```typescript
const newHistory = [
    {
        role: 'user',
        parts: [{ text: summary }]  // 生成された要約
    },
    {
        role: 'model',
        parts: [{ text: 'Got it. Thanks for the additional context!' }]
    },
    ...historyToKeep  // 保持された最新履歴（30%）
];
```

### フェーズ7: 検証と適用

```typescript
// トークン数を再計算
const newTokenCount = await calculateRequestTokenCount(...);

// 圧縮効果の検証
if (newTokenCount > originalTokenCount) {
    // 圧縮により増加 → 失敗
    return COMPRESSION_FAILED_INFLATED_TOKEN_COUNT;
} else {
    // 圧縮成功 → 新履歴を適用
    this.chat = await this.startChat(newHistory);
    return COMPRESSED;
}
```

## 圧縮ステータス

```typescript
enum CompressionStatus {
    COMPRESSED = 1,                              // 成功
    COMPRESSION_FAILED_INFLATED_TOKEN_COUNT,    // トークン増加により失敗
    COMPRESSION_FAILED_TOKEN_COUNT_ERROR,       // トークンカウントエラー
    NOOP                                         // 圧縮不要（アクションなし）
}
```

## フック統合

### PreCompressHook

圧縮処理の前に発火するフック：

```typescript
enum PreCompressTrigger {
    Manual = 'manual',  // /compress コマンド
    Auto = 'auto'       // 自動圧縮
}
```

ユーザーは圧縮前に会話のバックアップや通知処理を実行可能。

## シーケンス図

```
User            GeminiClient       ChatCompressionService      Gemini API
  │                  │                      │                      │
  │  send message    │                      │                      │
  │─────────────────▶│                      │                      │
  │                  │                      │                      │
  │                  │ check token usage    │                      │
  │                  │ (>95% capacity?)     │                      │
  │                  │──────┐               │                      │
  │                  │      │               │                      │
  │                  │◀─────┘               │                      │
  │                  │                      │                      │
  │                  │   compress()         │                      │
  │                  │─────────────────────▶│                      │
  │                  │                      │                      │
  │                  │                      │ firePreCompressHook  │
  │                  │                      │──────┐               │
  │                  │                      │      │               │
  │                  │                      │◀─────┘               │
  │                  │                      │                      │
  │                  │                      │ findCompressSplitPoint
  │                  │                      │──────┐               │
  │                  │                      │      │               │
  │                  │                      │◀─────┘               │
  │                  │                      │                      │
  │                  │                      │   generateContent    │
  │                  │                      │─────────────────────▶│
  │                  │                      │                      │
  │                  │                      │      summary         │
  │                  │                      │◀─────────────────────│
  │                  │                      │                      │
  │                  │   CompressionInfo    │                      │
  │                  │◀─────────────────────│                      │
  │                  │                      │                      │
  │  ChatCompressed  │                      │                      │
  │◀─────────────────│                      │                      │
  │                  │                      │                      │
```

## 設定オプション

| 設定項目 | デフォルト値 | 説明 |
|---------|-------------|------|
| `model.compressionThreshold` | 0.5 | 圧縮を開始するトークン使用率 |

## 関連ファイル一覧

| ファイルパス | 役割 |
|-------------|------|
| `packages/core/src/services/chatCompressionService.ts` | 圧縮サービス本体 |
| `packages/core/src/core/client.ts` | クライアント統合 |
| `packages/core/src/core/prompts.ts` | 圧縮プロンプト定義 |
| `packages/core/src/core/turn.ts` | 型定義（CompressionStatus等） |
| `packages/core/src/core/tokenLimits.ts` | モデルトークン制限 |
| `packages/core/src/utils/tokenCalculation.ts` | トークン推定 |
| `packages/cli/src/ui/commands/compressCommand.ts` | `/compress`コマンド |
| `packages/core/src/hooks/types.ts` | フック型定義 |
