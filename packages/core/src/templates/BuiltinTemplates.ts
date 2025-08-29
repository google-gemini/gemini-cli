/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { PresetTemplate, TemplateCategory } from './types.js';

export const TEMPLATE_CATEGORIES: Record<string, TemplateCategory> = {
  CODE_ANALYSIS: {
    id: 'code_analysis',
    name: '代码分析',
    icon: '🔍',
    description: '代码审查、重构和优化相关模板',
    color: 'blue'
  },
  FILE_PROCESSING: {
    id: 'file_processing',
    name: '文件处理',
    icon: '📁',
    description: '批量文件操作和数据处理模板',
    color: 'green'
  },
  DOCUMENTATION: {
    id: 'documentation',
    name: '文档生成',
    icon: '📝',
    description: 'README、API文档等生成模板',
    color: 'purple'
  },
  DATA_ANALYSIS: {
    id: 'data_analysis',
    name: '数据分析',
    icon: '📊',
    description: '数据清洗、统计分析模板',
    color: 'orange'
  },
  TESTING: {
    id: 'testing',
    name: '测试生成',
    icon: '🧪',
    description: '单元测试、集成测试生成模板',
    color: 'red'
  },
  TRANSLATION: {
    id: 'translation',
    name: '翻译处理',
    icon: '🌐',
    description: '多语言翻译和本地化模板',
    color: 'cyan'
  }
};

export const BUILTIN_TEMPLATES: Record<string, PresetTemplate> = {
  code_review: {
    id: 'code_review',
    name: '代码审查',
    description: '对指定文件或目录进行全面的代码审查，包含性能、安全性和可维护性分析',
    category: 'code_analysis',
    icon: '🔍',
    template: `请对以下代码进行全面审查：

## 审查目标
{{#if target_path}}
文件/目录路径: {{target_path}}
{{/if}}
{{#if focus_areas}}
重点关注领域: {{focus_areas}}
{{/if}}

## 审查要求
1. **代码质量**: 检查代码结构、命名规范、注释质量
2. **性能优化**: 识别潜在的性能瓶颈和优化机会  
3. **安全性**: 检查安全漏洞和最佳安全实践
4. **可维护性**: 评估代码的可读性和可扩展性
5. **错误处理**: 检查异常处理和边界条件

{{#if specific_concerns}}
## 特别关注
{{specific_concerns}}
{{/if}}

请提供：
- 发现的问题清单（按优先级排序）
- 具体的改进建议和代码示例
- 整体质量评分（1-10分）
- 后续优化建议`,
    variables: [
      {
        name: 'target_path',
        type: 'file_path',
        description: '要审查的文件或目录路径',
        required: true,
        placeholder: 'src/components/MyComponent.tsx'
      },
      {
        name: 'focus_areas',
        type: 'text',
        description: '重点关注的审查领域',
        required: false,
        defaultValue: '性能, 安全性, 可维护性',
        placeholder: '性能, 安全性, 可维护性'
      },
      {
        name: 'specific_concerns',
        type: 'text',
        description: '特别关注的问题或担忧',
        required: false,
        placeholder: '内存泄漏风险、并发安全等'
      }
    ],
    tags: ['code-review', 'quality', 'analysis'],
    author: 'Gemini CLI Team',
    version: '1.0.0',
    lastModified: new Date('2025-01-15'),
    isBuiltin: true
  },

  batch_file_process: {
    id: 'batch_file_process',
    name: '批量文件处理',
    description: '批量处理多个文件，支持格式转换、内容替换、结构重组等操作',
    category: 'file_processing',
    icon: '📁',
    template: `请执行以下批量文件处理任务：

## 处理目标
{{#if source_pattern}}
源文件模式: {{source_pattern}}
{{/if}}
{{#if target_directory}}
目标目录: {{target_directory}}
{{/if}}

## 处理操作
{{operation_type}}

{{#if operation_details}}
## 操作详情
{{operation_details}}
{{/if}}

## 处理要求
1. **安全性**: 处理前备份重要文件
2. **完整性**: 确保所有文件都被正确处理
3. **日志记录**: 记录处理过程和结果
4. **错误处理**: 遇到问题时提供清晰的错误信息

{{#if validation_rules}}
## 验证规则
{{validation_rules}}
{{/if}}

请执行处理并提供：
- 处理进度报告
- 成功/失败文件列表
- 遇到的问题和解决方案
- 处理结果总结`,
    variables: [
      {
        name: 'source_pattern',
        type: 'text',
        description: '源文件匹配模式',
        required: true,
        placeholder: '**/*.md 或 src/**/*.js'
      },
      {
        name: 'target_directory',
        type: 'directory_path',
        description: '目标输出目录',
        required: false,
        placeholder: 'output/'
      },
      {
        name: 'operation_type',
        type: 'text',
        description: '要执行的操作类型',
        required: true,
        placeholder: '格式转换、内容替换、重命名等'
      },
      {
        name: 'operation_details',
        type: 'text',
        description: '操作的详细说明',
        required: false,
        placeholder: '具体的转换规则或替换内容'
      },
      {
        name: 'validation_rules',
        type: 'text',
        description: '处理结果的验证规则',
        required: false,
        placeholder: '文件大小、格式检查等'
      }
    ],
    tags: ['batch-processing', 'file-operations', 'automation'],
    author: 'Gemini CLI Team',
    version: '1.0.0',
    lastModified: new Date('2025-01-15'),
    isBuiltin: true
  },

  api_documentation: {
    id: 'api_documentation',
    name: 'API文档生成',
    description: '为代码项目生成完整的API文档，包含接口说明、示例和使用指南',
    category: 'documentation',
    icon: '📝',
    template: `请为以下项目生成API文档：

## 项目信息
{{#if project_path}}
项目路径: {{project_path}}
{{/if}}
{{#if api_format}}
API格式: {{api_format}}
{{/if}}
{{#if target_audience}}
目标受众: {{target_audience}}
{{/if}}

## 文档要求
1. **API概览**: 项目结构和核心功能介绍
2. **接口文档**: 详细的API端点、参数和返回值说明
3. **代码示例**: 实际使用的代码示例和最佳实践
4. **错误处理**: 常见错误码和处理方法
5. **版本信息**: API版本历史和变更记录

{{#if include_examples}}
## 示例需求
{{include_examples}}
{{/if}}

{{#if special_requirements}}
## 特殊要求
{{special_requirements}}
{{/if}}

请生成：
- 完整的API文档结构
- Markdown格式的文档内容
- 交互式示例（如适用）
- 文档部署建议`,
    variables: [
      {
        name: 'project_path',
        type: 'directory_path',
        description: '项目根目录路径',
        required: true,
        placeholder: './src'
      },
      {
        name: 'api_format',
        type: 'text',
        description: 'API类型和格式',
        required: true,
        defaultValue: 'REST API',
        placeholder: 'REST API, GraphQL, gRPC等'
      },
      {
        name: 'target_audience',
        type: 'text',
        description: '文档的目标受众',
        required: false,
        defaultValue: '开发者',
        placeholder: '前端开发者、后端开发者、第三方集成商等'
      },
      {
        name: 'include_examples',
        type: 'boolean',
        description: '是否包含详细的代码示例',
        required: false,
        defaultValue: true
      },
      {
        name: 'special_requirements',
        type: 'text',
        description: '特殊的文档要求',
        required: false,
        placeholder: '特定格式、工具集成、多语言支持等'
      }
    ],
    tags: ['documentation', 'api', 'generation'],
    author: 'Gemini CLI Team',
    version: '1.0.0',
    lastModified: new Date('2025-01-15'),
    isBuiltin: true
  },

  test_generation: {
    id: 'test_generation',
    name: '测试用例生成',
    description: '为指定的代码模块生成全面的测试用例，包含单元测试和集成测试',
    category: 'testing',
    icon: '🧪',
    template: `请为以下代码生成测试用例：

## 测试目标
{{#if target_files}}
目标文件: {{target_files}}
{{/if}}
{{#if test_framework}}
测试框架: {{test_framework}}
{{/if}}
{{#if coverage_goal}}
覆盖率目标: {{coverage_goal}}%
{{/if}}

## 测试类型
{{test_types}}

## 测试要求
1. **全面性**: 覆盖所有公共方法和边界条件
2. **独立性**: 每个测试用例应该独立可执行
3. **可维护性**: 清晰的测试名称和结构
4. **性能**: 测试执行效率和资源使用
5. **文档**: 测试用例的说明和注释

{{#if mock_requirements}}
## Mock需求
{{mock_requirements}}
{{/if}}

{{#if edge_cases}}
## 边界条件
{{edge_cases}}
{{/if}}

请生成：
- 完整的测试文件结构
- 具体的测试用例代码
- 测试数据和Mock设置
- 运行和维护指南`,
    variables: [
      {
        name: 'target_files',
        type: 'text',
        description: '要测试的文件列表',
        required: true,
        placeholder: 'src/utils/helper.ts, src/components/Button.tsx'
      },
      {
        name: 'test_framework',
        type: 'text',
        description: '使用的测试框架',
        required: true,
        defaultValue: 'Jest',
        placeholder: 'Jest, Vitest, Mocha等'
      },
      {
        name: 'test_types',
        type: 'text',
        description: '需要的测试类型',
        required: true,
        defaultValue: '单元测试, 集成测试',
        placeholder: '单元测试, 集成测试, E2E测试等'
      },
      {
        name: 'coverage_goal',
        type: 'number',
        description: '目标代码覆盖率',
        required: false,
        defaultValue: 80,
        validation: { min: 50, max: 100 }
      },
      {
        name: 'mock_requirements',
        type: 'text',
        description: '需要Mock的依赖和服务',
        required: false,
        placeholder: 'API调用、数据库连接、外部服务等'
      },
      {
        name: 'edge_cases',
        type: 'text',
        description: '需要特别测试的边界条件',
        required: false,
        placeholder: '空值、异常输入、网络错误等'
      }
    ],
    tags: ['testing', 'unit-test', 'integration-test'],
    author: 'Gemini CLI Team',
    version: '1.0.0',
    lastModified: new Date('2025-01-15'),
    isBuiltin: true
  },

  multi_lang_translation: {
    id: 'multi_lang_translation',
    name: '多语言翻译',
    description: '批量翻译文档或界面文本，支持多种语言和格式',
    category: 'translation',
    icon: '🌐',
    template: `请执行以下翻译任务：

## 翻译配置
{{#if source_language}}
源语言: {{source_language}}
{{/if}}
{{#if target_languages}}
目标语言: {{target_languages}}
{{/if}}
{{#if content_type}}
内容类型: {{content_type}}
{{/if}}

## 翻译内容
{{#if source_files}}
源文件: {{source_files}}
{{/if}}
{{#if direct_content}}
直接内容:
{{direct_content}}
{{/if}}

## 翻译要求
1. **准确性**: 保持原文的意思和语调
2. **本地化**: 适应目标语言的文化习惯
3. **一致性**: 术语和风格保持统一
4. **格式**: 保持原始格式和结构
5. **质量**: 自然流畅的目标语言表达

{{#if context_info}}
## 上下文信息
{{context_info}}
{{/if}}

{{#if terminology}}
## 专业术语
{{terminology}}
{{/if}}

请提供：
- 完整的翻译文本
- 术语对照表
- 翻译质量评估
- 本地化建议`,
    variables: [
      {
        name: 'source_language',
        type: 'text',
        description: '源语言',
        required: true,
        defaultValue: '中文',
        placeholder: '中文, English, 日本语等'
      },
      {
        name: 'target_languages',
        type: 'text',
        description: '目标语言列表',
        required: true,
        placeholder: 'English, 日本语, 한국어'
      },
      {
        name: 'content_type',
        type: 'text',
        description: '内容类型',
        required: true,
        defaultValue: '技术文档',
        placeholder: '技术文档, 用户界面, 营销文案等'
      },
      {
        name: 'source_files',
        type: 'text',
        description: '源文件路径',
        required: false,
        placeholder: 'docs/**/*.md, src/i18n/zh-CN.json'
      },
      {
        name: 'direct_content',
        type: 'text',
        description: '直接输入的待翻译内容',
        required: false,
        placeholder: '在此输入需要翻译的文本内容...'
      },
      {
        name: 'context_info',
        type: 'text',
        description: '上下文和背景信息',
        required: false,
        placeholder: '产品背景、用户群体、使用场景等'
      },
      {
        name: 'terminology',
        type: 'text',
        description: '专业术语和固定翻译',
        required: false,
        placeholder: '特定术语的翻译对照'
      }
    ],
    tags: ['translation', 'localization', 'i18n'],
    author: 'Gemini CLI Team',
    version: '1.0.0',
    lastModified: new Date('2025-01-15'),
    isBuiltin: true
  }
};