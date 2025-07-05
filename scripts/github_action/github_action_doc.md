# GitHub Actions 完整指南与最佳实践 SOP

## 目录
1. [概述](#概述)
2. [核心概念](#核心概念)
3. [工作流架构设计](#工作流架构设计)
4. [安全性最佳实践](#安全性最佳实践)
5. [成本优化策略](#成本优化策略)
6. [性能效率优化](#性能效率优化)
7. [可重用性与扩展性](#可重用性与扩展性)
8. [开发工具与调试](#开发工具与调试)
9. [故障排除](#故障排除)
10. [SOP 标准操作流程](#sop-标准操作流程)

---

## 概述

GitHub Actions 是一个强大的 CI/CD 平台，允许您自动化软件工作流程。本指南基于 GitHub Actions Well-Architected Framework 的五大支柱：可靠性、安全性、成本优化、运营卓越性和性能效率。

### 核心优势
- **自动化**：从代码提交到部署的全流程自动化
- **可扩展性**：支持从简单测试到复杂部署的各种场景
- **集成性**：与 GitHub 生态系统深度集成
- **灵活性**：支持多种编程语言和平台

---

## 核心概念

### 1. 工作流 (Workflow)
- **定义**：`.github/workflows/` 目录下的 YAML 文件
- **触发**：基于事件（push、pull_request、schedule 等）
- **组成**：一个或多个作业 (Jobs)

### 2. 作业 (Job)
- **定义**：工作流中的执行单元
- **运行环境**：在指定的运行器 (Runner) 上执行
- **依赖关系**：可以设置作业间的依赖关系

### 3. 步骤 (Step)
- **定义**：作业中的具体执行步骤
- **类型**：Shell 命令、Action 调用
- **顺序**：按定义顺序执行

### 4. Action
- **定义**：可重用的工作流单元
- **类型**：官方 Action、社区 Action、自定义 Action
- **版本控制**：建议使用特定版本号

---

## 工作流架构设计

### 基础工作流模板

```yaml
name: 基础 CI/CD 工作流

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

env:
  NODE_VERSION: '18'

jobs:
  build-and-test:
    runs-on: ubuntu-latest
    
    steps:
    - name: 检出代码
      uses: actions/checkout@v4
      
    - name: 设置 Node.js
      uses: actions/setup-node@v4
      with:
        node-version: ${{ env.NODE_VERSION }}
        cache: 'npm'
        
    - name: 安装依赖
      run: npm ci
      
    - name: 运行测试
      run: npm test
      
    - name: 构建项目
      run: npm run build
```

### 高级工作流特性

#### 1. 矩阵策略 (Matrix Strategy)
```yaml
jobs:
  test:
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
        node-version: [16, 18, 20]
    runs-on: ${{ matrix.os }}
    steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: ${{ matrix.node-version }}
```

#### 2. 条件执行
```yaml
- name: 条件部署
  if: github.ref == 'refs/heads/main'
  run: npm run deploy
```

#### 3. 并发控制
```yaml
concurrency:
  group: ${{ github.ref }}
  cancel-in-progress: true
```

---

## 安全性最佳实践

### 1. 密钥管理
- **存储位置**：使用 GitHub Secrets 存储敏感信息
- **访问控制**：按需分配密钥权限
- **轮换策略**：定期更新密钥

### 2. 权限最小化
```yaml
permissions:
  contents: read
  pull-requests: write
  issues: write
```

### 3. 依赖安全
```yaml
- name: 安全扫描
  uses: actions/dependency-review-action@v3
  with:
    fail-on-severity: high
```

### 4. 代码签名
```yaml
- name: 签名发布
  uses: actions/setup-node@v4
  with:
    registry-url: 'https://npm.pkg.github.com'
    scope: '@your-org'
```

---

## 成本优化策略

### 1. 缓存策略
```yaml
- name: 缓存依赖
  uses: actions/cache@v3
  with:
    path: |
      ~/.npm
      node_modules
      */*/node_modules
    key: ${{ runner.os }}-node-${{ hashFiles('**/package-lock.json') }}
    restore-keys: |
      ${{ runner.os }}-node-
```

### 2. 超时设置
```yaml
jobs:
  build:
    timeout-minutes: 10
    steps:
    - name: 长时间运行的任务
      timeout-minutes: 5
      run: npm run build
```

### 3. 条件触发
```yaml
on:
  push:
    paths:
      - 'src/**'
      - 'package.json'
      - 'package-lock.json'
```

### 4. 自托管运行器
- **优势**：降低成本，提高安全性
- **配置**：在私有环境中部署运行器
- **管理**：使用标签组织运行器

---

## 性能效率优化

### 1. 并行执行
```yaml
jobs:
  lint:
    runs-on: ubuntu-latest
    steps: # lint 步骤
    
  test:
    runs-on: ubuntu-latest
    steps: # 测试步骤
    
  build:
    needs: [lint, test]
    runs-on: ubuntu-latest
    steps: # 构建步骤
```

### 2. 增量构建
```yaml
- name: 检查变更文件
  uses: dorny/paths-filter@v2
  id: changes
  with:
    filters: |
      src:
        - 'src/**'
      docs:
        - 'docs/**'
```

### 3. 分层缓存
```yaml
- name: 缓存构建产物
  uses: actions/cache@v3
  with:
    path: dist/
    key: ${{ runner.os }}-build-${{ github.sha }}
```

---

## 可重用性与扩展性

### 1. 可重用工作流
```yaml
# .github/workflows/reusable-build.yml
name: 可重用构建工作流

on:
  workflow_call:
    inputs:
      node-version:
        required: false
        type: string
        default: '18'

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: ${{ inputs.node-version }}
```

### 2. 复合 Action
```yaml
# .github/actions/setup-env/action.yml
name: '设置环境'
description: '设置开发环境'

inputs:
  node-version:
    description: 'Node.js 版本'
    required: false
    default: '18'

runs:
  using: composite
  steps:
  - uses: actions/setup-node@v4
    with:
      node-version: ${{ inputs.node-version }}
```

### 3. 组织级共享
- **Starter Workflows**：为组织提供标准工作流模板
- **Repository Templates**：包含预配置工作流的仓库模板
- **Dependabot**：自动更新 Action 版本

---

## 开发工具与调试

### 1. VS Code 扩展
- **GitHub Actions**：语法高亮、自动完成、验证
- **YAML**：YAML 文件支持
- **GitHub Pull Requests**：PR 管理

### 2. 本地测试
```bash
# 使用 Act 进行本地测试
npm install -g act
act -j build
```

### 3. 调试技巧
```yaml
- name: 调试信息
  run: |
    echo "GitHub Context:"
    echo "Event: ${{ github.event_name }}"
    echo "Ref: ${{ github.ref }}"
    echo "SHA: ${{ github.sha }}"
```

---

## 故障排除

### 常见问题及解决方案

#### 1. 工作流未触发
- **检查**：`.github/workflows/` 目录结构
- **验证**：YAML 语法正确性
- **确认**：触发条件配置

#### 2. 密钥访问失败
- **检查**：密钥名称拼写
- **验证**：密钥作用域设置
- **确认**：工作流权限配置

#### 3. 依赖安装失败
- **检查**：网络连接
- **验证**：依赖版本兼容性
- **使用**：缓存机制

#### 4. 超时问题
- **优化**：并行执行
- **设置**：合理超时时间
- **监控**：资源使用情况

---

## SOP 标准操作流程

### 阶段一：项目初始化

#### 1.1 创建工作流目录
```bash
mkdir -p .github/workflows
```

#### 1.2 配置基础工作流
- 创建 `ci.yml` 用于持续集成
- 创建 `cd.yml` 用于持续部署
- 配置适当的触发条件

#### 1.3 设置密钥
- 在仓库设置中添加必要的 Secrets
- 配置环境变量
- 设置访问权限

### 阶段二：开发阶段

#### 2.1 代码提交
- 遵循 Git 工作流
- 确保代码质量检查通过
- 触发自动化测试

#### 2.2 测试验证
- 单元测试
- 集成测试
- 安全扫描

#### 2.3 代码审查
- 创建 Pull Request
- 配置必要的检查
- 等待审查通过

### 阶段三：部署阶段

#### 3.1 预部署检查
- 验证所有测试通过
- 确认安全扫描无问题
- 检查部署权限

#### 3.2 部署执行
- 自动部署到测试环境
- 运行冒烟测试
- 部署到生产环境

#### 3.3 部署后验证
- 健康检查
- 功能验证
- 监控告警

### 阶段四：维护阶段

#### 4.1 监控
- 工作流执行状态
- 性能指标
- 错误日志

#### 4.2 优化
- 分析执行时间
- 优化缓存策略
- 更新依赖版本

#### 4.3 文档更新
- 更新工作流文档
- 记录最佳实践
- 分享经验教训

---

## 最佳实践检查清单

### 安全性
- [ ] 使用最小权限原则
- [ ] 定期轮换密钥
- [ ] 启用依赖扫描
- [ ] 配置代码签名

### 性能
- [ ] 实现缓存策略
- [ ] 设置合理超时
- [ ] 使用并行执行
- [ ] 优化构建时间

### 可维护性
- [ ] 使用可重用工作流
- [ ] 版本化 Action 引用
- [ ] 添加详细注释
- [ ] 定期更新依赖

### 监控
- [ ] 配置执行通知
- [ ] 设置失败告警
- [ ] 监控资源使用
- [ ] 跟踪执行时间

---

## 总结

本指南提供了 GitHub Actions 的全面最佳实践和标准操作流程。通过遵循这些指导原则，您可以：

1. **提高安全性**：通过最小权限和密钥管理
2. **优化成本**：通过缓存和超时控制
3. **提升性能**：通过并行执行和增量构建
4. **增强可维护性**：通过可重用组件和版本控制
5. **确保可靠性**：通过监控和故障排除

记住，GitHub Actions 是一个持续演进的技术，建议定期关注官方文档和社区最佳实践，以保持工作流的现代化和高效性。

---

## 参考资源

- [GitHub Actions 官方文档](https://docs.github.com/en/actions)
- [GitHub Actions Well-Architected Framework](https://github.com/austenstone/github-actions-best-practices)
- [GitHub Secrets 和 Actions 指南](https://github.com/tsmith4014/github-secrets-actions-workflows)
- [GitHub Actions 市场](https://github.com/marketplace?type=actions)
