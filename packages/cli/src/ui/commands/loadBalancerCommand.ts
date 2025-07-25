/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MessageActionReturn, SlashCommand } from './types.js';
import {
  readLoadBalancerConfig,
  writeLoadBalancerConfig,
  addLoadBalancerEndpoint,
  removeLoadBalancerEndpoint,
  updateLoadBalancerEndpoint,
  updateLoadBalancerAlgorithm,
  resetLoadBalancerConfig,
  createDefaultEndpoint,
  validateLoadBalancerConfig
} from '../../../../core/src/config/loadBalancer.js';
import { LoadBalancerService } from '../../../../core/src/services/loadBalancerService.js';

/**
 * ロードバランサーコマンドのメイン処理
 */
export async function action(args: string[]): Promise<MessageActionReturn> {
  if (args.length === 0) {
    return {
      type: 'message',
      messageType: 'info',
      content: `⚖️ **ロードバランサー機能**

複数のGemini APIエンドポイント間でリクエストを分散し、高可用性とパフォーマンスを提供します。

**利用可能なコマンド:**
- \`/loadbalancer list\` - エンドポイント一覧表示
- \`/loadbalancer add <name> <apiKey>\` - エンドポイント追加
- \`/loadbalancer remove <id>\` - エンドポイント削除
- \`/loadbalancer stats\` - 統計情報表示
- \`/loadbalancer execute <prompt>\` - リクエスト実行
- \`/loadbalancer algorithm <algorithm>\` - アルゴリズム変更
- \`/loadbalancer reset\` - 設定リセット
- \`/loadbalancer health\` - ヘルスチェック

**利用可能なアルゴリズム:**
- \`round-robin\` - ラウンドロビン（デフォルト）
- \`least-connections\` - 最小接続数
- \`weighted\` - 重み付きラウンドロビン
- \`ip-hash\` - IPハッシュ`
    };
  }

  const subcommand = args[0];

  try {
    switch (subcommand) {
      case 'list':
        return await handleListEndpoints();
      case 'add':
        return await handleAddEndpoint(args.slice(1));
      case 'remove':
        return await handleRemoveEndpoint(args.slice(1));
      case 'stats':
        return await handleShowStats();
      case 'execute':
        return await handleExecuteRequest(args.slice(1));
      case 'algorithm':
        return await handleUpdateAlgorithm(args.slice(1));
      case 'reset':
        return await handleResetConfig();
      case 'health':
        return await handleHealthCheck();
      default:
        return {
          type: 'message',
          messageType: 'error',
          content: `❌ 不明なサブコマンド: ${subcommand}\n\n利用可能なコマンド: list, add, remove, stats, execute, algorithm, reset, health`
        };
    }
  } catch (error) {
    return {
      type: 'message',
      messageType: 'error',
      content: `❌ エラーが発生しました: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * エンドポイント一覧を表示
 */
async function handleListEndpoints(): Promise<MessageActionReturn> {
  try {
    const config = await readLoadBalancerConfig();
    
    if (config.endpoints.length === 0) {
      return {
        type: 'message',
        messageType: 'info',
        content: '📋 **エンドポイント一覧**\n\n現在設定されているエンドポイントはありません。\n\n`/loadbalancer add <name> <apiKey>` で新しいエンドポイントを追加してください。'
      };
    }

    const endpointsList = config.endpoints.map(endpoint => {
      const status = endpoint.isActive ? '🟢 アクティブ' : '🔴 無効';
      const health = endpoint.lastHealthCheck > 0 ? 
        `最終チェック: ${new Date(endpoint.lastHealthCheck).toLocaleString('ja-JP')}` : 
        '未チェック';
      
      return `- **${endpoint.name}** (${status})\n  ID: \`${endpoint.id}\`\n  URL: \`${endpoint.url}\`\n  重み: ${endpoint.weight}\n  最大同時リクエスト: ${endpoint.maxConcurrentRequests}\n  現在のリクエスト: ${endpoint.currentRequests}\n  成功: ${endpoint.successCount}, エラー: ${endpoint.errorCount}\n  ${health}`;
    }).join('\n\n');

    return {
      type: 'message',
      messageType: 'info',
      content: `📋 **エンドポイント一覧**\n\n${endpointsList}\n\n**合計**: ${config.endpoints.length}個のエンドポイント\n**アルゴリズム**: ${config.algorithm}`
    };
  } catch (error) {
    return {
      type: 'message',
      messageType: 'error',
      content: `❌ エンドポイント一覧の取得に失敗しました: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * エンドポイントを追加
 */
async function handleAddEndpoint(args: string[]): Promise<MessageActionReturn> {
  if (args.length < 2) {
    return {
      type: 'message',
      messageType: 'error',
      content: '❌ 使用方法: `/loadbalancer add <name> <apiKey> [url] [weight]`\n\n例: `/loadbalancer add "Primary API" "your-api-key-here"`'
    };
  }

  try {
    const [name, apiKey, url, weightStr] = args;
    const weight = weightStr ? parseInt(weightStr, 10) : 1;
    
    if (isNaN(weight) || weight <= 0) {
      return {
        type: 'message',
        messageType: 'error',
        content: '❌ 重みは正の整数である必要があります'
      };
    }

    const endpoint = createDefaultEndpoint(name, apiKey, url);
    endpoint.weight = weight;
    
    await addLoadBalancerEndpoint(endpoint);

    return {
      type: 'message',
      messageType: 'info',
      content: `✅ **エンドポイント追加完了**\n\n**名前**: ${endpoint.name}\n**ID**: \`${endpoint.id}\`\n**URL**: \`${endpoint.url}\`\n**重み**: ${endpoint.weight}\n\nエンドポイントが正常に追加されました。`
    };
  } catch (error) {
    return {
      type: 'message',
      messageType: 'error',
      content: `❌ エンドポイントの追加に失敗しました: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * エンドポイントを削除
 */
async function handleRemoveEndpoint(args: string[]): Promise<MessageActionReturn> {
  if (args.length < 1) {
    return {
      type: 'message',
      messageType: 'error',
      content: '❌ 使用方法: `/loadbalancer remove <id>`\n\n例: `/loadbalancer remove endpoint_1234567890`'
    };
  }

  try {
    const endpointId = args[0];
    const config = await readLoadBalancerConfig();
    const endpoint = config.endpoints.find(e => e.id === endpointId);
    
    if (!endpoint) {
      return {
        type: 'message',
        messageType: 'error',
        content: `❌ エンドポイントID \`${endpointId}\` が見つかりません`
      };
    }

    const removed = await removeLoadBalancerEndpoint(endpointId);
    
    if (removed) {
      return {
        type: 'message',
        messageType: 'info',
        content: `✅ **エンドポイント削除完了**\n\n**名前**: ${endpoint.name}\n**ID**: \`${endpointId}\`\n\nエンドポイントが正常に削除されました。`
      };
    } else {
      return {
        type: 'message',
        messageType: 'error',
        content: '❌ エンドポイントの削除に失敗しました'
      };
    }
  } catch (error) {
    return {
      type: 'message',
      messageType: 'error',
      content: `❌ エンドポイントの削除に失敗しました: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * 統計情報を表示
 */
async function handleShowStats(): Promise<MessageActionReturn> {
  try {
    const config = await readLoadBalancerConfig();
    const loadBalancer = new LoadBalancerService(config);
    const stats = loadBalancer.getStats();

    const successRate = stats.totalRequests > 0 ? 
      ((stats.successfulRequests / stats.totalRequests) * 100).toFixed(2) : '0.00';

    return {
      type: 'message',
      messageType: 'info',
      content: `📊 **ロードバランサー統計**\n\n**総リクエスト数**: ${stats.totalRequests}\n**成功リクエスト**: ${stats.successfulRequests}\n**失敗リクエスト**: ${stats.failedRequests}\n**成功率**: ${successRate}%\n**平均応答時間**: ${stats.averageResponseTime.toFixed(2)}ms\n**アクティブエンドポイント**: ${stats.activeEndpoints}/${stats.totalEndpoints}\n**アルゴリズム**: ${config.algorithm}`
    };
  } catch (error) {
    return {
      type: 'message',
      messageType: 'error',
      content: `❌ 統計情報の取得に失敗しました: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * リクエストを実行
 */
async function handleExecuteRequest(args: string[]): Promise<MessageActionReturn> {
  if (args.length < 1) {
    return {
      type: 'message',
      messageType: 'error',
      content: '❌ 使用方法: `/loadbalancer execute <prompt>`\n\n例: `/loadbalancer execute "こんにちは、世界"`'
    };
  }

  try {
    const prompt = args.join(' ');
    const config = await readLoadBalancerConfig();
    
    if (config.endpoints.length === 0) {
      return {
        type: 'message',
        messageType: 'error',
        content: '❌ 利用可能なエンドポイントがありません。まずエンドポイントを追加してください。'
      };
    }

    const loadBalancer = new LoadBalancerService(config);
    const result = await loadBalancer.executeRequest(prompt);

    return {
      type: 'message',
      messageType: 'info',
      content: `✅ **リクエスト実行完了**\n\n**使用エンドポイント**: ${result.endpoint.name}\n**応答時間**: ${result.responseTime}ms\n**トークン使用量**: ${result.tokensUsed || 'N/A'}\n\n**レスポンス**:\n${result.response}`
    };
  } catch (error) {
    return {
      type: 'message',
      messageType: 'error',
      content: `❌ リクエストの実行に失敗しました: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * アルゴリズムを更新
 */
async function handleUpdateAlgorithm(args: string[]): Promise<MessageActionReturn> {
  if (args.length < 1) {
    return {
      type: 'message',
      messageType: 'error',
      content: '❌ 使用方法: `/loadbalancer algorithm <algorithm>`\n\n利用可能なアルゴリズム: round-robin, least-connections, weighted, ip-hash'
    };
  }

  try {
    const algorithm = args[0] as any;
    const validAlgorithms = ['round-robin', 'least-connections', 'weighted', 'ip-hash'];
    
    if (!validAlgorithms.includes(algorithm)) {
      return {
        type: 'message',
        messageType: 'error',
        content: `❌ 無効なアルゴリズム: ${algorithm}\n\n利用可能なアルゴリズム: ${validAlgorithms.join(', ')}`
      };
    }

    await updateLoadBalancerAlgorithm(algorithm);

    return {
      type: 'message',
      messageType: 'info',
      content: `✅ **アルゴリズム更新完了**\n\n新しいアルゴリズム: \`${algorithm}\``
    };
  } catch (error) {
    return {
      type: 'message',
      messageType: 'error',
      content: `❌ アルゴリズムの更新に失敗しました: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * 設定をリセット
 */
async function handleResetConfig(): Promise<MessageActionReturn> {
  try {
    await resetLoadBalancerConfig();

    return {
      type: 'message',
      messageType: 'info',
      content: '✅ **設定リセット完了**\n\nロードバランサーの設定がデフォルトにリセットされました。'
    };
  } catch (error) {
    return {
      type: 'message',
      messageType: 'error',
      content: `❌ 設定のリセットに失敗しました: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * ヘルスチェックを実行
 */
async function handleHealthCheck(): Promise<MessageActionReturn> {
  try {
    const config = await readLoadBalancerConfig();
    
    if (config.endpoints.length === 0) {
      return {
        type: 'message',
        messageType: 'info',
        content: '📋 **ヘルスチェック結果**\n\n設定されているエンドポイントがありません。'
      };
    }

    const loadBalancer = new LoadBalancerService(config);
    const stats = loadBalancer.getStats();

    const healthStatus = config.endpoints.map(endpoint => {
      const status = endpoint.isActive ? '🟢 正常' : '🔴 異常';
      const lastCheck = endpoint.lastHealthCheck > 0 ? 
        new Date(endpoint.lastHealthCheck).toLocaleString('ja-JP') : 
        '未チェック';
      
      return `- **${endpoint.name}**: ${status}\n  最終チェック: ${lastCheck}\n  エラー数: ${endpoint.errorCount}`;
    }).join('\n\n');

    return {
      type: 'message',
      messageType: 'info',
      content: `📋 **ヘルスチェック結果**\n\n${healthStatus}\n\n**アクティブエンドポイント**: ${stats.activeEndpoints}/${stats.totalEndpoints}`
    };
  } catch (error) {
    return {
      type: 'message',
      messageType: 'error',
      content: `❌ ヘルスチェックの実行に失敗しました: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * ロードバランサーコマンド定義
 */
export const loadBalancerCommand: SlashCommand = {
  name: 'loadbalancer',
  altNames: ['lb'],
  description: 'ロードバランサー機能 - 複数のGemini APIエンドポイント間でリクエストを分散',
  kind: 'built-in' as any,
  action: async (_context, args) => {
    const argsArray = args.trim().split(' ').filter((arg: string) => arg.length > 0);
    return await action(argsArray);
  }
}; 