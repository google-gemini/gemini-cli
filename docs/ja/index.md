# Gemini CLI ドキュメントへようこそ

このドキュメントは、Gemini CLI のインストール、使用、開発に関する包括的なガイドを提供します。このツールにより、コマンドラインインターフェースを通じてGeminiモデルと対話することができます。

## 概要

Gemini CLI は、Geminiモデルの機能をターミナルに対話型 Read-Eval-Print Loop (REPL) 環境として提供します。Gemini CLI は、ローカルサーバー（`packages/core`）と通信するクライアント側アプリケーション（`packages/cli`）で構成されており、サーバーはGemini APIとそのAIモデルへのリクエストを管理します。Gemini CLI には、ファイルシステム操作、シェル実行、Webフェッチなどのタスクを実行するための様々なツールも含まれており、これらは `packages/core` によって管理されます。

## ドキュメントのナビゲーション

このドキュメントは以下のセクションで構成されています：

- **[実行と展開](./deployment.md):** Gemini CLI の実行に関する情報。
- **[アーキテクチャ概要](./architecture.md):** Gemini CLI の高レベル設計、そのコンポーネントと相互作用について理解します。
- **CLI使用方法:** `packages/cli` のドキュメント。
  - **[CLI概要](./cli/index.md):** コマンドラインインターフェースの概要。
  - **[コマンド](./cli/commands.md):** 利用可能なCLIコマンドの説明。
  - **[設定](./cli/configuration.md):** CLIの設定に関する情報。
  - **[チェックポイント](./checkpointing.md):** チェックポイント機能のドキュメント。
  - **[拡張](./extension.md):** 新しい機能でCLIを拡張する方法。
  - **[テレメトリ](./telemetry.md):** CLIにおけるテレメトリの概要。
- **Core詳細:** `packages/core` のドキュメント。
  - **[Core概要](./core/index.md):** コアコンポーネントの概要。
  - **[ツールAPI](./core/tools-api.md):** コアがツールを管理・公開する方法に関する情報。
- **ツール:**
  - **[ツール概要](./tools/index.md):** 利用可能なツールの概要。
  - **[ファイルシステムツール](./tools/file-system.md):** `read_file` と `write_file` ツールのドキュメント。
  - **[マルチファイル読み取りツール](./tools/multi-file.md):** `read_many_files` ツールのドキュメント。
  - **[シェルツール](./tools/shell.md):** `run_shell_command` ツールのドキュメント。
  - **[Webフェッチツール](./tools/web-fetch.md):** `web_fetch` ツールのドキュメント。
  - **[Web検索ツール](./tools/web-search.md):** `google_web_search` ツールのドキュメント。
  - **[メモリツール](./tools/memory.md):** `save_memory` ツールのドキュメント。
- **[貢献・開発ガイド](../CONTRIBUTING.md):** セットアップ、ビルド、テスト、コーディング規約を含む、貢献者と開発者向けの情報。
- **[トラブルシューティングガイド](./troubleshooting.md):** よくある問題の解決方法とFAQ。
- **[利用規約とプライバシーに関する通知](./tos-privacy.md):** Gemini CLI の使用に適用される利用規約とプライバシーに関する通知の情報。

このドキュメントがGemini CLI を最大限に活用するのに役立つことを願っています！