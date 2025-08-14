/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { I18nMessages } from '../types.js';

export const jaMessages: I18nMessages = {
  commands: {
    help: 'ヘルプを表示',
    version: 'バージョン番号を表示',
    launch: 'Gemini CLIを起動',
    mcp: 'Model Context Protocolコマンド',
  },
  options: {
    model: {
      description: 'モデル',
    },
    prompt: {
      description: 'プロンプト。標準入力のコンテンツに追加されます（もしあれば）。',
    },
    promptInteractive: {
      description: '提供されたプロンプトを実行し、インタラクティブモードを続行',
    },
    sandbox: {
      description: 'サンドボックスで実行しますか？',
    },
    sandboxImage: {
      description: 'サンドボックスイメージURI。',
    },
    debug: {
      description: 'デバッグモードで実行しますか？',
    },
    allFiles: {
      description: 'コンテキストにすべてのファイルを含めますか？',
    },
    showMemoryUsage: {
      description: 'ステータスバーでメモリ使用量を表示',
    },
    yolo: {
      description: 'すべてのアクションを自動的に承認（YOLOモード、詳細は https://www.youtube.com/watch?v=xvFZjo5PgG0 を参照）？',
    },
    approvalMode: {
      description: '承認モードを設定：default（承認を求める）、auto_edit（編集ツールを自動承認）、yolo（すべてのツールを自動承認）',
      choices: {
        default: '承認を求める',
        autoEdit: '編集ツールを自動承認',
        yolo: 'すべてのツールを自動承認',
      },
    },
    telemetry: {
      description: 'テレメトリを有効にしますか？このフラグはテレメトリ送信を具体的に制御します。他の --telemetry-* フラグは特定の値を設定しますが、単独ではテレメトリを有効にしません。',
    },
    telemetryTarget: {
      description: 'テレメトリターゲット（local または gcp）を設定。設定ファイルを上書きします。',
    },
    telemetryOtlpEndpoint: {
      description: 'テレメトリのOTLPエンドポイントを設定。環境変数と設定ファイルを上書きします。',
    },
    telemetryLogPrompts: {
      description: 'テレメトリのユーザープロンプトログを有効または無効にする。設定ファイルを上書きします。',
    },
    telemetryOutfile: {
      description: 'すべてのテレメトリ出力を指定されたファイルにリダイレクト。',
    },
    checkpointing: {
      description: 'ファイル編集のチェックポイントを有効にする',
    },
    experimentalAcp: {
      description: 'エージェントをACPモードで開始',
    },
    allowedMcpServerNames: {
      description: '許可されたMCPサーバー名',
    },
    extensions: {
      description: '使用する拡張機能のリスト。提供されない場合、すべての拡張機能が使用されます。',
    },
    listExtensions: {
      description: '利用可能なすべての拡張機能をリストして終了。',
    },
    proxy: {
      description: 'geminiクライアントのプロキシ、例：schema://user:password@host:port',
    },
    includeDirectories: {
      description: 'ワークスペースに含める追加ディレクトリ（カンマ区切りまたは複数の --include-directories）',
    },
    language: {
      description: 'インターフェース言語を設定',
    },
  },
  usage: {
    main: '使用法: gemini [オプション] [コマンド]\n\nGemini CLI - インタラクティブCLIを起動、非インタラクティブモードには -p/--prompt を使用',
  },
  errors: {
    conflictingPromptOptions: '--prompt (-p) と --prompt-interactive (-i) を同時に使用できません',
    conflictingYoloOptions: '--yolo (-y) と --approval-mode を同時に使用できません。代わりに --approval-mode=yolo を使用してください。',
    authFailed: '認証に失敗しました',
    networkError: 'ネットワークエラーが発生しました',
    unexpectedError: '予期しない重大なエラーが発生しました',
    configLoadError: '設定の読み込みに失敗しました',
    invalidLanguage: '無効な言語が指定されました',
    promptInteractiveNotSupported: 'エラー：標準入力からパイプで入力する場合、--prompt-interactive フラグはサポートされていません。',
  },
  warnings: {
    deprecatedOption: 'は非推奨です',
    invalidDnsOrder: '設定のdnsResolutionOrderに無効な値："{{order}}"。デフォルト値"{{defaultValue}}"を使用します。',
    deprecatedAllFiles: '代わりに --all-files を使用してください。数週間以内に --all_files を削除予定です。',
    deprecatedShowMemoryUsage: '代わりに --show-memory-usage を使用してください。数週間以内に --show_memory_usage を削除予定です。',
  },
  ui: {
    status: {
      connecting: '接続中...',
      processing: '処理中...',
      loading: '読み込み中...',
      ready: '準備完了',
      contextLeft: 'コンテキスト残り',
      noSandbox: 'サンドボックスなし',
      seeDocs: '/docs を参照',
    },
    prompts: {
      confirmAction: 'このアクションを確認しますか？',
      continueYesNo: '続行しますか？ (Y/n)',
    },
    memory: {
      refreshing: 'メモリを更新中...',
      loaded: 'メモリが読み込まれました',
    },
    privacy: {
      geminiApiNotice: {
        title: 'Gemini APIキーの通知',
        content: 'Gemini API[1]、Google AI Studio[2]、およびこれらの規約を参照するその他のGoogle開発者サービス（総称して「API」または「サービス」）を使用することにより、Google APIs利用規約（「API規約」）[3]およびGemini API追加利用規約（「追加規約」）[4]に同意したことになります。',
        links: {
          geminiApi: 'https://ai.google.dev/docs/gemini_api_overview',
          googleAiStudio: 'https://aistudio.google.com/',
          apiTerms: 'https://developers.google.com/terms',
          additionalTerms: 'https://ai.google.dev/gemini-api/terms',
        },
        exitPrompt: 'Escキーで終了します。',
      },
      cloudFreeNotice: {
        title: 'Cloud無料サービス通知',
        content: 'Google Cloudサービスの無料利用枠を使用しています。',
        exitPrompt: 'Escキーで終了します。',
      },
      cloudPaidNotice: {
        title: 'Cloud有料サービス通知',
        content: 'Google Cloudの有料サービスを使用しています。',
        exitPrompt: 'Escキーで終了します。',
      },
    },
    footer: {
      model: 'モデル',
      directory: 'ディレクトリ',
      branch: 'ブランチ',
      debug: 'デバッグ',
      errorCount: 'エラー',
      tokens: 'トークン',
    },
    auth: {
      getStarted: '開始する',
      howToAuthenticate: 'このプロジェクトでどのように認証しますか？',
      loginWithGoogle: 'Googleでログイン',
      useGeminiApiKey: 'Gemini APIキーを使用',
      vertexAi: 'Vertex AI',
      useCloudShell: 'Cloud Shellユーザー認証情報を使用',
      useEnterToSelect: '（Enterキーで選択）',
      termsOfService: 'Gemini CLIの利用規約とプライバシー通知',
      authenticationTimeout: '認証がタイムアウトしました。もう一度お試しください。',
      waitingForAuth: '認証待機中...（ESCまたはCTRL+Cでキャンセル）',
      inProgress: '認証進行中...',
      selectMethod: '認証方法を選択',
      authenticating: '認証中...',
      success: '認証成功',
      failed: '認証失敗',
      invalidDefaultAuthType: 'GEMINI_DEFAULT_AUTH_TYPEの値が無効です："{{value}}"。有効な値は：{{validValues}}',
      existingApiKeyDetected: '既存のAPIキーが検出されました（GEMINI_API_KEY）。「Gemini APIキー」オプションを選択して使用してください。',
      mustSelectAuthMethod: '続行するには認証方法を選択する必要があります。Ctrl+Cを2回押して終了してください。',
    },
    tips: {
      gettingStarted: '開始のためのヒント：',
      askQuestions: '1. 質問をしたり、ファイルを編集したり、コマンドを実行したりしてください。',
      beSpecific: '2. 最良の結果を得るために具体的に記述してください。',
      helpCommand: '詳細は /help を参照。',
      createFiles: '作成',
      filesForContext: 'より良いコンテキストのためのファイル。',
    },
    shell: {
      confirmExecution: 'シェルコマンドの実行を確認しますか？',
      command: 'コマンド',
      approve: '承認',
      deny: '拒否',
    },
    session: {
      goodbye: 'エージェント終了中。さようなら！',
      performance: 'パフォーマンス',
      wallTime: '実行時間：',
      agentActive: 'エージェント動作：',
      apiTime: 'API時間：',
      toolTime: 'ツール時間：',
    },
  },
  startup: {
    memoryArgs: 'メモリ引数が設定されました',
    relaunching: '追加引数で再起動中',
    sandboxMode: 'サンドボックスモードで実行中',
    debugMode: 'デバッグモードが有効',
  },
};
