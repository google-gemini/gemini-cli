/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CoreI18nMessages } from '../types.js';

export const coreZhMessages: CoreI18nMessages = {
  tools: {
    fileOperations: {
      readFile: '读取文件',
      writeFile: '写入文件',
      fileNotFound: '文件未找到',
      permissionDenied: '权限不足',
    },
    shellCommands: {
      executing: '执行命令',
      completed: '命令完成',
      failed: '命令失败',
    },
    webFetching: {
      fetching: '获取URL',
      success: '获取完成',
      failed: '获取失败',
    },
  },
  api: {
    authentication: {
      authenticating: '认证中',
      success: '认证成功',
      failed: '认证失败',
      tokenExpired: '认证令牌已过期',
    },
    requests: {
      sending: '发送请求',
      processing: '处理请求',
      completed: '请求完成',
      failed: '请求失败',
      rateLimited: '请求受限',
    },
  },
  errors: {
    networkTimeout: '网络超时',
    invalidApiKey: '无效的API密钥',
    quotaExceeded: '配额超出',
    serviceUnavailable: '服务不可用',
    invalidRequest: '无效请求',
    serverError: '服务器错误',
  },
  status: {
    initializing: '初始化中',
    ready: '就绪',
    busy: '忙碌',
    error: '错误',
    offline: '离线',
  },
};
