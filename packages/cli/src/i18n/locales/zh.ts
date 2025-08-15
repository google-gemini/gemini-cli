/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { I18nMessages } from '../types.js';

export const zhMessages: I18nMessages = {
  ui: {
    auth: {
      getStarted: '开始使用',
      howToAuthenticate: '您希望如何为此项目进行身份验证？',
      loginWithGoogle: '使用Google登录',
      useGeminiApiKey: '使用Gemini API密钥',
      vertexAi: 'Vertex AI',
      useEnterToSelect: '（按Enter键选择）',
      termsOfService: 'Gemini CLI的服务条款和隐私声明',
      authenticationTimeout: '身份验证超时。请重试。',
      waitingForAuth: '等待身份验证...（按ESC或CTRL+C取消）',
      inProgress: '认证进行中...',
      selectMethod: '选择认证方式',
      authenticating: '认证中...',
      success: '认证成功',
      failed: '认证失败',
    },
    tips: {
      gettingStarted: '入门指南：',
      askQuestions: '1. 提问、编辑文件或运行命令。',
      beSpecific: '2. 请具体说明以获得最佳结果。',
      helpCommand: '输入 /help 获取更多信息。',
      createFiles: '创建',
      filesForContext: '文件以获得更好的上下文。',
    },
    status: {
      connecting: '连接中...',
      processing: '处理中...',
      loading: '加载中...',
      ready: '就绪',
    },
    prompts: {
      confirmAction: '确认此操作？',
      continueYesNo: '继续？(Y/n)',
    },
    memory: {
      refreshing: '刷新内存中...',
      loaded: '内存已加载',
    },
    privacy: {
      geminiApiNotice: {
        title: 'Gemini API 密钥通知',
        content: '通过使用 Gemini API[1]、Google AI Studio[2] 以及引用这些条款的其他 Google 开发者服务（统称为"API"或"服务"），您同意遵守 Google API 服务条款（"API 条款"）[3] 和 Gemini API 附加服务条款（"附加条款"）[4]。',
        links: {
          geminiApi: 'https://ai.google.dev/docs/gemini_api_overview',
          googleAiStudio: 'https://aistudio.google.com/',
          apiTerms: 'https://developers.google.com/terms',
          additionalTerms: 'https://ai.google.dev/gemini-api/terms',
        },
        exitPrompt: '按 Esc 键退出。',
      },
      cloudFreeNotice: {
        title: 'Cloud 免费服务通知',
        content: '您正在使用 Google Cloud 服务的免费层级。',
        exitPrompt: '按 Esc 键退出。',
      },
      cloudPaidNotice: {
        title: 'Cloud 付费服务通知',
        content: '您正在使用 Google Cloud 的付费服务。',
        exitPrompt: '按 Esc 键退出。',
      },
    },
    footer: {
      model: '模型',
      directory: '目录',
      branch: '分支',
      debug: '调试',
      errorCount: '错误',
      tokens: '令牌',
    },
    shell: {
      confirmExecution: '确认执行Shell命令？',
      command: '命令',
      approve: '批准',
      deny: '拒绝',
    },
    session: {
      goodbye: '代理关闭中。再见！',
    },
  },
  commands: {
    help: '显示帮助',
    version: '显示版本号',
    launch: '启动 Gemini CLI',
    mcp: '模型上下文协议命令',
  },
  options: {
    model: {
      description: '模型',
    },
    prompt: {
      description: '提示词。将附加到标准输入的内容（如果有）。',
    },
    promptInteractive: {
      description: '执行提供的提示词并继续进入交互模式',
    },
    sandbox: {
      description: '在沙盒中运行？',
    },
    sandboxImage: {
      description: '沙盒镜像URI。',
    },
    debug: {
      description: '在调试模式下运行？',
    },
    allFiles: {
      description: '在上下文中包含所有文件？',
    },
    showMemoryUsage: {
      description: '在状态栏显示内存使用情况',
    },
    yolo: {
      description: '自动接受所有操作（又称YOLO模式，详见 https://www.youtube.com/watch?v=xvFZjo5PgG0）？',
    },
    approvalMode: {
      description: '设置批准模式：default（提示批准）、auto_edit（自动批准编辑工具）、yolo（自动批准所有工具）',
      choices: {
        default: '提示批准',
        autoEdit: '自动批准编辑工具',
        yolo: '自动批准所有工具',
      },
    },
    telemetry: {
      description: '启用遥测？此标志专门控制是否发送遥测数据。其他 --telemetry-* 标志设置特定值，但本身不启用遥测。',
    },
    telemetryTarget: {
      description: '设置遥测目标（local 或 gcp）。覆盖设置文件。',
    },
    telemetryOtlpEndpoint: {
      description: '设置遥测的OTLP端点。覆盖环境变量和设置文件。',
    },
    telemetryLogPrompts: {
      description: '启用或禁用用户提示词的遥测日志记录。覆盖设置文件。',
    },
    telemetryOutfile: {
      description: '将所有遥测输出重定向到指定文件。',
    },
    checkpointing: {
      description: '启用文件编辑的检查点功能',
    },
    experimentalAcp: {
      description: '以ACP模式启动代理',
    },
    allowedMcpServerNames: {
      description: '允许的MCP服务器名称',
    },
    extensions: {
      description: '要使用的扩展列表。如果未提供，将使用所有扩展。',
    },
    listExtensions: {
      description: '列出所有可用扩展并退出。',
    },
    proxy: {
      description: 'Gemini客户端代理，如 schema://user:password@host:port',
    },
    includeDirectories: {
      description: '要包含在工作区中的其他目录（逗号分隔或多个 --include-directories）',
    },
    language: {
      description: '设置界面语言',
    },
  },
  usage: {
    main: '用法: gemini [选项] [命令]\n\nGemini CLI - 启动交互式CLI，使用 -p/--prompt 进入非交互模式',
  },
  errors: {
    conflictingPromptOptions: '不能同时使用 --prompt (-p) 和 --prompt-interactive (-i)',
    conflictingYoloOptions: '不能同时使用 --yolo (-y) 和 --approval-mode。请改用 --approval-mode=yolo。',
    authFailed: '认证失败',
    networkError: '发生网络错误',
    unexpectedError: '发生了意外的严重错误',
    configLoadError: '配置加载失败',
    invalidLanguage: '指定的语言无效',
    promptInteractiveNotSupported: '错误：从标准输入管道输入时不支持 --prompt-interactive 标志。',
  },
  warnings: {
    deprecatedOption: '已弃用',
    invalidDnsOrder: '设置中的 dnsResolutionOrder 值无效："{{order}}"。使用默认值"{{defaultValue}}"。',
    deprecatedAllFiles: '请使用 --all-files 代替。我们将在几周内移除 --all_files。',
    deprecatedShowMemoryUsage: '请使用 --show-memory-usage 代替。我们将在几周内移除 --show_memory_usage。',
  },
  startup: {
    memoryArgs: '内存参数已配置',
    relaunching: '使用附加参数重新启动',
    sandboxMode: '在沙盒模式下运行',
    debugMode: '调试模式已启用',
  },
};
