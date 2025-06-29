# Gemini CLI

Gemini CLI において、`packages/cli` は、ユーザーが Gemini AI モデルとその関連ツールとの間でプロンプトを送受信するためのフロントエンドです。Gemini CLI の全般的な概要については、[メインドキュメントページ](../index.md) を参照してください。

## このセクションのナビゲーション

- **[認証](./authentication.md):** Google の AI サービスとの認証設定に関するガイド。
- **[コマンド](./commands.md):** Gemini CLI コマンド（例：`/help`、`/tools`、`/theme`）のリファレンス。
- **[設定](./configuration.md):** 設定ファイルを使用して Gemini CLI の動作をカスタマイズするためのガイド。
- **[トークンキャッシュ](./token-caching.md):** トークンキャッシュを通じた API コストの最適化。
- **[テーマ](./themes.md)**: 異なるテーマで CLI の外観をカスタマイズするためのガイド。
- **[チュートリアル](tutorials.md)**: Gemini CLI を使用して開発タスクを自動化する方法を示すチュートリアル。

## 非対話モード

Gemini CLI は非対話モードで実行でき、スクリプト作成と自動化に便利です。このモードでは、CLI に入力をパイプし、コマンドを実行してから終了します。

以下の例は、ターミナルから Gemini CLI にコマンドをパイプします：

```bash
echo "What is fine tuning?" | gemini
```

Gemini CLI はコマンドを実行し、出力をターミナルに印刷します。`--prompt` または `-p` フラグを使用して同じ動作を実現できることに注意してください。例：

```bash
gemini -p "What is fine tuning?"
```