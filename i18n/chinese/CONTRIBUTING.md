🌐 [查看英文版](../../CONTRIBUTING.md)

# 如何贡献

我们非常乐意接受您对此项目的补丁和贡献。

## 在您开始之前

### 签署我们的贡献者许可协议

对此项目的贡献必须附有[贡献者许可协议](https://cla.developers.google.com/about) (CLA)。您（或您的雇主）保留您贡献的版权；这只是授予我们作为项目一部分使用和重新分发您的贡献的许可。

如果您或您当前的雇主已经签署了 Google CLA（即使是针对其他项目），您可能不需要再次签署。

访问 <https://cla.developers.google.com/> 查看您当前的协议或签署新协议。

### 查看我们的社区准则

此项目遵循 [Google 的开源社区准则](https://opensource.google/conduct/)。

## 贡献流程

### 代码审查

所有提交，包括项目成员的提交，都需要审查。我们为此使用 [GitHub 拉取请求](https://docs.github.com/articles/about-pull-requests)。

### 拉取请求指南

为了帮助我们快速审查和合并您的 PR，请遵循以下指南。不符合这些标准的 PR 可能会被关闭。

#### 1. 链接到现有问题

所有 PR 都应链接到我们跟踪器中的现有问题。这可确保在编写任何代码之前，每项更改都经过讨论并与项目目标保持一致。

- **对于错误修复：** PR 应链接到错误报告问题。
- **对于功能：** PR 应链接到已由维护人员批准的功能请求或提案问题。

如果您的更改问题不存在，请**先打开一个**并等待反馈，然后再开始编码。

#### 2. 保持小而专注

我们倾向于解决单个问题或添加单个独立功能的小型原子 PR。

- **要做：** 创建一个修复一个特定错误或添加一个特定功能的 PR。
- **不要做：** 将多个不相关的更改（例如，错误修复、新功能和重构）捆绑到一个 PR 中。

大型更改应分解为一系列可以独立审查和合并的较小的逻辑 PR。

#### 3. 对正在进行的工作使用草稿 PR

如果您想尽早获得有关您工作的反馈，请使用 GitHub 的**草稿拉取请求**功能。这向维护人员表明 PR 尚未准备好进行正式审查，但可以进行讨论和初步反馈。

#### 4. 确保所有检查都通过

在提交 PR 之前，请通过运行 `npm run preflight` 确保所有自动检查都通过。此命令会运行所有测试、linting 和其他样式检查。

#### 5. 更新文档

如果您的 PR 引入了面向用户的更改（例如，新命令、修改的标志或行为更改），您还必须更新 `/docs` 目录中的相关文档。

#### 6. 编写清晰的提交消息和良好的 PR 描述

您的 PR 应具有清晰、描述性的标题和更改的详细描述。遵循[约定式提交](https://www.conventionalcommits.org/)标准的提交消息。

- **好的 PR 标题：** `feat(cli): Add --json flag to 'config get' command`
- **不好的 PR 标题：** `Made some changes`

在 PR 描述中，解释您更改背后的“原因”并链接到相关问题（例如，`Fixes #123`）。

## 分叉

如果您分叉存储库，您将能够运行构建、测试和集成测试工作流。但是，为了使集成测试能够运行，您需要添加一个[GitHub 存储库机密](https://docs.github.com/en/actions/security-for-github-actions/security-guides/using-secrets-in-github-actions#creating-secrets-for-a-repository)，其值为 `GEMINI_API_KEY`，并将其设置为您可用的有效 API 密钥。您的密钥和机密对您的存储库是私有的；没有访问权限的任何人都无法看到您的密钥，您也无法看到与此存储库相关的任何机密。

此外，您需要单击 `Actions` 选项卡并为您的存储库启用工作流，您会发现它位于屏幕中央的大蓝色按钮。

## 开发设置和工作流

本节指导贡献者如何构建、修改和理解此项目的开发设置。

### 设置开发环境

**先决条件：**

1.  **Node.js**：
    - **开发：** 请使用 Node.js `~20.19.0`。由于上游开发依赖项问题，需要此特定版本。您可以使用 [nvm](https://github.com/nvm-sh/nvm) 等工具来管理 Node.js 版本。
    - **生产：** 对于在生产环境中运行 CLI，任何版本的 Node.js `>=20` 都是可以接受的。
2.  **Git**

### 构建过程

要克隆存储库：

```bash
git clone https://github.com/google-gemini/gemini-cli.git # 或您的分叉的 URL
cd gemini-cli
```

要安装 `package.json` 中定义的依赖项以及根依赖项：

```bash
npm install
```

要构建整个项目（所有包）：

```bash
npm run build
```

此命令通常会将 TypeScript 编译为 JavaScript，捆绑资产，并准备要执行的包。有关构建期间发生的情况的更多详细信息，请参阅 `scripts/build.js` 和 `package.json` 脚本。

### 启用沙盒

强烈建议使用[沙盒](#sandboxing)，并且至少需要在 `~/.env` 中设置 `GEMINI_SANDBOX=true` 并确保沙盒提供程序（例如 `macOS Seatbelt`、`docker` 或 `podman`）可用。有关详细信息，请参阅[沙盒](#sandboxing)。

要同时构建 `gemini` CLI 实用程序和沙盒容器，请从根目录运行 `build:all`：

```bash
npm run build:all
```

要跳过构建沙盒容器，您可以改用 `npm run build`。

### 运行

要从源代码启动 Gemini CLI（构建后），请从根目录运行以下命令：

```bash
npm start
```

如果您想在 gemini-cli 文件夹之外运行源代码构建，您可以使用 `npm link path/to/gemini-cli/packages/cli`（请参阅：[文档](https://docs.npmjs.com/cli/v9/commands/npm-link)）或 `alias gemini="node path/to/gemini-cli/packages/cli"` 以使用 `gemini` 运行

### 运行测试

此项目包含两种类型的测试：单元测试和集成测试。

#### 单元测试

要执行项目的单元测试套件：

```bash
npm run test
```

这将运行位于 `packages/core` 和 `packages/cli` 目录中的测试。在提交任何更改之前，请确保测试通过。为了进行更全面的检查，建议运行 `npm run preflight`。

#### 集成测试

集成测试旨在验证 Gemini CLI 的端到端功能。它们不作为默认 `npm run test` 命令的一部分运行。

要运行集成测试，请使用以下命令：

```bash
npm run test:e2e
```

有关集成测试框架的更多详细信息，请参阅[集成测试文档](./docs/integration-tests.md)。

### Linting 和 Preflight 检查

为确保代码质量和格式一致性，请运行 preflight 检查：

```bash
npm run preflight
```

此命令将运行 ESLint、Prettier、所有测试以及项目 `package.json` 中定义的其他检查。

_专业提示_

克隆后，创建一个 git precommit 钩子文件，以确保您的提交始终是干净的。

```bash
echo "
# 运行 npm build 并检查错误
if ! npm run preflight; then
  echo "npm build failed. Commit aborted."
  exit 1
fi
" > .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit
```

#### 格式化

要单独格式化此项目中的代码，请从根目录运行以下命令：

```bash
npm run format
```

此命令使用 Prettier 根据项目的样式指南格式化代码。

#### Linting

要单独 lint 此项目中的代码，请从根目录运行以下命令：

```bash
npm run lint
```

### 编码约定

- 请遵守整个现有代码库中使用的编码风格、模式和约定。
- 有关与 AI 辅助开发相关的特定说明，包括 React、注释和 Git 使用的约定，请参阅 [GEMINI.md](https://github.com/google-gemini/gemini-cli/blob/main/GEMINI.md)（通常位于项目根目录中）。
- **导入：** 请特别注意导入路径。该项目使用 ESLint 来强制执行包之间相对导入的限制。

### 项目结构

- `packages/`：包含项目的各个子包。
  - `cli/`：命令行界面。
  - `core/`：Gemini CLI 的核心后端逻辑。
- `docs/`：包含所有项目文档。
- `scripts/`：用于构建、测试和开发任务的实用程序脚本。

有关更详细的体系结构，请参阅 `docs/architecture.md`。

## 调试

### VS Code：

0.  使用 `F5` 在 VS Code 中以交互方式运行 CLI 进行调试
1.  从根目录以调试模式启动 CLI：
    ```bash
    npm run debug
    ```
    此命令在 `packages/cli` 目录中运行 `node --inspect-brk dist/gemini.js`，暂停执行直到调试器附加。然后，您可以在 Chrome 浏览器中打开 `chrome://inspect` 以连接到调试器。
2.  在 VS Code 中，使用“附加”启动配置（位于 `.vscode/launch.json` 中）。

或者，如果您希望直接启动当前打开的文件，则可以在 VS Code 中使用“启动程序”配置，但通常建议使用“F5”。

要在沙盒容器内设置断点，请运行：

```bash
DEBUG=1 gemini
```

### React DevTools

要调试 CLI 的基于 React 的 UI，您可以使用 React DevTools。用于 CLI 界面的库 Ink 与 React DevTools 4.x 版本兼容。

1.  **以开发模式启动 Gemini CLI：**

    ```bash
    DEV=true npm start
    ```

2.  **安装并运行 React DevTools 4.28.5 版本（或最新的兼容 4.x 版本）：**

    您可以全局安装它：

    ```bash
    npm install -g react-devtools@4.28.5
    react-devtools
    ```

    或者直接使用 npx 运行它：

    ```bash
    npx react-devtools@4.28.5
    ```

    然后，您正在运行的 CLI 应用程序应连接到 React DevTools。
    ![](/docs/assets/connected_devtools.png)

## 沙盒

### macOS Seatbelt

在 macOS 上，`gemini` 在 `permissive-open` 配置文件下使用 Seatbelt (`sandbox-exec`)（请参阅 `packages/cli/src/utils/sandbox-macos-permissive-open.sb`），该配置文件限制对项目文件夹的写入，但默认情况下允许所有其他操作和出站网络流量（“开放”）。您可以通过在环境或 `.env` 文件中设置 `SEATBELT_PROFILE=restrictive-closed` 来切换到 `restrictive-closed` 配置文件（请参阅 `packages/cli/src/utils/sandbox-macos-restrictive-closed.sb`），该配置文件默认拒绝所有操作和出站网络流量（“关闭”）。可用的内置配置文件为 `{permissive,restrictive}-{open,closed,proxied}`（有关代理网络，请参见下文）。如果您还在项目设置目录 `.gemini` 下创建文件 `.gemini/sandbox-macos-<profile>.sb`，则还可以切换到自定义配置文件 `SEATBELT_PROFILE=<profile>`。

### 基于容器的沙盒（所有平台）

对于 macOS 或其他平台上更强大的基于容器的沙盒，您可以在环境或 `.env` 文件中设置 `GEMINI_SANDBOX=true|docker|podman|<command>`。指定的命令（或者如果为 `true`，则为 `docker` 或 `podman`）必须安装在主机上。启用后，`npm run build:all` 将构建一个最小的容器（“沙盒”）映像，`npm start` 将在该容器的新实例中启动。第一次构建可能需要 20-30 秒（主要是由于下载基础映像），但之后构建和启动开销都应该很小。默认构建 (`npm run build`) 不会重建沙盒。

基于容器的沙盒以读写访问权限挂载项目目录（和系统临时目录），并在您启动/停止 Gemini CLI 时自动启动/停止/删除。在沙盒中创建的文件应自动映射到主机上的用户/组。您可以通过根据需要设置 `SANDBOX_{MOUNTS,PORTS,ENV}` 来轻松指定其他挂载、端口或环境变量。您还可以通过在项目设置目录 (`.gemini`) 下创建文件 `.gemini/sandbox.Dockerfile` 和/或 `.gemini/sandbox.bashrc` 并使用 `BUILD_SANDBOX=1` 运行 `gemini` 来完全自定义项目的沙盒，以触发构建您的自定义沙盒。

#### 代理网络

所有沙盒方法，包括使用 `*-proxied` 配置文件的 macOS Seatbelt，都支持通过自定义代理服务器限制出站网络流量，该代理服务器可以指定为 `GEMINI_SANDBOX_PROXY_COMMAND=<command>`，其中 `<command>` 必须启动一个侦听 `:::8877` 相关请求的代理服务器。有关仅允许与 `example.com:443` 建立 `HTTPS` 连接（例如 `curl https://example.com`）并拒绝所有其他请求的最小代理，请参阅 `../../docs/examples/proxy-script.md`。代理与沙盒一起自动启动和停止。

## 手动发布

我们将每次提交的工件发布到我们的内部注册表。但是，如果您需要手动剪切本地构建，请运行以下命令：

```
npm run clean
npm install
npm run auth
npm run prerelease:dev
npm publish --workspaces
```