# Gemini CLI 設定

Gemini CLI は、環境変数、コマンドライン引数、設定ファイルなど、その動作を設定するいくつかの方法を提供します。このドキュメントでは、異なる設定方法と利用可能な設定について説明します。

## 設定レイヤー

設定は以下の優先順位で適用されます（番号が低いものは高いもので上書きされます）：

1.  **デフォルト値:** アプリケーション内のハードコードされたデフォルト。
2.  **ユーザー設定ファイル:** 現在のユーザー向けのグローバル設定。
3.  **プロジェクト設定ファイル:** プロジェクト固有の設定。
4.  **環境変数:** システム全体またはセッション固有の変数、`.env` ファイルから読み込まれる場合があります。
5.  **コマンドライン引数:** CLI 起動時に渡された値。

## ユーザー設定ファイルとプロジェクト設定ファイル

Gemini CLI は永続的な設定のために `settings.json` ファイルを使用します。これらのファイルには2つの場所があります：

- **ユーザー設定ファイル:**
  - **場所:** `~/.gemini/settings.json`（`~` はホームディレクトリ）。
  - **スコープ:** 現在のユーザーのすべての Gemini CLI セッションに適用されます。
- **プロジェクト設定ファイル:**
  - **場所:** プロジェクトルートディレクトリ内の `.gemini/settings.json`。
  - **スコープ:** その特定のプロジェクトから Gemini CLI を実行している場合のみ適用されます。プロジェクト設定はユーザー設定を上書きします。

**設定内の環境変数に関する注意:** `settings.json` ファイル内の文字列値は、`$VAR_NAME` または `${VAR_NAME}` 構文を使用して環境変数を参照できます。これらの変数は設定が読み込まれるときに自動的に解決されます。例えば、環境変数 `MY_API_TOKEN` がある場合、`settings.json` で次のように使用できます：`"apiKey": "$MY_API_TOKEN"`。

### プロジェクト内の `.gemini` ディレクトリ

プロジェクト設定ファイルに加えて、プロジェクトの `.gemini` ディレクトリには、以下のような Gemini CLI の動作に関連する他のプロジェクト固有のファイルを含めることができます：

- [カスタムサンドボックスプロファイル](#sandboxing)（例：`.gemini/sandbox-macos-custom.sb`、`.gemini/sandbox.Dockerfile`）。

### `settings.json` で利用可能な設定:

- **`contextFileName`**（文字列または文字列配列）:
  - **説明:** コンテキストファイル（例：`GEMINI.md`、`AGENTS.md`）のファイル名を指定します。単一のファイル名または受け入れられるファイル名のリストが可能です。
  - **デフォルト:** `GEMINI.md`
  - **例:** `"contextFileName": "AGENTS.md"`

- **`bugCommand`**（オブジェクト）:
  - **説明:** `/bug` コマンドのデフォルト URL を上書きします。
  - **デフォルト:** `"urlTemplate": "https://github.com/google-gemini/gemini-cli/issues/new?template=bug_report.yml&title={title}&info={info}"`
  - **プロパティ:**
    - **`urlTemplate`**（文字列）: `{title}` と `{info}` プレースホルダーを含むことができる URL。
  - **例:**
    ```json
    "bugCommand": {
      "urlTemplate": "https://bug.example.com/new?title={title}&info={info}"
    }
    ```

- **`fileFiltering`**（オブジェクト）:
  - **説明:** @ コマンドとファイル発見ツールの git 対応ファイルフィルタリング動作を制御します。
  - **デフォルト:** `"respectGitIgnore": true, "enableRecursiveFileSearch": true`
  - **プロパティ:**
    - **`respectGitIgnore`**（ブール値）: ファイルを発見する際に .gitignore パターンを尊重するかどうか。`true` に設定すると、git に無視されるファイル（`node_modules/`、`dist/`、`.env` など）は @ コマンドとファイルリスト操作から自動的に除外されます。
    - **`enableRecursiveFileSearch`**（ブール値）: プロンプトで @ プレフィックスを補完する際に、現在のツリー下でファイル名を再帰的に検索することを有効にするかどうか。
  - **例:**
    ```json
    "fileFiltering": {
      "respectGitIgnore": true,
      "enableRecursiveFileSearch": false
    }
    ```

- **`coreTools`**（文字列配列）:
  - **説明:** モデルで利用可能にするコアツール名のリストを指定できます。これは組み込みツールのセットを制限するために使用できます。コアツールのリストについては [組み込みツール](../core/tools-api.md#built-in-tools) を参照してください。
  - **デフォルト:** Gemini モデルで使用可能なすべてのツール。
  - **例:** `"coreTools": ["ReadFileTool", "GlobTool", "SearchText"]`。

- **`excludeTools`**（文字列配列）:
  - **説明:** モデルから除外するコアツール名のリストを指定できます。`excludeTools` と `coreTools` の両方にリストされたツールは除外されます。
  - **デフォルト**: ツールは除外されません。
  - **例:** `"excludeTools": ["run_shell_command", "findFiles"]`。

- **`autoAccept`**（ブール値）:
  - **説明:** CLI が安全と見なされるツール呼び出し（読み取り専用操作など）を明示的なユーザー確認なしに自動的に受け入れて実行するかどうかを制御します。`true` に設定すると、CLI は安全と見なされるツールの確認プロンプトをバイパスします。
  - **デフォルト:** `false`
  - **例:** `"autoAccept": true`

- **`theme`**（文字列）:
  - **説明:** Gemini CLI の視覚[テーマ](./themes.md)を設定します。
  - **デフォルト:** `"Default"`
  - **例:** `"theme": "GitHub"`

- **`sandbox`**（ブール値または文字列）:
  - **説明:** ツール実行にサンドボックスを使用するかどうかと方法を制御します。`true` に設定すると、Gemini CLI は事前に構築された `gemini-cli-sandbox` Docker イメージを使用します。詳細については、[サンドボックス](#sandboxing) を参照してください。
  - **デフォルト:** `false`
  - **例:** `"sandbox": "docker"`

- **`toolDiscoveryCommand`**（文字列）:
  - **説明:** プロジェクトからツールを発見するためのカスタムシェルコマンドを定義します。シェルコマンドは `stdout` に [関数宣言](https://ai.google.dev/gemini-api/docs/function-calling#function-declarations) の JSON 配列を返す必要があります。ツールラッパーはオプションです。
  - **デフォルト:** 空
  - **例:** `"toolDiscoveryCommand": "bin/get_tools"`

- **`toolCallCommand`**（文字列）:
  - **説明:** `toolDiscoveryCommand` を使用して発見された特定のツールを呼び出すためのカスタムシェルコマンドを定義します。シェルコマンドは以下の基準を満たす必要があります：
    - [関数宣言](https://ai.google.dev/gemini-api/docs/function-calling#function-declarations) と全く同じ関数 `name` を最初のコマンドライン引数として取る必要があります。
    - [`functionCall.args`](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference#functioncall) と同様に、`stdin` で JSON として関数引数を読み取る必要があります。
    - [`functionResponse.response.content`](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference#functionresponse) と同様に、`stdout` で JSON として関数出力を返す必要があります。
  - **デフォルト:** 空
  - **例:** `"toolCallCommand": "bin/call_tool"`

- **`mcpServers`**（オブジェクト）:
  - **説明:** カスタムツールの発見と使用のために1つ以上のModel-Context Protocol（MCP）サーバーへの接続を設定します。Gemini CLI は設定された各 MCP サーバーに接続して利用可能なツールを発見しようとします。複数の MCP サーバーが同じ名前のツールを公開している場合、設定で定義したサーバーエイリアスがツール名の前に付けられ（例：`serverAlias__actualToolName`）、競合を回避します。システムが互換性のために MCP ツール定義から特定のスキーマプロパティを除去する場合があることに注意してください。
  - **デフォルト:** 空
  - **プロパティ:**
    - **`<SERVER_NAME>`**（オブジェクト）: 名前付きサーバーのサーバーパラメータ。
      - `command`（文字列、必須）: MCP サーバーを開始するために実行するコマンド。
      - `args`（文字列配列、オプション）: コマンドに渡す引数。
      - `env`（オブジェクト、オプション）: サーバープロセスに設定する環境変数。
      - `cwd`（文字列、オプション）: サーバーを開始する作業ディレクトリ。
      - `timeout`（数値、オプション）: この MCP サーバーへのリクエストのタイムアウト（ミリ秒）。
      - `trust`（ブール値、オプション）: このサーバーを信頼し、すべてのツール呼び出し確認をバイパスします。
  - **例:**
    ```json
    "mcpServers": {
      "myPythonServer": {
        "command": "python",
        "args": ["mcp_server.py", "--port", "8080"],
        "cwd": "./mcp_tools/python",
        "timeout": 5000
      },
      "myNodeServer": {
        "command": "node",
        "args": ["mcp_server.js"],
        "cwd": "./mcp_tools/node"
      },
      "myDockerServer": {
        "command": "docker",
        "args": ["run", "i", "--rm", "-e", "API_KEY", "ghcr.io/foo/bar"],
        "env": {
          "API_KEY": "$MY_API_TOKEN"
        }
      }
    }
    ```

- **`checkpointing`**（オブジェクト）:
  - **説明:** 会話とファイル状態の保存と復元を可能にするチェックポイント機能を設定します。詳細については [チェックポイントドキュメント](../checkpointing.md) を参照してください。
  - **デフォルト:** `{"enabled": false}`
  - **プロパティ:**
    - **`enabled`**（ブール値）: `true` の場合、`/restore` コマンドが利用可能になります。

- **`preferredEditor`**（文字列）:
  - **説明:** 差分表示に使用する優先エディターを指定します。
  - **デフォルト:** `vscode`
  - **例:** `"preferredEditor": "vscode"`

- **`telemetry`**（オブジェクト）
  - **説明:** Gemini CLI のログとメトリクス収集を設定します。詳細については [テレメトリ](../telemetry.md) を参照してください。
  - **デフォルト:** `{"enabled": false, "target": "local", "otlpEndpoint": "http://localhost:4317", "logPrompts": true}`
  - **プロパティ:**
    - **`enabled`**（ブール値）: テレメトリが有効かどうか。
    - **`target`**（文字列）: 収集されたテレメトリの送信先。サポートされる値は `local` と `gcp` です。
    - **`otlpEndpoint`**（文字列）: OTLP Exporter のエンドポイント。
    - **`logPrompts`**（ブール値）: ログにユーザープロンプトの内容を含めるかどうか。
  - **例:**
    ```json
    "telemetry": {
      "enabled": true,
      "target": "local",
      "otlpEndpoint": "http://localhost:16686",
      "logPrompts": false
    }
    ```

- **`usageStatisticsEnabled`**（ブール値）:
  - **説明:** 使用統計の収集を有効または無効にします。詳細については [使用統計](#usage-statistics) を参照してください。
  - **デフォルト:** `true`
  - **例:**
    ```json
    "usageStatisticsEnabled": false
    ```

### `settings.json` の例:

```json
{
  "theme": "GitHub",
  "sandbox": "docker",
  "toolDiscoveryCommand": "bin/get_tools",
  "toolCallCommand": "bin/call_tool",
  "mcpServers": {
    "mainServer": {
      "command": "bin/mcp_server.py"
    },
    "anotherServer": {
      "command": "node",
      "args": ["mcp_server.js", "--verbose"]
    }
  },
  "telemetry": {
    "enabled": true,
    "target": "local",
    "otlpEndpoint": "http://localhost:4317",
    "logPrompts": true
  },
  "usageStatisticsEnabled": true
}
```

## シェル履歴

CLI は実行したシェルコマンドの履歴を保持します。異なるプロジェクト間での競合を避けるため、この履歴はユーザーのホームフォルダー内のプロジェクト固有のディレクトリに保存されます。

- **場所:** `~/.gemini/tmp/<project_hash>/shell_history`
  - `<project_hash>` はプロジェクトのルートパスから生成される一意の識別子です。
  - 履歴は `shell_history` という名前のファイルに保存されます。

## 環境変数と `.env` ファイル

環境変数は、特に API キーなどの機密情報や環境間で変わる可能性のある設定において、アプリケーションを設定する一般的な方法です。

CLI は `.env` ファイルから環境変数を自動的に読み込みます。読み込み順序は：

1.  現在の作業ディレクトリの `.env` ファイル。
2.  見つからない場合、`.env` ファイルが見つかるかプロジェクトルート（`.git` フォルダーで識別）またはホームディレクトリに到達するまで親ディレクトリを上向きに検索します。
3.  それでも見つからない場合、`~/.env`（ユーザーのホームディレクトリ）を検索します。

- **`GEMINI_API_KEY`**（必須）:
  - Gemini API の API キー。
  - **動作に不可欠。** これなしでは CLI は機能しません。
  - シェルプロファイル（例：`~/.bashrc`、`~/.zshrc`）または `.env` ファイルに設定してください。

- **`GEMINI_MODEL`**:
  - 使用するデフォルトの Gemini モデルを指定します。
  - ハードコードされたデフォルトを上書きします。
  - 例：`export GEMINI_MODEL="gemini-2.5-flash"`

- **`GOOGLE_API_KEY`**:
  - Google Cloud API キー。
  - Express モードで Vertex AI を使用するために必要です。
  - 必要な権限があることを確認し、`GOOGLE_GENAI_USE_VERTEXAI=true` 環境変数を設定してください。
  - 例：`export GOOGLE_API_KEY="YOUR_GOOGLE_API_KEY"`。

- **`GOOGLE_CLOUD_PROJECT`**:
  - Google Cloud プロジェクト ID。
  - Code Assist または Vertex AI を使用するために必要です。
  - Vertex AI を使用する場合、必要な権限があることを確認し、`GOOGLE_GENAI_USE_VERTEXAI=true` 環境変数を設定してください。
  - 例：`export GOOGLE_CLOUD_PROJECT="YOUR_PROJECT_ID"`。

- **`GOOGLE_APPLICATION_CREDENTIALS`**（文字列）:
  - **説明:** Google Application Credentials JSON ファイルへのパス。
  - **例:** `export GOOGLE_APPLICATION_CREDENTIALS="/path/to/your/credentials.json"`

- **`OTLP_GOOGLE_CLOUD_PROJECT`**:
  - Google Cloud でのテレメトリ用の Google Cloud プロジェクト ID。
  - 例：`export OTLP_GOOGLE_CLOUD_PROJECT="YOUR_PROJECT_ID"`。

- **`GOOGLE_CLOUD_LOCATION`**:
  - Google Cloud プロジェクトの場所（例：us-central1）。
  - 非 Express モードで Vertex AI を使用するために必要です。
  - Vertex AI を使用する場合、必要な権限があることを確認し、`GOOGLE_GENAI_USE_VERTEXAI=true` 環境変数を設定してください。
  - 例：`export GOOGLE_CLOUD_LOCATION="YOUR_PROJECT_LOCATION"`。

- **`GEMINI_SANDBOX`**:
  - `settings.json` の `sandbox` 設定の代替。
  - `true`、`false`、`docker`、`podman`、またはカスタムコマンド文字列を受け入れます。

- **`SEATBELT_PROFILE`**（macOS 固有）:
  - macOS で Seatbelt（`sandbox-exec`）プロファイルを切り替えます。
  - `permissive-open`: （デフォルト）プロジェクトフォルダー（および他のいくつかのフォルダー、`packages/cli/src/utils/sandbox-macos-permissive-open.sb` を参照）への書き込みを制限しますが、他の操作は許可します。
  - `strict`: デフォルトで操作を拒否する厳密なプロファイルを使用します。
  - `<profile_name>`: カスタムプロファイルを使用します。カスタムプロファイルを定義するには、プロジェクトの `.gemini/` ディレクトリに `sandbox-macos-<profile_name>.sb` という名前のファイルを作成してください（例：`my-project/.gemini/sandbox-macos-custom.sb`）。

- **`DEBUG` または `DEBUG_MODE`**（基盤ライブラリまたは CLI 自体でよく使用される）:
  - `true` または `1` に設定すると、詳細なデバッグログが有効になり、トラブルシューティングに役立ちます。

- **`NO_COLOR`**:
  - 任意の値に設定すると、CLI のすべての色出力が無効になります。

- **`CLI_TITLE`**:
  - 文字列に設定すると、CLI のタイトルをカスタマイズします。

- **`CODE_ASSIST_ENDPOINT`**:
  - Code Assist サーバーのエンドポイントを指定します。
  - これは開発とテストに便利です。

## コマンドライン引数

CLI を実行する際に直接渡される引数は、その特定のセッションの他の設定を上書きできます。

- **`--model <model_name>`**（**`-m <model_name>`**）:
  - このセッションで使用する Gemini モデルを指定します。
  - 例：`npm start -- --model gemini-1.5-pro-latest`

- **`--prompt <your_prompt>`**（**`-p <your_prompt>`**）:
  - コマンドに直接プロンプトを渡すために使用されます。これにより、Gemini CLI が非対話モードで呼び出されます。

- **`--sandbox`**（**`-s`**）:
  - このセッションでサンドボックスモードを有効にします。

- **`--sandbox-image`**:
  - サンドボックスイメージ URI を設定します。

- **`--debug_mode`**（**`-d`**）:
  - このセッションでデバッグモードを有効にし、より詳細な出力を提供します。

- **`--all_files`**（**`-a`**）:
  - 設定すると、現在のディレクトリ内のすべてのファイルをプロンプトのコンテキストとして再帰的に含めます。

- **`--help`**（または **`-h`**）:
  - コマンドライン引数についてのヘルプ情報を表示します。

- **`--show_memory_usage`**:
  - 現在のメモリ使用量を表示します。

- **`--yolo`**:
  - YOLO モードを有効にし、すべてのツール呼び出しを自動的に承認します。

- **`--telemetry`**:
  - [テレメトリ](../telemetry.md) を有効にします。

- **`--telemetry-target`**:
  - テレメトリターゲットを設定します。詳細については [テレメトリ](../telemetry.md) を参照してください。

- **`--telemetry-otlp-endpoint`**:
  - テレメトリの OTLP エンドポイントを設定します。詳細については [テレメトリ](../telemetry.md) を参照してください。

- **`--telemetry-log-prompts`**:
  - テレメトリのプロンプトログを有効にします。詳細については [テレメトリ](../telemetry.md) を参照してください。

- **`--checkpointing`**:
  - [チェックポイント](./commands.md#checkpointing-commands) を有効にします。

- **`--version`**:
  - CLI のバージョンを表示します。

## コンテキストファイル（階層指示コンテキスト）

CLI の _動作_ の設定に厳密には該当しませんが、コンテキストファイル（デフォルトでは `GEMINI.md` ですが、`contextFileName` 設定で設定可能）は、Gemini モデルに提供される _指示コンテキスト_（「メモリ」とも呼ばれる）を設定するために重要です。この強力な機能により、プロジェクト固有の指示、コーディングスタイルガイド、または関連する背景情報を AI に提供し、その応答をニーズにより適合させ、正確にすることができます。CLI には、読み込まれたコンテキストファイルの数を示すフッターのインジケーターなどの UI 要素が含まれており、アクティブなコンテキストについて常に情報を提供します。

- **目的:** これらの Markdown ファイルには、相互作用中に Gemini モデルに認識してもらいたい指示、ガイドライン、またはコンテキストが含まれています。システムはこの指示コンテキストを階層的に管理するように設計されています。

### コンテキストファイル内容の例（例：`GEMINI.md`）

TypeScript プロジェクトのルートにあるコンテキストファイルの概念的な例は以下のようになります：

```markdown
# プロジェクト: My Awesome TypeScript Library

## 一般的な指示:

- 新しい TypeScript コードを生成する際は、既存のコーディングスタイルに従ってください。
- すべての新しい関数とクラスに JSDoc コメントを追加してください。
- 適切な場合は関数型プログラミングパラダイムを優先してください。
- すべてのコードは TypeScript 5.0 と Node.js 18+ と互換性がある必要があります。

## コーディングスタイル:

- インデントには2スペースを使用してください。
- インターフェース名は `I` で始める必要があります（例：`IUserService`）。
- プライベートクラスメンバーはアンダースコア（`_`）で始める必要があります。
- 常に厳密等価（`===` と `!==`）を使用してください。

## 特定のコンポーネント: `src/api/client.ts`

- このファイルはすべての送信 API リクエストを処理します。
- 新しい API 呼び出し関数を追加する際は、堅牢なエラーハンドリングとログを含めてください。
- すべての GET リクエストには既存の `fetchWithRetry` ユーティリティを使用してください。

## 依存関係について:

- 絶対に必要でない限り、新しい外部依存関係の導入は避けてください。
- 新しい依存関係が必要な場合は、理由を述べてください。
```

この例では、一般的なプロジェクトコンテキスト、特定のコーディング規約、さらには特定のファイルやコンポーネントに関するメモを提供する方法を示しています。コンテキストファイルがより関連性があり正確であるほど、AI がより良く支援できます。プロジェクト固有のコンテキストファイルは、規約とコンテキストを確立するために強く推奨されます。

- **階層読み込みと優先順位:** CLI は、複数の場所からコンテキストファイル（例：`GEMINI.md`）を読み込むことで、洗練された階層メモリシステムを実装しています。このリストの下位（より具体的）のファイルからのコンテンツは、通常、上位（より一般的）のファイルからのコンテンツを上書きまたは補完します。正確な連結順序と最終コンテキストは、`/memory show` コマンドを使用して確認できます。典型的な読み込み順序は：
  1.  **グローバルコンテキストファイル:**
      - 場所：`~/.gemini/<contextFileName>`（例：ユーザーホームディレクトリの `~/.gemini/GEMINI.md`）。
      - スコープ：すべてのプロジェクトのデフォルト指示を提供します。
  2.  **プロジェクトルートと祖先コンテキストファイル:**
      - 場所：CLI は現在の作業ディレクトリで設定されたコンテキストファイルを検索し、その後プロジェクトルート（`.git` フォルダーで識別）またはホームディレクトリまで各親ディレクトリで検索します。
      - スコープ：プロジェクト全体またはその重要な部分に関連するコンテキストを提供します。
  3.  **サブディレクトリコンテキストファイル（コンテキスト/ローカル）:**
      - 場所：CLI は現在の作業ディレクトリ _下_ のサブディレクトリでも設定されたコンテキストファイルをスキャンします（`node_modules`、`.git` などの一般的な無視パターンを尊重）。
      - スコープ：プロジェクトの特定のコンポーネント、モジュール、またはサブセクションに関連する高度に具体的な指示を可能にします。

- **連結と UI 表示:** 見つかったすべてのコンテキストファイルの内容は連結され（その起源とパスを示すセパレーターと共に）、Gemini モデルへのシステムプロンプトの一部として提供されます。CLI フッターには読み込まれたコンテキストファイルの数が表示され、アクティブな指示コンテキストについて迅速な視覚的手がかりを提供します。

- **メモリ管理用コマンド:**
  - `/memory refresh` を使用して、設定されたすべての場所（グローバル、プロジェクト/祖先、サブディレクトリ）からすべてのコンテキストファイルの再スキャンと再読み込みを強制します。これにより、AI の指示コンテキストが更新されます。
  - `/memory show` を使用して、現在読み込まれている結合指示コンテキストを表示し、AI によって使用されている階層とコンテンツを確認できます。
  - `/memory` コマンドとそのサブコマンド（`show` と `refresh`）の完全な詳細については、[コマンドドキュメント](./commands.md#memory) を参照してください。

これらの設定レイヤーとコンテキストファイルの階層的性質を理解し利用することで、AI のメモリを効果的に管理し、Gemini CLI の応答を特定のニーズとプロジェクトに合わせることができます。

## サンドボックス

Gemini CLI は、システムを保護するために、潜在的に安全でない操作（シェルコマンドやファイル変更など）をサンドボックス環境内で実行できます。

サンドボックスはデフォルトで無効ですが、いくつかの方法で有効にできます：

- `--sandbox` または `-s` フラグを使用。
- `GEMINI_SANDBOX` 環境変数を設定。
- `--yolo` モードではデフォルトでサンドボックスが有効。

デフォルトでは、事前に構築された `gemini-cli-sandbox` Docker イメージを使用します。

プロジェクト固有のサンドボックスニーズについては、プロジェクトのルートディレクトリの `.gemini/sandbox.Dockerfile` でカスタム Dockerfile を作成できます。この Dockerfile は基本サンドボックスイメージをベースにできます：

```dockerfile
FROM gemini-cli-sandbox

# ここにカスタム依存関係や設定を追加してください
# 例：
# RUN apt-get update && apt-get install -y some-package
# COPY ./my-config /app/my-config
```

`.gemini/sandbox.Dockerfile` が存在する場合、Gemini CLI を実行する際に `BUILD_SANDBOX` 環境変数を使用してカスタムサンドボックスイメージを自動的に構築できます：

```bash
BUILD_SANDBOX=1 gemini -s
```

## 使用統計

Gemini CLI の改善に役立てるため、匿名化された使用統計を収集しています。このデータは、CLI がどのように使用されているかを理解し、一般的な問題を特定し、新機能の優先順位を決めるのに役立ちます。

**収集するもの:**

- **ツール呼び出し:** 呼び出されるツールの名前、成功または失敗、実行にかかる時間をログします。ツールに渡される引数やツールから返されるデータは収集しません。
- **API リクエスト:** 各リクエストで使用される Gemini モデル、リクエストの期間、成功したかどうかをログします。プロンプトや応答の内容は収集しません。
- **セッション情報:** 有効なツールや承認モードなど、CLI の設定に関する情報を収集します。

**収集しないもの:**

- **個人識別情報（PII）:** 名前、メールアドレス、API キーなどの個人情報は収集しません。
- **プロンプトと応答の内容:** プロンプトの内容や Gemini モデルからの応答はログしません。
- **ファイル内容:** CLI によって読み取りまたは書き込みされるファイルの内容はログしません。

**オプトアウト方法:**

`settings.json` ファイルで `usageStatisticsEnabled` プロパティを `false` に設定することで、いつでも使用統計収集をオプトアウトできます：

```json
{
  "usageStatisticsEnabled": false
}
```