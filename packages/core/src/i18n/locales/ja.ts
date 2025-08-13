/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CoreI18nMessages } from '../types.js';

export const coreJaMessages: CoreI18nMessages = {
  tools: {
    fileOperations: {
      readFile: 'ファイル読み取り',
      writeFile: 'ファイル書き込み',
      fileNotFound: 'ファイルが見つかりません',
      permissionDenied: 'アクセス許可がありません',
    },
    shellCommands: {
      executing: 'コマンド実行中',
      completed: 'コマンド完了',
      failed: 'コマンド失敗',
    },
    webFetching: {
      fetching: 'URL取得中',
      success: '取得完了',
      failed: '取得失敗',
    },
  },
  api: {
    authentication: {
      authenticating: '認証中',
      success: '認証成功',
      failed: '認証失敗',
      tokenExpired: '認証トークンが期限切れです',
    },
    requests: {
      sending: 'リクエスト送信中',
      processing: 'リクエスト処理中',
      completed: 'リクエスト完了',
      failed: 'リクエスト失敗',
      rateLimited: 'レート制限',
    },
  },
  errors: {
    networkTimeout: 'ネットワークタイムアウト',
    invalidApiKey: '無効なAPIキー',
    quotaExceeded: 'クォータ超過',
    serviceUnavailable: 'サービス利用不可',
    invalidRequest: '無効なリクエスト',
    serverError: 'サーバーエラー',
  },
  status: {
    initializing: '初期化中',
    ready: '準備完了',
    busy: 'ビジー',
    error: 'エラー',
    offline: 'オフライン',
  },
};
