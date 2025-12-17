# 阶段 0: 准备阶段 - 详细执行方案

## 📋 概览

**阶段目标**: 完成项目启动前的所有准备工作
**持续时间**: 1 周 (5 个工作日)
**关键产出**: 可运行的开发环境 + 技术验证报告 + 开发文档

---

## 🗓️ 时间规划

| 任务模块 | 天数 | 负责人 | 依赖 |
|---------|------|--------|------|
| 0.1 项目初始化 | 2 天 | 架构师 + 全员 | 无 |
| 0.2 技术验证 | 2 天 | 后端工程师 × 2 | 0.1 完成 |
| 0.3 基础设施搭建 | 2 天 | DevOps + 后端 | 0.1 完成 |
| 0.4 团队准备 | 1 天 | 架构师 + 全员 | 0.1, 0.2, 0.3 完成 |

**注意**: 0.2 和 0.3 可以并行进行

---

## 📦 任务 0.1: 项目初始化 (2 天)

### 目标
建立完整的项目骨架，配置开发工具链，确保团队协作环境就绪。

### 详细步骤

#### Day 1: 仓库创建与 Monorepo 配置

**步骤 1.1: 创建 Git 仓库** (30 分钟)

```bash
# 1. 在 GitHub/GitLab 创建新仓库
# 仓库名: gemini-web-platform
# 描述: Web-based AI Agent Platform powered by Google Gemini

# 2. 克隆到本地
git clone https://github.com/your-org/gemini-web-platform.git
cd gemini-web-platform

# 3. 初始化 Git
git init
git branch -M main

# 4. 创建基础分支策略
git checkout -b develop
git push -u origin develop
git push -u origin main
```

**步骤 1.2: 创建 Monorepo 目录结构** (1 小时)

```bash
# 创建完整的项目结构
mkdir -p packages/{backend,frontend,shared,core}
mkdir -p infrastructure/{docker,kubernetes,nginx}
mkdir -p scripts
mkdir -p docs
mkdir -p .github/workflows

# 创建基础文件
touch README.md
touch .gitignore
touch .env.example
touch package.json
touch pnpm-workspace.yaml
```

**步骤 1.3: 配置根 package.json** (30 分钟)

创建 `package.json`:

```json
{
  "name": "gemini-web-platform",
  "version": "0.1.0",
  "description": "Web-based AI Agent Platform powered by Google Gemini",
  "private": true,
  "engines": {
    "node": ">=20.0.0",
    "pnpm": ">=8.0.0"
  },
  "scripts": {
    "dev": "pnpm run --parallel dev",
    "dev:backend": "pnpm --filter @gemini-web/backend dev",
    "dev:frontend": "pnpm --filter @gemini-web/frontend dev",
    "build": "pnpm run --recursive build",
    "test": "pnpm run --recursive test",
    "lint": "pnpm run --recursive lint",
    "format": "prettier --write \"**/*.{ts,tsx,js,jsx,json,md}\"",
    "typecheck": "pnpm run --recursive typecheck",
    "clean": "pnpm run --recursive clean && rm -rf node_modules",
    "setup": "./scripts/setup-dev.sh"
  },
  "devDependencies": {
    "@types/node": "^20.11.0",
    "typescript": "^5.3.3",
    "prettier": "^3.1.1",
    "eslint": "^8.56.0",
    "vitest": "^1.2.0",
    "tsx": "^4.7.0"
  },
  "packageManager": "pnpm@8.15.0"
}
```

**步骤 1.4: 配置 pnpm workspaces** (15 分钟)

创建 `pnpm-workspace.yaml`:

```yaml
packages:
  - 'packages/*'
```

**步骤 1.5: 配置 .gitignore** (15 分钟)

创建 `.gitignore`:

```gitignore
# Dependencies
node_modules/
.pnpm-store/

# Build outputs
dist/
build/
*.tsbuildinfo

# Environment variables
.env
.env.local
.env.*.local

# IDE
.vscode/*
!.vscode/settings.json
!.vscode/extensions.json
.idea/
*.swp
*.swo
*~

# OS
.DS_Store
Thumbs.db

# Logs
logs/
*.log
npm-debug.log*
pnpm-debug.log*

# Testing
coverage/
.nyc_output/

# Docker
.docker-data/

# Temporary
tmp/
temp/
*.tmp
```

**步骤 1.6: 设置环境变量模板** (30 分钟)

创建 `.env.example`:

```bash
# ==========================================
# Gemini Web Platform - Environment Variables
# ==========================================

# Node Environment
NODE_ENV=development

# Backend Configuration
BACKEND_PORT=3000
BACKEND_HOST=localhost

# Frontend Configuration
FRONTEND_PORT=5173
FRONTEND_URL=http://localhost:5173

# Database (PostgreSQL)
DATABASE_URL=postgresql://postgres:password@localhost:5432/gemini_web
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=gemini_web
DATABASE_USER=postgres
DATABASE_PASSWORD=password

# Redis
REDIS_URL=redis://localhost:6379
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# MinIO / S3
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=gemini-workspaces
MINIO_USE_SSL=false

# Gemini API
GEMINI_API_KEY=your_gemini_api_key_here

# JWT Authentication
JWT_SECRET=your_jwt_secret_here_change_in_production
JWT_EXPIRES_IN=7d
JWT_REFRESH_EXPIRES_IN=30d

# OAuth (Google)
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_CALLBACK_URL=http://localhost:3000/api/auth/google/callback

# Docker Configuration
DOCKER_HOST=unix:///var/run/docker.sock
SANDBOX_IMAGE=gemini-sandbox:latest
SANDBOX_MEMORY_LIMIT=512m
SANDBOX_CPU_LIMIT=1

# Security
CORS_ORIGIN=http://localhost:5173
RATE_LIMIT_WINDOW=15m
RATE_LIMIT_MAX_REQUESTS=100

# Logging
LOG_LEVEL=debug
LOG_FORMAT=json

# Session
SESSION_SECRET=your_session_secret_here
SESSION_MAX_AGE=86400000

# WebSocket
WS_PING_INTERVAL=30000
WS_PING_TIMEOUT=5000
```

---

#### Day 2: TypeScript、ESLint、Prettier 配置

**步骤 2.1: 配置 TypeScript** (1 小时)

创建根 `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "lib": ["ES2022"],
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "allowJs": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "composite": true,
    "incremental": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  },
  "exclude": ["node_modules", "dist", "build"]
}
```

创建 `packages/shared/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

创建 `packages/backend/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "types": ["node", "vitest/globals"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"],
  "references": [
    { "path": "../shared" }
  ]
}
```

创建 `packages/frontend/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "module": "ESNext",
    "outDir": "./dist",
    "rootDir": "./src",
    "types": ["vite/client", "vitest/globals"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"],
  "references": [
    { "path": "../shared" }
  ]
}
```

**步骤 2.2: 配置 ESLint** (1 小时)

安装依赖:

```bash
pnpm add -D -w \
  eslint \
  @typescript-eslint/parser \
  @typescript-eslint/eslint-plugin \
  eslint-config-prettier \
  eslint-plugin-import \
  eslint-plugin-react \
  eslint-plugin-react-hooks
```

创建 `eslint.config.js`:

```javascript
import js from '@eslint/js';
import typescript from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';
import prettier from 'eslint-config-prettier';
import importPlugin from 'eslint-plugin-import';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  js.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        console: 'readonly',
        process: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': typescript,
      import: importPlugin,
      react,
      'react-hooks': reactHooks,
    },
    rules: {
      ...typescript.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_' },
      ],
      'import/order': [
        'error',
        {
          groups: [
            'builtin',
            'external',
            'internal',
            'parent',
            'sibling',
            'index',
          ],
          'newlines-between': 'always',
          alphabetize: { order: 'asc' },
        },
      ],
    },
  },
  {
    files: ['**/*.{jsx,tsx}'],
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
  },
  prettier,
];
```

**步骤 2.3: 配置 Prettier** (30 分钟)

安装依赖:

```bash
pnpm add -D -w prettier
```

创建 `.prettierrc`:

```json
{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": true,
  "printWidth": 80,
  "tabWidth": 2,
  "useTabs": false,
  "arrowParens": "always",
  "endOfLine": "lf"
}
```

创建 `.prettierignore`:

```
node_modules
dist
build
coverage
.pnpm-store
*.log
.env
pnpm-lock.yaml
```

**步骤 2.4: 配置 VS Code 工作区** (30 分钟)

创建 `.vscode/settings.json`:

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "typescript.tsdk": "node_modules/typescript/lib",
  "typescript.enablePromptUseWorkspaceTsdk": true,
  "[typescript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "[typescriptreact]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "[json]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  }
}
```

创建 `.vscode/extensions.json`:

```json
{
  "recommendations": [
    "esbenp.prettier-vscode",
    "dbaeumer.vscode-eslint",
    "ms-vscode.vscode-typescript-next",
    "bradlc.vscode-tailwindcss",
    "prisma.prisma"
  ]
}
```

**步骤 2.5: 设置 GitHub Actions CI/CD** (1.5 小时)

创建 `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  lint:
    name: Lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Setup pnpm
        uses: pnpm/action-setup@v2
        with:
          version: 8

      - name: Get pnpm store directory
        id: pnpm-cache
        shell: bash
        run: |
          echo "STORE_PATH=$(pnpm store path)" >> $GITHUB_OUTPUT

      - name: Setup pnpm cache
        uses: actions/cache@v3
        with:
          path: ${{ steps.pnpm-cache.outputs.STORE_PATH }}
          key: ${{ runner.os }}-pnpm-store-${{ hashFiles('**/pnpm-lock.yaml') }}
          restore-keys: |
            ${{ runner.os }}-pnpm-store-

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run ESLint
        run: pnpm run lint

      - name: Check formatting
        run: pnpm exec prettier --check "**/*.{ts,tsx,js,jsx,json,md}"

  typecheck:
    name: Type Check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - uses: pnpm/action-setup@v2
        with:
          version: 8
      - run: pnpm install --frozen-lockfile
      - run: pnpm run typecheck

  test:
    name: Test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - uses: pnpm/action-setup@v2
        with:
          version: 8
      - run: pnpm install --frozen-lockfile
      - run: pnpm run test

  build:
    name: Build
    runs-on: ubuntu-latest
    needs: [lint, typecheck, test]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - uses: pnpm/action-setup@v2
        with:
          version: 8
      - run: pnpm install --frozen-lockfile
      - run: pnpm run build
```

**步骤 2.6: 创建开发文档** (1 小时)

创建 `docs/DEVELOPMENT.md`:

```markdown
# 开发指南

## 环境要求

- Node.js >= 20.0.0
- pnpm >= 8.0.0
- Docker >= 20.0.0
- Docker Compose >= 2.0.0

## 快速开始

### 1. 克隆仓库

\`\`\`bash
git clone https://github.com/your-org/gemini-web-platform.git
cd gemini-web-platform
\`\`\`

### 2. 安装依赖

\`\`\`bash
pnpm install
\`\`\`

### 3. 配置环境变量

\`\`\`bash
cp .env.example .env
# 编辑 .env 文件，填入必要的配置
\`\`\`

### 4. 启动开发环境

\`\`\`bash
# 启动所有服务（数据库、Redis、MinIO）
docker-compose up -d

# 启动后端
pnpm dev:backend

# 启动前端（新终端）
pnpm dev:frontend
\`\`\`

### 5. 访问应用

- 前端: http://localhost:5173
- 后端 API: http://localhost:3000
- MinIO 控制台: http://localhost:9001

## 项目结构

见 README.md

## 开发工作流

### 分支策略

- `main` - 生产环境分支
- `develop` - 开发分支
- `feature/*` - 功能分支
- `bugfix/*` - 修复分支
- `hotfix/*` - 紧急修复分支

### 提交规范

使用 Conventional Commits:

- `feat:` - 新功能
- `fix:` - 修复
- `docs:` - 文档
- `style:` - 格式化
- `refactor:` - 重构
- `test:` - 测试
- `chore:` - 构建/工具

示例:
\`\`\`
feat(backend): add user authentication
fix(frontend): resolve chat message overflow
docs: update API documentation
\`\`\`

### 代码规范

在提交前运行:

\`\`\`bash
# 格式化代码
pnpm format

# 检查 lint
pnpm lint

# 类型检查
pnpm typecheck

# 运行测试
pnpm test
\`\`\`

## 常用命令

\`\`\`bash
# 开发
pnpm dev                    # 启动所有包的开发模式
pnpm dev:backend           # 只启动后端
pnpm dev:frontend          # 只启动前端

# 构建
pnpm build                 # 构建所有包
pnpm build:backend         # 只构建后端
pnpm build:frontend        # 只构建前端

# 测试
pnpm test                  # 运行所有测试
pnpm test:watch            # 监听模式运行测试
pnpm test:coverage         # 生成覆盖率报告

# 代码质量
pnpm lint                  # 运行 ESLint
pnpm lint:fix              # 自动修复 ESLint 问题
pnpm format                # 格式化代码
pnpm typecheck             # TypeScript 类型检查

# 清理
pnpm clean                 # 清理所有构建产物和依赖
\`\`\`

## 调试

### 后端调试

\`\`\`bash
cd packages/backend
pnpm dev:debug
\`\`\`

然后在 VS Code 中按 F5 或使用 Chrome DevTools。

### 前端调试

使用 React DevTools 和浏览器开发者工具。

## 故障排查

### pnpm install 失败

\`\`\`bash
rm -rf node_modules pnpm-lock.yaml
pnpm store prune
pnpm install
\`\`\`

### Docker 容器无法启动

\`\`\`bash
docker-compose down -v
docker-compose up -d
\`\`\`

### 端口被占用

修改 `.env` 文件中的端口配置。

## 更多信息

- [API 文档](./API.md)
- [部署指南](./DEPLOYMENT.md)
- [架构设计](../BS_MIGRATION_PLAN.md)
\`\`\`

**验证清单**:

- [ ] `pnpm install` 成功执行
- [ ] `pnpm lint` 通过
- [ ] `pnpm typecheck` 通过
- [ ] `.env` 文件已创建
- [ ] VS Code 扩展推荐已显示
- [ ] GitHub Actions CI 配置正确

---

## 🔬 任务 0.2: 技术验证 (2 天)

### 目标
验证核心技术栈的可行性，特别是 `packages/core` 在服务器环境的运行。

### 详细步骤

#### Day 1: Core 包验证 + Gemini API 测试

**步骤 1.1: 设置 Core 包引用** (1 小时)

```bash
# 方案 A: Git Submodule (推荐)
cd packages
git submodule add https://github.com/google-gemini/gemini-cli.git gemini-cli
ln -s gemini-cli/packages/core core

# 方案 B: 直接复制
# cp -r /path/to/gemini-cli/packages/core packages/core
```

创建 `packages/backend/package.json`:

```json
{
  "name": "@gemini-web/backend",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "test": "vitest"
  },
  "dependencies": {
    "@google/gemini-cli-core": "workspace:*",
    "@google/genai": "^1.30.0",
    "dotenv": "^17.1.0"
  },
  "devDependencies": {
    "@types/node": "^20.11.0",
    "tsx": "^4.7.0",
    "typescript": "^5.3.3",
    "vitest": "^1.2.0"
  }
}
```

**步骤 1.2: 创建 Core 验证脚本** (1.5 小时)

创建 `scripts/verify-core.ts`:

```typescript
import { GeminiClient } from '@google/gemini-cli-core';
import { createConfig } from './test-config.js';
import * as dotenv from 'dotenv';

dotenv.config();

async function verifyCore() {
  console.log('🔍 验证 packages/core 在服务器环境运行...\n');

  try {
    // 1. 验证配置创建
    console.log('✓ 步骤 1: 创建配置对象...');
    const config = await createConfig();
    console.log('  ✅ 配置创建成功\n');

    // 2. 验证 GeminiClient 初始化
    console.log('✓ 步骤 2: 初始化 GeminiClient...');
    const client = new GeminiClient(config);
    await client.initialize();
    console.log('  ✅ GeminiClient 初始化成功\n');

    // 3. 验证简单对话
    console.log('✓ 步骤 3: 测试简单对话...');
    const testMessage = 'Hello! Please respond with "OK" if you can hear me.';

    let responseReceived = false;
    for await (const event of client.sendMessage(testMessage)) {
      if (event.type === 'content' && event.text) {
        console.log('  📝 收到响应:', event.text.substring(0, 50) + '...');
        responseReceived = true;
        break;
      }
    }

    if (!responseReceived) {
      throw new Error('未收到模型响应');
    }
    console.log('  ✅ 对话测试成功\n');

    // 4. 验证工具系统
    console.log('✓ 步骤 4: 验证工具系统...');
    const tools = config.getToolRegistry().getAllTools();
    console.log(`  📦 可用工具数量: ${tools.length}`);
    console.log(`  📦 工具列表: ${tools.map(t => t.name).join(', ')}`);
    console.log('  ✅ 工具系统正常\n');

    console.log('🎉 所有验证通过！packages/core 可在服务器环境正常运行。\n');

    return true;
  } catch (error) {
    console.error('❌ 验证失败:', error);
    return false;
  }
}

// 辅助函数：创建测试配置
async function createConfig() {
  const { Config } = await import('@google/gemini-cli-core');

  return new Config({
    apiKey: process.env.GEMINI_API_KEY,
    targetDir: process.cwd(),
    sessionId: 'test-session',
    // 其他必要配置...
  });
}

// 运行验证
verifyCore()
  .then(success => process.exit(success ? 0 : 1))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
```

运行验证:

```bash
cd packages/backend
pnpm install
GEMINI_API_KEY=your_key_here pnpm tsx ../../scripts/verify-core.ts
```

**步骤 1.3: Gemini API 完整测试** (1.5 小时)

创建 `scripts/verify-gemini-api.ts`:

```typescript
import { GoogleGenerativeAI } from '@google/genai';
import * as dotenv from 'dotenv';

dotenv.config();

async function testGeminiAPI() {
  console.log('🔍 测试 Gemini API 功能...\n');

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY 未设置');
  }

  const genai = new GoogleGenerativeAI(apiKey);

  // 测试 1: 基础对话
  console.log('✓ 测试 1: 基础对话');
  const model = genai.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
  const result = await model.generateContent('Say "Hello World"');
  console.log('  响应:', result.response.text());
  console.log('  ✅ 基础对话成功\n');

  // 测试 2: 流式响应
  console.log('✓ 测试 2: 流式响应');
  const streamResult = await model.generateContentStream('Count from 1 to 5');
  for await (const chunk of streamResult.stream) {
    const text = chunk.text();
    if (text) {
      process.stdout.write(text);
    }
  }
  console.log('\n  ✅ 流式响应成功\n');

  // 测试 3: 函数调用
  console.log('✓ 测试 3: 函数调用');
  const functionModel = genai.getGenerativeModel({
    model: 'gemini-2.0-flash-exp',
    tools: [{
      functionDeclarations: [{
        name: 'test_function',
        description: 'A test function',
        parameters: {
          type: 'object',
          properties: {
            message: { type: 'string' }
          },
          required: ['message']
        }
      }]
    }]
  });

  const functionResult = await functionModel.generateContent(
    'Call test_function with message "Hello"'
  );

  const call = functionResult.response.functionCalls?.()?.[0];
  console.log('  函数调用:', call?.name, call?.args);
  console.log('  ✅ 函数调用成功\n');

  // 测试 4: Token 计数
  console.log('✓ 测试 4: Token 计数');
  const tokenResult = await model.countTokens('This is a test message');
  console.log('  Token 数量:', tokenResult.totalTokens);
  console.log('  ✅ Token 计数成功\n');

  console.log('🎉 所有 Gemini API 测试通过！\n');
}

testGeminiAPI().catch(console.error);
```

运行测试:

```bash
GEMINI_API_KEY=your_key_here pnpm tsx scripts/verify-gemini-api.ts
```

#### Day 2: Docker + WebSocket + MinIO 验证

**步骤 2.1: Docker 容器隔离验证** (2 小时)

创建 `scripts/verify-docker.ts`:

```typescript
import Docker from 'dockerode';

async function verifyDocker() {
  console.log('🔍 验证 Docker 容器隔离方案...\n');

  const docker = new Docker();

  try {
    // 1. 检查 Docker 连接
    console.log('✓ 步骤 1: 检查 Docker 连接...');
    const info = await docker.info();
    console.log(`  Docker 版本: ${info.ServerVersion}`);
    console.log(`  ✅ Docker 连接成功\n`);

    // 2. 创建测试容器
    console.log('✓ 步骤 2: 创建测试容器...');
    const container = await docker.createContainer({
      Image: 'node:20-alpine',
      Cmd: ['node', '-e', 'console.log("Hello from container")'],
      name: 'test-sandbox',
      HostConfig: {
        Memory: 256 * 1024 * 1024, // 256MB
        NanoCpus: 500000000, // 0.5 CPU
        NetworkMode: 'none', // 网络隔离
      },
    });
    console.log(`  容器 ID: ${container.id}`);
    console.log('  ✅ 容器创建成功\n');

    // 3. 启动容器
    console.log('✓ 步骤 3: 启动容器...');
    await container.start();
    console.log('  ✅ 容器启动成功\n');

    // 4. 执行命令
    console.log('✓ 步骤 4: 在容器中执行命令...');
    const exec = await container.exec({
      Cmd: ['echo', 'Hello from exec'],
      AttachStdout: true,
      AttachStderr: true,
    });

    const stream = await exec.start({});
    stream.on('data', (chunk) => {
      console.log(`  输出: ${chunk.toString()}`);
    });

    await new Promise((resolve) => stream.on('end', resolve));
    console.log('  ✅ 命令执行成功\n');

    // 5. 获取容器状态
    console.log('✓ 步骤 5: 获取容器状态...');
    const stats = await container.stats({ stream: false });
    console.log(`  内存使用: ${(stats.memory_stats.usage / 1024 / 1024).toFixed(2)} MB`);
    console.log('  ✅ 状态获取成功\n');

    // 6. 清理
    console.log('✓ 步骤 6: 清理容器...');
    await container.stop();
    await container.remove();
    console.log('  ✅ 容器清理成功\n');

    console.log('🎉 Docker 隔离验证通过！\n');

    return true;
  } catch (error) {
    console.error('❌ Docker 验证失败:', error);
    return false;
  }
}

verifyDocker();
```

安装依赖并运行:

```bash
pnpm add -D dockerode @types/dockerode
pnpm tsx scripts/verify-docker.ts
```

**步骤 2.2: WebSocket 实时通信验证** (2 小时)

创建 `scripts/verify-websocket-server.ts`:

```typescript
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';

const httpServer = createServer();
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: '*',
  },
});

io.on('connection', (socket) => {
  console.log('✅ 客户端已连接:', socket.id);

  socket.on('message', (data) => {
    console.log('📨 收到消息:', data);

    // 模拟流式响应
    const response = 'This is a streaming response...';
    let index = 0;

    const interval = setInterval(() => {
      if (index < response.length) {
        socket.emit('chunk', response[index]);
        index++;
      } else {
        clearInterval(interval);
        socket.emit('done');
      }
    }, 100);
  });

  socket.on('disconnect', () => {
    console.log('❌ 客户端断开:', socket.id);
  });
});

const PORT = 3001;
httpServer.listen(PORT, () => {
  console.log(`🚀 WebSocket 服务器运行在 http://localhost:${PORT}`);
  console.log('等待客户端连接...\n');
});
```

创建 `scripts/verify-websocket-client.ts`:

```typescript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3001');

socket.on('connect', () => {
  console.log('✅ 已连接到服务器\n');

  console.log('📤 发送消息...');
  socket.emit('message', 'Hello Server!');
});

socket.on('chunk', (data) => {
  process.stdout.write(data);
});

socket.on('done', () => {
  console.log('\n\n✅ 流式响应完成');
  socket.disconnect();
  process.exit(0);
});

socket.on('disconnect', () => {
  console.log('❌ 断开连接');
});
```

运行测试:

```bash
# 终端 1: 启动服务器
pnpm add -D socket.io socket.io-client
pnpm tsx scripts/verify-websocket-server.ts

# 终端 2: 运行客户端
pnpm tsx scripts/verify-websocket-client.ts
```

**步骤 2.3: MinIO 文件存储验证** (2 小时)

创建 `scripts/verify-minio.ts`:

```typescript
import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { Readable } from 'stream';

async function verifyMinIO() {
  console.log('🔍 验证 MinIO 文件存储...\n');

  const s3Client = new S3Client({
    endpoint: 'http://localhost:9000',
    region: 'us-east-1',
    credentials: {
      accessKeyId: 'minioadmin',
      secretAccessKey: 'minioadmin',
    },
    forcePathStyle: true,
  });

  const bucketName = 'test-workspace';
  const testFile = 'test.txt';
  const testContent = 'Hello from MinIO!';

  try {
    // 1. 上传文件
    console.log('✓ 步骤 1: 上传文件...');
    await s3Client.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: testFile,
      Body: testContent,
    }));
    console.log(`  ✅ 文件上传成功: ${testFile}\n`);

    // 2. 下载文件
    console.log('✓ 步骤 2: 下载文件...');
    const getResult = await s3Client.send(new GetObjectCommand({
      Bucket: bucketName,
      Key: testFile,
    }));

    const content = await streamToString(getResult.Body as Readable);
    console.log(`  内容: ${content}`);
    console.log('  ✅ 文件下载成功\n');

    // 3. 列出文件
    console.log('✓ 步骤 3: 列出文件...');
    const listResult = await s3Client.send(new ListObjectsV2Command({
      Bucket: bucketName,
    }));

    console.log(`  文件数量: ${listResult.Contents?.length || 0}`);
    listResult.Contents?.forEach(obj => {
      console.log(`  - ${obj.Key} (${obj.Size} bytes)`);
    });
    console.log('  ✅ 文件列表获取成功\n');

    console.log('🎉 MinIO 验证通过！\n');

    return true;
  } catch (error) {
    console.error('❌ MinIO 验证失败:', error);
    return false;
  }
}

async function streamToString(stream: Readable): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf-8');
}

verifyMinIO();
```

运行测试:

```bash
pnpm add -D @aws-sdk/client-s3
# 确保 MinIO 在运行
docker run -d -p 9000:9000 -p 9001:9001 \
  --name minio \
  -e "MINIO_ROOT_USER=minioadmin" \
  -e "MINIO_ROOT_PASSWORD=minioadmin" \
  minio/minio server /data --console-address ":9001"

# 运行验证
pnpm tsx scripts/verify-minio.ts
```

**验证清单**:

- [ ] `packages/core` 在服务器环境正常运行
- [ ] Gemini API 调用成功（基础对话、流式、函数调用）
- [ ] Docker 容器创建、执行、隔离验证通过
- [ ] WebSocket 实时通信正常
- [ ] MinIO 文件上传/下载/列表功能正常
- [ ] 生成技术验证报告文档

---

## 🏗️ 任务 0.3: 基础设施搭建 (2 天)

### 目标
搭建完整的本地开发环境，包括数据库、缓存、对象存储和沙箱镜像。

### 详细步骤

#### Day 1: Docker Compose 开发环境

**步骤 1.1: 创建 Docker Compose 配置** (2 小时)

创建 `infrastructure/docker/docker-compose.yml`:

```yaml
version: '3.9'

services:
  # PostgreSQL 数据库
  postgres:
    image: postgres:16-alpine
    container_name: gemini-web-postgres
    restart: unless-stopped
    environment:
      POSTGRES_DB: gemini_web
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
      POSTGRES_HOST_AUTH_METHOD: trust
    ports:
      - '5432:5432'
    volumes:
      - postgres-data:/var/lib/postgresql/data
      - ./init-db.sql:/docker-entrypoint-initdb.d/init.sql
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U postgres']
      interval: 10s
      timeout: 5s
      retries: 5

  # Redis 缓存
  redis:
    image: redis:7-alpine
    container_name: gemini-web-redis
    restart: unless-stopped
    command: redis-server --appendonly yes
    ports:
      - '6379:6379'
    volumes:
      - redis-data:/data
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 10s
      timeout: 3s
      retries: 5

  # MinIO 对象存储
  minio:
    image: minio/minio:latest
    container_name: gemini-web-minio
    restart: unless-stopped
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    ports:
      - '9000:9000'
      - '9001:9001'
    volumes:
      - minio-data:/data
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:9000/minio/health/live']
      interval: 10s
      timeout: 3s
      retries: 5

  # MinIO 初始化（创建 bucket）
  minio-init:
    image: minio/mc:latest
    container_name: gemini-web-minio-init
    depends_on:
      minio:
        condition: service_healthy
    entrypoint: >
      /bin/sh -c "
      /usr/bin/mc alias set myminio http://minio:9000 minioadmin minioadmin;
      /usr/bin/mc mb myminio/gemini-workspaces --ignore-existing;
      /usr/bin/mc anonymous set download myminio/gemini-workspaces;
      exit 0;
      "

  # Adminer - 数据库管理工具（可选）
  adminer:
    image: adminer:latest
    container_name: gemini-web-adminer
    restart: unless-stopped
    ports:
      - '8080:8080'
    depends_on:
      - postgres

volumes:
  postgres-data:
  redis-data:
  minio-data:

networks:
  default:
    name: gemini-web-network
```

创建 `infrastructure/docker/init-db.sql`:

```sql
-- 初始化数据库
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 创建基础表结构（占位，后续会被 Prisma 管理）
DO $$
BEGIN
  RAISE NOTICE '数据库初始化完成';
END $$;
```

**步骤 1.2: 创建环境启动脚本** (1 小时)

创建 `scripts/setup-dev.sh`:

```bash
#!/bin/bash

set -e

echo "🚀 设置 Gemini Web Platform 开发环境"
echo "======================================"
echo ""

# 检查必要工具
echo "✓ 检查必要工具..."
command -v node >/dev/null 2>&1 || { echo "❌ Node.js 未安装"; exit 1; }
command -v pnpm >/dev/null 2>&1 || { echo "❌ pnpm 未安装"; exit 1; }
command -v docker >/dev/null 2>&1 || { echo "❌ Docker 未安装"; exit 1; }
echo "  ✅ 所有必要工具已安装"
echo ""

# 检查 Node.js 版本
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
  echo "❌ Node.js 版本过低，需要 >= 20.0.0"
  exit 1
fi
echo "  ✅ Node.js 版本: $(node -v)"
echo ""

# 创建 .env 文件
if [ ! -f .env ]; then
  echo "✓ 创建 .env 文件..."
  cp .env.example .env
  echo "  ✅ .env 文件已创建"
  echo "  ⚠️  请编辑 .env 文件，填入必要的配置（特别是 GEMINI_API_KEY）"
  echo ""
fi

# 安装依赖
echo "✓ 安装依赖..."
pnpm install
echo "  ✅ 依赖安装完成"
echo ""

# 启动 Docker 服务
echo "✓ 启动 Docker 服务..."
cd infrastructure/docker
docker-compose up -d
echo "  ✅ Docker 服务已启动"
echo ""

# 等待服务就绪
echo "✓ 等待服务就绪..."
sleep 5

# 检查服务健康状态
echo "  检查 PostgreSQL..."
docker exec gemini-web-postgres pg_isready -U postgres >/dev/null 2>&1 && echo "    ✅ PostgreSQL 就绪" || echo "    ❌ PostgreSQL 未就绪"

echo "  检查 Redis..."
docker exec gemini-web-redis redis-cli ping >/dev/null 2>&1 && echo "    ✅ Redis 就绪" || echo "    ❌ Redis 未就绪"

echo "  检查 MinIO..."
curl -sf http://localhost:9000/minio/health/live >/dev/null 2>&1 && echo "    ✅ MinIO 就绪" || echo "    ❌ MinIO 未就绪"
echo ""

# 运行数据库迁移（如果 Prisma 已配置）
if [ -f packages/backend/prisma/schema.prisma ]; then
  echo "✓ 运行数据库迁移..."
  cd ../../packages/backend
  pnpm prisma migrate dev --name init
  echo "  ✅ 数据库迁移完成"
  echo ""
fi

# 完成
echo "======================================"
echo "🎉 开发环境设置完成！"
echo ""
echo "服务访问地址:"
echo "  - PostgreSQL: localhost:5432"
echo "  - Redis: localhost:6379"
echo "  - MinIO API: http://localhost:9000"
echo "  - MinIO 控制台: http://localhost:9001 (minioadmin/minioadmin)"
echo "  - Adminer: http://localhost:8080"
echo ""
echo "下一步:"
echo "  1. 编辑 .env 文件，配置 GEMINI_API_KEY"
echo "  2. 运行 'pnpm dev:backend' 启动后端"
echo "  3. 运行 'pnpm dev:frontend' 启动前端"
echo ""
```

添加执行权限:

```bash
chmod +x scripts/setup-dev.sh
```

**步骤 1.3: 测试开发环境** (1 小时)

```bash
# 运行设置脚本
./scripts/setup-dev.sh

# 验证服务
docker ps
docker-compose -f infrastructure/docker/docker-compose.yml ps

# 测试数据库连接
docker exec -it gemini-web-postgres psql -U postgres -d gemini_web -c "SELECT version();"

# 测试 Redis
docker exec -it gemini-web-redis redis-cli ping

# 访问 MinIO 控制台
# 浏览器打开 http://localhost:9001
```

#### Day 2: 沙箱镜像 + 数据库配置

**步骤 2.1: 创建沙箱 Docker 镜像** (3 小时)

创建 `infrastructure/docker/Dockerfile.sandbox`:

```dockerfile
FROM ubuntu:22.04

# 设置非交互模式
ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=UTC

# 安装基础工具
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    git \
    vim \
    nano \
    ca-certificates \
    gnupg \
    && rm -rf /var/lib/apt/lists/*

# 安装 Node.js 20
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# 安装 Python 3
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    && rm -rf /var/lib/apt/lists/*

# 安装常用开发工具
RUN apt-get update && apt-get install -y \
    build-essential \
    gcc \
    g++ \
    make \
    && rm -rf /var/lib/apt/lists/*

# 创建沙箱用户（非 root）
RUN useradd -m -s /bin/bash -u 1000 sandbox

# 设置工作目录
WORKDIR /workspace

# 修改所有权
RUN chown -R sandbox:sandbox /workspace

# 切换到沙箱用户
USER sandbox

# 设置环境变量
ENV PATH="/home/sandbox/.local/bin:${PATH}"
ENV HOME="/home/sandbox"

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node --version || exit 1

# 默认命令：保持运行
CMD ["tail", "-f", "/dev/null"]
```

构建镜像:

```bash
cd infrastructure/docker
docker build -f Dockerfile.sandbox -t gemini-sandbox:latest .

# 测试镜像
docker run --rm gemini-sandbox:latest node --version
docker run --rm gemini-sandbox:latest python3 --version
```

创建 `scripts/build-sandbox.sh`:

```bash
#!/bin/bash

set -e

echo "🔨 构建沙箱镜像..."
cd infrastructure/docker
docker build -f Dockerfile.sandbox -t gemini-sandbox:latest .
echo "✅ 沙箱镜像构建完成"

# 测试镜像
echo ""
echo "🧪 测试镜像..."
docker run --rm gemini-sandbox:latest node --version
docker run --rm gemini-sandbox:latest python3 --version
docker run --rm gemini-sandbox:latest npm --version
echo "✅ 镜像测试通过"
```

**步骤 2.2: 配置 Prisma ORM** (2 小时)

在 `packages/backend` 中安装 Prisma:

```bash
cd packages/backend
pnpm add -D prisma
pnpm add @prisma/client
pnpm prisma init
```

创建 `packages/backend/prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// 用户表
model User {
  id            String   @id @default(uuid())
  email         String   @unique
  username      String   @unique
  passwordHash  String?  @map("password_hash")
  oauthProvider String?  @map("oauth_provider")
  oauthId       String?  @map("oauth_id")
  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt @map("updated_at")

  workspaces    Workspace[]
  chatSessions  ChatSession[]

  @@map("users")
}

// 工作区表
model Workspace {
  id          String   @id @default(uuid())
  userId      String   @map("user_id")
  name        String
  description String?
  containerId String?  @map("container_id")
  storagePath String?  @map("storage_path")
  status      String   @default("active")
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  user         User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  chatSessions ChatSession[]

  @@map("workspaces")
}

// 聊天会话表
model ChatSession {
  id          String   @id @default(uuid())
  workspaceId String   @map("workspace_id")
  userId      String   @map("user_id")
  title       String?
  model       String   @default("gemini-2.0-flash-exp")
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  workspace Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  messages  Message[]
  toolExecutions ToolExecution[]

  @@map("chat_sessions")
}

// 消息表
model Message {
  id        String   @id @default(uuid())
  sessionId String   @map("session_id")
  role      String   // user, model, tool
  content   Json
  metadata  Json?
  createdAt DateTime @default(now()) @map("created_at")

  session ChatSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  @@map("messages")
}

// 工具执行记录表
model ToolExecution {
  id         String   @id @default(uuid())
  sessionId  String   @map("session_id")
  toolName   String   @map("tool_name")
  params     Json
  result     Json?
  status     String   @default("pending") // pending, executing, success, error
  durationMs Int?     @map("duration_ms")
  createdAt  DateTime @default(now()) @map("created_at")

  session ChatSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  @@map("tool_executions")
}
```

运行迁移:

```bash
# 确保数据库正在运行
docker-compose -f infrastructure/docker/docker-compose.yml up -d postgres

# 运行迁移
DATABASE_URL="postgresql://postgres:password@localhost:5432/gemini_web" \
  pnpm prisma migrate dev --name init

# 生成 Prisma Client
pnpm prisma generate
```

**步骤 2.3: 设置日志系统** (1 小时)

创建 `packages/backend/src/utils/logger.ts`:

```typescript
import winston from 'winston';

const { combine, timestamp, printf, colorize, errors } = winston.format;

// 自定义日志格式
const logFormat = printf(({ level, message, timestamp, stack, ...meta }) => {
  let log = `${timestamp} [${level}]: ${message}`;

  if (Object.keys(meta).length > 0) {
    log += ` ${JSON.stringify(meta)}`;
  }

  if (stack) {
    log += `\n${stack}`;
  }

  return log;
});

// 创建 logger
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(
    errors({ stack: true }),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    logFormat
  ),
  transports: [
    // 控制台输出
    new winston.transports.Console({
      format: combine(
        colorize(),
        logFormat
      ),
    }),
    // 文件输出
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
    }),
    new winston.transports.File({
      filename: 'logs/combined.log',
    }),
  ],
});

// 开发环境额外配置
if (process.env.NODE_ENV === 'development') {
  logger.level = 'debug';
}

export default logger;
```

安装依赖:

```bash
cd packages/backend
pnpm add winston
pnpm add -D @types/winston
```

**验证清单**:

- [ ] Docker Compose 环境成功启动
- [ ] PostgreSQL 连接正常
- [ ] Redis 连接正常
- [ ] MinIO 访问正常且 bucket 已创建
- [ ] 沙箱镜像构建成功
- [ ] Prisma 迁移成功
- [ ] 日志系统正常工作
- [ ] 所有服务健康检查通过

---

## 👥 任务 0.4: 团队准备 (1 天)

### 目标
确保团队成员了解项目规范、工作流程和技术架构。

### 详细步骤

**步骤 1: 代码规范培训** (2 小时)

准备培训材料 `docs/CODE_STANDARDS.md`:

```markdown
# 代码规范

## TypeScript 规范

### 命名规范

- 文件名: kebab-case (`user-service.ts`)
- 类名: PascalCase (`UserService`)
- 接口名: PascalCase (`IUserService` 或 `UserServiceInterface`)
- 函数名: camelCase (`getUserById`)
- 常量: UPPER_SNAKE_CASE (`MAX_RETRIES`)
- 类型别名: PascalCase (`UserData`)

### 类型使用

```typescript
// ✅ 好的做法
interface User {
  id: string;
  name: string;
}

function getUser(id: string): Promise<User> {
  // ...
}

// ❌ 避免使用 any
function processData(data: any) {  // 不推荐
  // ...
}
```

### 错误处理

```typescript
// ✅ 使用自定义错误类
class UserNotFoundError extends Error {
  constructor(userId: string) {
    super(`User ${userId} not found`);
    this.name = 'UserNotFoundError';
  }
}

// ✅ 明确的错误处理
async function getUser(id: string): Promise<User> {
  const user = await db.user.findUnique({ where: { id } });
  if (!user) {
    throw new UserNotFoundError(id);
  }
  return user;
}
```

## Git 规范

见 DEVELOPMENT.md 中的提交规范。

## 代码审查清单

- [ ] 代码符合 ESLint 规则
- [ ] 所有函数有明确的类型定义
- [ ] 复杂逻辑有注释说明
- [ ] 新功能有对应的测试
- [ ] 没有 console.log（使用 logger）
- [ ] 没有未处理的 Promise
- [ ] 敏感信息不在代码中（使用环境变量）
```

**步骤 2: Git 工作流培训** (1.5 小时)

准备培训材料 `docs/GIT_WORKFLOW.md`:

```markdown
# Git 工作流程

## 分支策略

```
main (生产)
  ↑
develop (开发)
  ↑
feature/xxx (功能)
bugfix/xxx (修复)
```

## 开发流程

### 1. 开始新功能

```bash
# 确保 develop 是最新的
git checkout develop
git pull origin develop

# 创建功能分支
git checkout -b feature/user-authentication

# 开发...
git add .
git commit -m "feat(auth): add user login endpoint"
```

### 2. 保持同步

```bash
# 定期同步 develop 的更新
git checkout develop
git pull origin develop
git checkout feature/user-authentication
git rebase develop
```

### 3. 提交 PR

```bash
# 推送分支
git push origin feature/user-authentication

# 在 GitHub/GitLab 创建 Pull Request
# 目标分支: develop
```

### 4. 代码审查

- 至少 1 人审查
- 所有评论需解决
- CI 检查通过
- 无冲突

### 5. 合并

- 使用 Squash and Merge
- 删除功能分支

## 提交信息规范

格式: `<type>(<scope>): <subject>`

### Type
- feat: 新功能
- fix: 修复
- docs: 文档
- style: 格式
- refactor: 重构
- test: 测试
- chore: 构建/工具

### Examples
```
feat(auth): add JWT token validation
fix(chat): resolve message ordering issue
docs(api): update authentication endpoints
refactor(workspace): extract container service
```
```

**步骤 3: 架构设计评审** (2.5 小时)

准备评审会议:

1. **准备材料**:
   - BS_MIGRATION_PLAN.md
   - 架构图（可用 draw.io 或 Excalidraw）
   - 技术验证结果

2. **评审议程** (2.5 小时):
   - 项目背景和目标 (15 分钟)
   - 整体架构讲解 (30 分钟)
   - 技术栈选型讨论 (30 分钟)
   - 关键技术点验证结果 (20 分钟)
   - 开发计划和时间线 (20 分钟)
   - Q&A 和讨论 (30 分钟)
   - 总结和下一步 (5 分钟)

3. **输出文档**:
   - 会议纪要
   - 决策记录
   - 待解决问题清单

**步骤 4: 开发环境验收** (2 小时)

每位团队成员完成:

```bash
# 1. 克隆仓库
git clone https://github.com/your-org/gemini-web-platform.git
cd gemini-web-platform

# 2. 运行设置脚本
./scripts/setup-dev.sh

# 3. 配置 .env
# 编辑 .env，填入 GEMINI_API_KEY

# 4. 运行验证脚本
pnpm tsx scripts/verify-core.ts
pnpm tsx scripts/verify-gemini-api.ts
pnpm tsx scripts/verify-docker.ts

# 5. 启动开发服务器
pnpm dev:backend  # 终端 1
pnpm dev:frontend  # 终端 2

# 6. 访问应用
# http://localhost:5173
```

验收清单:

- [ ] 成功克隆仓库
- [ ] 所有依赖安装成功
- [ ] Docker 服务正常运行
- [ ] 数据库迁移成功
- [ ] 所有验证脚本通过
- [ ] 开发服务器启动成功
- [ ] 能够访问前端和后端
- [ ] VS Code 扩展推荐已安装
- [ ] ESLint 和 Prettier 正常工作

---

## ✅ 阶段 0 交付物清单

### 1. 项目仓库

- [x] Git 仓库已创建
- [x] Monorepo 结构完整
- [x] 所有配置文件就绪
- [x] CI/CD 流水线配置完成

### 2. 技术验证报告

创建 `docs/PHASE_0_VERIFICATION_REPORT.md`:

```markdown
# 阶段 0 技术验证报告

## 验证日期
2025-XX-XX

## 验证人员
- 张三（后端）
- 李四（后端）
- 王五（DevOps）

## 验证结果

### 1. Core 包集成
- ✅ 在 Node.js 服务器环境正常运行
- ✅ GeminiClient 初始化成功
- ✅ 简单对话测试通过
- ✅ 工具系统可用

### 2. Gemini API
- ✅ 基础对话功能正常
- ✅ 流式响应正常
- ✅ 函数调用功能正常
- ✅ Token 计数功能正常

### 3. Docker 容器
- ✅ 容器创建成功
- ✅ 命令执行正常
- ✅ 资源限制生效
- ✅ 网络隔离有效

### 4. WebSocket
- ✅ 连接建立成功
- ✅ 消息收发正常
- ✅ 流式数据传输正常
- ✅ 断线重连机制有效

### 5. MinIO
- ✅ 文件上传成功
- ✅ 文件下载成功
- ✅ 文件列表功能正常

## 遇到的问题

### 问题 1: Core 包依赖冲突
- 描述: xxx
- 解决方案: xxx

### 问题 2: Docker 网络配置
- 描述: xxx
- 解决方案: xxx

## 性能基准

- Gemini API 响应时间: ~500ms
- Docker 容器启动时间: ~2s
- WebSocket 延迟: <50ms
- MinIO 文件上传速度: ~10MB/s

## 建议

1. xxx
2. xxx

## 结论

所有核心技术栈验证通过，可以进入阶段 1 开发。
```

### 3. 开发环境文档

- [x] DEVELOPMENT.md - 完整的开发指南
- [x] CODE_STANDARDS.md - 代码规范
- [x] GIT_WORKFLOW.md - Git 工作流
- [x] 环境变量模板 (.env.example)

### 4. 基础设施

- [x] Docker Compose 配置
- [x] 沙箱镜像 Dockerfile
- [x] 数据库 Schema (Prisma)
- [x] 日志系统配置

### 5. 自动化脚本

- [x] setup-dev.sh - 开发环境设置
- [x] verify-core.ts - Core 包验证
- [x] verify-gemini-api.ts - API 验证
- [x] verify-docker.ts - Docker 验证
- [x] verify-websocket-*.ts - WebSocket 验证
- [x] verify-minio.ts - MinIO 验证
- [x] build-sandbox.sh - 沙箱镜像构建

---

## 🎯 成功标准

阶段 0 完成的标准:

1. **环境就绪** ✅
   - 所有团队成员开发环境配置完成
   - Docker 服务正常运行
   - 数据库、Redis、MinIO 可访问

2. **技术验证** ✅
   - 所有验证脚本通过
   - 技术验证报告完成
   - 关键技术风险已识别和缓解

3. **团队准备** ✅
   - 所有成员完成代码规范培训
   - Git 工作流达成一致
   - 架构设计评审完成

4. **文档完整** ✅
   - 开发文档完整
   - 验证报告完成
   - 待办问题清单建立

---

## 📅 时间检查点

| 时间 | 检查项 | 负责人 |
|------|--------|--------|
| Day 1 结束 | 项目初始化完成 | 架构师 |
| Day 2 结束 | TypeScript/ESLint 配置完成 | 架构师 |
| Day 3 结束 | Core 包验证完成 | 后端工程师 |
| Day 4 结束 | Docker/WebSocket/MinIO 验证完成 | 后端工程师 + DevOps |
| Day 5 结束 | 团队培训和验收完成 | 全员 |

---

## 🚨 风险和注意事项

### 常见问题

1. **Docker 端口冲突**
   - 解决: 修改 docker-compose.yml 中的端口映射

2. **pnpm install 失败**
   - 解决: 清理缓存 `pnpm store prune && rm -rf node_modules`

3. **Prisma 迁移失败**
   - 解决: 检查数据库连接，确保 DATABASE_URL 正确

4. **沙箱镜像构建慢**
   - 解决: 使用镜像加速器，或预先下载基础镜像

### 预防措施

- 每天进行代码备份
- 定期同步远程仓库
- 保持环境配置文档更新
- 记录遇到的问题和解决方案

---

## 下一步：进入阶段 1

完成阶段 0 后，团队应该:

1. 召开阶段 1 启动会
2. 分配任务和负责人
3. 建立每日站会机制
4. 设置进度跟踪看板

准备好开始阶段 1 的开发工作！🚀
