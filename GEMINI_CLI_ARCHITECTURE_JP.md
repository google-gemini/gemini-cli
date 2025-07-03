# Gemini CLI アーキテクチャ詳細ガイド

このドキュメントは、Gemini CLIコードベースを理解するための包括的なガイドです。アーキテクチャ、設計思想、ファイル構造、および推奨される学習順序について詳しく説明します。

## 目次

1. [概要](#概要)
2. [アーキテクチャの全体像](#アーキテクチャの全体像)
3. [設計思想](#設計思想)
4. [ファイルを読む順序](#ファイルを読む順序)
5. [パッケージ詳細](#パッケージ詳細)
6. [重要な概念](#重要な概念)
7. [実行フロー](#実行フロー)
8. [拡張方法](#拡張方法)

## 概要

Gemini CLIは、GoogleのGemini AIモデルを使用したコマンドライン対話ツールです。このシステムは以下の特徴を持っています：

- **モノレポ構造**: 2つの主要パッケージ（`core`と`cli`）で構成
- **拡張可能なツールシステム**: プラガブルなツールアーキテクチャ
- **対話型UI**: React/Inkベースの豊富なターミナルインターフェース
- **安全性重視**: サンドボックス実行と承認フロー
- **多様な認証方法**: OAuth2、APIキー、Workspace認証

## アーキテクチャの全体像

```
┌─────────────────────────────────────────────────────────────┐
│                     Gemini CLI                              │
├─────────────────────────────────────────────────────────────┤
│  CLI Package (packages/cli/)                               │
│  ┌─────────────────┐  ┌─────────────────┐                  │
│  │   React/Ink UI  │  │   Config/Auth   │                  │
│  │   Components    │  │   Management    │                  │
│  └─────────────────┘  └─────────────────┘                  │
├─────────────────────────────────────────────────────────────┤
│  Core Package (packages/core/)                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐ │
│  │  Gemini Client  │  │  Tool Registry  │  │  Services   │ │
│  │  & API Layer    │  │  & Execution    │  │  & Utils    │ │
│  └─────────────────┘  └─────────────────┘  └─────────────┘ │
├─────────────────────────────────────────────────────────────┤
│  External Integrations                                     │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐ │
│  │  Gemini API     │  │  MCP Servers    │  │  Sandbox    │ │
│  │  (Google AI)    │  │  (External)     │  │  (Docker)   │ │
│  └─────────────────┘  └─────────────────┘  └─────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## 設計思想

### 1. **モジュラー設計**
- **分離された責任**: CLIパッケージ（フロントエンド）とCoreパッケージ（バックエンド）
- **独立開発**: 各パッケージが独立してテスト・開発可能
- **将来の拡張性**: 異なるフロントエンド（Web UI、VSCode拡張など）の可能性

### 2. **拡張可能なツールシステム**
- **プラガブルアーキテクチャ**: 新しいツールを簡単に追加
- **MCP（Model Context Protocol）サポート**: 外部ツールサーバーとの統合
- **動的ツール発見**: プロジェクト固有のツールを自動発見

### 3. **安全性とセキュリティ**
- **承認フロー**: 破壊的操作には明示的なユーザー承認
- **サンドボックス実行**: Docker/Podmanによる隔離された実行環境
- **段階的な権限**: デフォルト→AutoEdit→YOLO の3段階承認モード

### 4. **ユーザーエクスペリエンス**
- **リッチなターミナルUI**: React/Inkによる現代的なCLI体験
- **ストリーミング応答**: リアルタイムでの応答表示
- **コンテキスト保持**: 会話履歴とファイルコンテキストの管理

### 5. **パフォーマンス最適化**
- **チャット圧縮**: トークン制限に応じた自動会話要約
- **メモリ管理**: 大規模コードベースでの効率的なメモリ使用
- **ストリーミング処理**: 大量データの効率的な処理

## ファイルを読む順序

### Phase 1: 全体理解（最初に読むべきファイル）

1. **`README.md`** - プロジェクト概要と使用方法 ✅️
2. **`docs/architecture.md`** - 高レベルアーキテクチャ　✅️
3. **`package.json`** - 依存関係とスクリプト　✅️
4. **`packages/core/src/index.ts`** - Core packageのエントリーポイント　✅️
5. **`packages/cli/src/gemini.tsx`** - CLI packageのエントリーポイント

### Phase 2: Core Package理解

6. **`packages/core/src/config/config.ts`** - 設定管理の仕組み
7. **`packages/core/src/core/client.ts`** - Gemini APIクライアント ✅️
8. **`packages/core/src/core/turn.ts`** - 対話ターンの管理 ✅️
9. **`packages/core/src/tools/tool-registry.ts`** - ツール管理システム
10. **`packages/core/src/tools/tools.ts`** - ツールの基底クラス

### Phase 3: ツールシステム詳細

11. **`packages/core/src/tools/read-file.ts`** - ファイル読み取りツール（例）
12. **`packages/core/src/tools/shell.ts`** - シェル実行ツール（例）
13. **`packages/core/src/tools/mcp-client.ts`** - MCP統合
14. **`packages/core/src/core/coreToolScheduler.ts`** - ツール実行スケジューラー

### Phase 4: CLI Package詳細

15. **`packages/cli/src/ui/App.tsx`** - メインUIコンポーネント
16. **`packages/cli/src/ui/hooks/useGeminiStream.ts`** - Gemini API統合
17. **`packages/cli/src/ui/components/InputPrompt.tsx`** - ユーザー入力処理
18. **`packages/cli/src/config/config.ts`** - CLI設定管理

### Phase 5: 高度な機能

19. **`packages/core/src/core/geminiChat.ts`** - チャット機能詳細
20. **`packages/cli/src/utils/sandbox.ts`** - サンドボックス実行
21. **`packages/core/src/telemetry/`** - テレメトリシステム
22. **`packages/cli/src/config/auth.ts`** - 認証システム

## パッケージ詳細

### Core Package (`packages/core/`)

**主要責任**: Gemini APIとの通信、ツール実行、ビジネスロジック

#### ディレクトリ構造:
```
core/
├── src/
│   ├── config/          # 設定管理
│   ├── core/            # コア機能（API通信、ターン管理）
│   ├── tools/           # ツールシステム
│   ├── services/        # ファイル探索、Git統合
│   ├── utils/           # ユーティリティ
│   └── telemetry/       # 使用状況テレメトリ
```

#### 主要クラス:
- **`GeminiClient`**: Gemini API通信の中枢
- **`Turn`**: 単一の対話ターンを管理
- **`ToolRegistry`**: 利用可能なツールの管理
- **`CoreToolScheduler`**: ツール実行の調整と承認フロー

### CLI Package (`packages/cli/`)

**主要責任**: ユーザーインターフェース、設定管理、ユーザー体験

#### ディレクトリ構造:
```
cli/
├── src/
│   ├── ui/              # React/Ink UIコンポーネント
│   │   ├── components/  # UIコンポーネント
│   │   ├── hooks/       # Reactフック
│   │   ├── themes/      # テーマシステム
│   │   └── contexts/    # Reactコンテキスト
│   ├── config/          # CLI固有の設定
│   └── utils/           # CLI ユーティリティ
```

#### 主要コンポーネント:
- **`App.tsx`**: メインアプリケーションコンポーネント
- **`InputPrompt.tsx`**: ユーザー入力とオートコンプリート
- **`useGeminiStream.ts`**: ストリーミング応答の処理
- **Theme System**: 多様な色テーマサポート

## 重要な概念

### 1. ツールシステム

```typescript
interface Tool {
  name: string;
  schema: FunctionDeclaration;
  execute(params: Record<string, unknown>, signal: AbortSignal): Promise<ToolResult>;
  shouldConfirmExecute(params: Record<string, unknown>): Promise<ToolCallConfirmationDetails | false>;
}
```

**特徴**:
- **統一インターフェース**: すべてのツールが同じインターフェースを実装
- **承認フロー**: 破壊的操作の事前確認
- **エラーハンドリング**: 安全なエラー処理とフォールバック

### 2. ストリーミングアーキテクチャ

```typescript
async *sendMessageStream(request: PartListUnion, signal: AbortSignal): AsyncGenerator<ServerGeminiStreamEvent>
```

**イベント種類**:
- `Content`: テキスト応答
- `ToolCallRequest`: ツール実行要求
- `ToolCallResponse`: ツール実行結果
- `Error`: エラー情報
- `ChatCompressed`: チャット圧縮情報

### 3. 承認モード

- **`DEFAULT`**: 破壊的操作には確認が必要
- **`AUTO_EDIT`**: ファイル編集は自動承認、他は確認
- **`YOLO`**: すべての操作を自動承認

### 4. MCP（Model Context Protocol）統合

```typescript
interface DiscoveredMCPTool extends BaseTool {
  serverName: string;
  execute(params: ToolParams): Promise<ToolResult>;
}
```

**機能**:
- 外部ツールサーバーとの統合
- 動的ツール発見
- プロジェクト固有の機能拡張

## 実行フロー

### 1. 起動フロー

```
gemini.tsx:main()
├── 設定読み込み (settings.json)
├── 認証確認・初期化
├── サンドボックス設定
├── React UI起動 または Non-interactive実行
└── Gemini API接続
```

### 2. 対話フロー

```
ユーザー入力
├── InputPrompt.tsx (入力処理)
├── useGeminiStream.ts (API通信)
├── Turn.run() (ターン実行)
├── ToolScheduler (ツール実行)
└── UI更新 (結果表示)
```

### 3. ツール実行フロー

```
ツール要求
├── shouldConfirmExecute() (承認確認)
├── ユーザー承認 (必要に応じて)
├── execute() (実際の実行)
└── 結果返却
```

## 拡張方法

### 1. 新しいツールの追加

```typescript
// 1. BaseTool を継承
class MyCustomTool extends BaseTool<MyParams, ToolResult> {
  constructor() {
    super('my_tool', 'my_tool', 'Description', schema);
  }
  
  async execute(params: MyParams): Promise<ToolResult> {
    // 実装
  }
}

// 2. ToolRegistry に登録
toolRegistry.registerTool(new MyCustomTool());
```

### 2. 新しいUI コンポーネント

```tsx
// React/Ink コンポーネントとして実装
const MyComponent = ({ config }: { config: Config }) => {
  return <Text>My Custom Component</Text>;
};

// App.tsx で使用
<MyComponent config={config} />
```

### 3. 設定オプションの追加

```typescript
// settings.ts に新しい設定項目を追加
interface Settings {
  myNewSetting?: string;
}

// config.ts で設定値を使用
const myValue = settings.merged.myNewSetting;
```

このアーキテクチャガイドを参考に、Gemini CLIの理解を深め、効果的な拡張や修正を行ってください。各フェーズで推奨されたファイルを順番に読むことで、システム全体の理解が段階的に深まります。