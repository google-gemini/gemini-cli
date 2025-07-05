# 如何贡献

我们非常欢迎您为这个项目提供补丁和贡献。

## 开始之前

### 签署贡献者许可协议

对本项目的贡献必须附有[贡献者许可协议](https://cla.developers.google.com/about) (CLA)。
您（或您的雇主）保留对您贡献的版权；这只是给予我们使用和重新分发您贡献的权限，作为项目的一部分。

如果您或您当前的雇主已经签署了Google CLA（即使是为不同的项目），您可能不需要再次签署。

访问 <https://cla.developers.google.com/> 查看您当前的协议或签署新协议。

### 审查我们的社区准则

本项目遵循[Google开源社区准则](https://opensource.google/conduct/)。

## 贡献流程

### 代码审查

所有提交，包括项目成员的提交，都需要审查。我们使用[GitHub拉取请求](https://docs.github.com/articles/about-pull-requests)来实现这一目的。

### 拉取请求指南

为了帮助我们快速审查和合并您的PR，请遵循以下指南。不符合这些标准的PR可能会被关闭。

#### 1. 链接到现有问题

所有PR都应该链接到我们跟踪器中的现有问题。这确保每个更改在编写任何代码之前都经过讨论并与项目目标保持一致。

- **对于错误修复：** PR应该链接到错误报告问题。
- **对于功能：** PR应该链接到已获得维护者批准的功能请求或提案问题。

如果您的更改没有相应的问题，请**先创建一个**并在开始编码之前等待反馈。

#### 2. 保持小而专注

我们倾向于小的、原子性的PR，它们解决单个问题或添加单个、自包含的功能。

- **要做：** 创建一个修复特定错误或添加特定功能的PR。
- **不要做：** 将多个不相关的更改（例如，错误修复、新功能和重构）捆绑到一个PR中。

大型更改应该分解为一系列较小的、逻辑性的PR，可以独立审查和合并。

#### 3. 对工作进行中的内容使用草稿PR

如果您想获得工作的早期反馈，请使用GitHub的**草稿拉取请求**功能。这向维护者表明PR尚未准备好进行正式审查，但可以进行讨论和初步反馈。

#### 4. 确保所有检查通过

在提交PR之前，通过运行`npm run preflight`确保所有自动化检查都通过。此命令运行所有测试、代码检查和样式检查。

#### 5. 更新文档

如果您的PR引入了面向用户的更改（例如，新命令、修改的标志或行为更改），您还必须更新`/docs`目录中的相关文档。

#### 6. 编写清晰的提交消息和良好的PR描述

您的PR应该有清晰、描述性的标题和更改的详细描述。遵循[约定式提交](https://www.conventionalcommits.org/)标准来编写提交消息。

- **好的PR标题：** `feat(cli): 为'config get'命令添加--json标志`
- **不好的PR标题：** `做了一些更改`

在PR描述中，解释更改背后的"原因"并链接到相关问题（例如，`修复 #123`）。

## 分叉

如果您要分叉仓库，您将能够运行构建、测试和集成测试工作流。但是，为了使集成测试运行，您需要添加一个[GitHub仓库密钥](https://docs.github.com/en/actions/security-for-github-actions/security-guides/using-secrets-in-github-actions#creating-secrets-for-a-repository)，值为`GEMINI_API_KEY`，并将其设置为您可用的有效API密钥。您的密钥和密钥对您的仓库是私有的；没有访问权限的人无法看到您的密钥，您也无法看到与此仓库相关的任何密钥。

此外，您需要点击`Actions`选项卡并为您的仓库启用工作流，您会在屏幕中央找到大的蓝色按钮。

## 开发设置和工作流

本节指导贡献者如何构建、修改和理解本项目的开发设置。

### 设置开发环境

**先决条件：**

1. 安装 [Node 18+](https://nodejs.org/en/download)
2. Git

### 构建过程

克隆仓库：

```bash
git clone https://github.com/google-gemini/gemini-cli.git # 或您的分叉URL
cd gemini-cli
```

安装`package.json`中定义的依赖项以及根依赖项：

```bash
npm install
```

构建整个项目（所有包）：

```bash
npm run build
```

此命令通常将TypeScript编译为JavaScript，打包资源，并准备包以供执行。有关构建过程中发生什么的更多详细信息，请参阅`scripts/build.js`和`package.json`脚本。

### 启用沙箱

强烈建议使用基于容器的[沙箱](#沙箱)，至少需要在您的`~/.env`中设置`GEMINI_SANDBOX=true`并确保容器引擎（例如`docker`或`podman`）可用。有关详细信息，请参阅[沙箱](#沙箱)。

要构建`gemini` CLI实用程序和沙箱容器，请从根目录运行`build:all`：

```bash
npm run build:all
```

要跳过构建沙箱容器，您可以使用`npm run build`。

### 运行

要从源代码启动Gemini CLI（构建后），请从根目录运行以下命令：

```bash
npm start
```

如果您想在gemini-cli文件夹之外运行源代码构建，可以使用`npm link path/to/gemini-cli/packages/cli`（请参阅：[文档](https://docs.npmjs.com/cli/v9/commands/npm-link)）或`alias gemini="node path/to/gemini-cli/packages/cli"`来使用`gemini`运行

### 运行测试

本项目包含两种类型的测试：单元测试和集成测试。

#### 单元测试

要执行项目的单元测试套件：

```bash
npm run test
```

这将运行位于`packages/core`和`packages/cli`目录中的测试。在提交任何更改之前确保测试通过。对于更全面的检查，建议运行`npm run preflight`。

#### 集成测试

集成测试旨在验证Gemini CLI的端到端功能。它们不作为默认`npm run test`命令的一部分运行。

要运行集成测试，请使用以下命令：

```bash
npm run test:e2e
```

有关集成测试框架的更详细信息，请参阅[集成测试文档](./docs/integration-tests.md)。

### 代码检查和预检

为了确保代码质量和格式一致性，运行预检：

```bash
npm run preflight
```

此命令将运行ESLint、Prettier、所有测试以及项目中`package.json`定义的其他检查。

_专业提示_

克隆后创建一个git预提交钩子文件，以确保您的提交始终是干净的。

```bash
echo "
# 运行npm构建并检查错误
if ! npm run preflight; then
  echo "npm构建失败。提交已中止。"
  exit 1
fi
" > .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit
```

#### 格式化

要单独格式化此项目中的代码，请从根目录运行以下命令：

```bash
npm run format
```

此命令使用Prettier根据项目的样式指南格式化代码。

#### 代码检查

要单独检查此项目中的代码，请从根目录运行以下命令：

```bash
npm run lint
```

### 编码约定

- 请遵循整个现有代码库中使用的编码风格、模式和约定。
- 查阅[GEMINI.md](https://github.com/google-gemini/gemini-cli/blob/main/GEMINI.md)（通常在项目根目录中找到）以获取与AI辅助开发相关的具体说明，包括React、注释和Git使用的约定。
- **导入：** 特别注意导入路径。项目使用`eslint-rules/no-relative-cross-package-imports.js`来强制执行包之间相对导入的限制。

### 项目结构

- `packages/`: 包含项目的各个子包。
  - `cli/`: 命令行界面。
  - `server/`: CLI与之交互的后端服务器。
- `docs/`: 包含所有项目文档。
- `scripts/`: 用于构建、测试和开发任务的实用脚本。

有关更详细的架构，请参阅`docs/architecture.md`。

## 调试

### VS Code:

0.  运行CLI以在VS Code中交互式调试，按`F5`
1.  从根目录以调试模式启动CLI：
    ```bash
    npm run debug
    ```
    此命令在`packages/cli`目录中运行`node --inspect-brk dist/gemini.js`，暂停执行直到调试器附加。然后您可以在Chrome浏览器中打开`chrome://inspect`来连接到调试器。
2.  在VS Code中，使用"附加"启动配置（在`.vscode/launch.json`中找到）。

或者，如果您更喜欢直接启动当前打开的文件，可以在VS Code中使用"启动程序"配置，但通常推荐使用'F5'。

要在沙箱容器内命中断点，请运行：

```bash
DEBUG=1 gemini
```

### React DevTools

要调试CLI的基于React的UI，您可以使用React DevTools。Ink（用于CLI界面的库）与React DevTools 4.x版本兼容。

1.  **以开发模式启动Gemini CLI：**

    ```bash
    DEV=true npm start
    ```

2.  **安装并运行React DevTools 4.28.5版本（或最新的兼容4.x版本）：**

    您可以全局安装：

    ```bash
    npm install -g react-devtools@4.28.5
    react-devtools
    ```

    或使用npx直接运行：

    ```bash
    npx react-devtools@4.28.5
    ```

    然后您运行的CLI应用程序应该连接到React DevTools。
    ![](/docs/assets/connected_devtools.png)

## 沙箱

### MacOS Seatbelt

在MacOS上，`gemini`在`permissive-open`配置文件下使用Seatbelt（`sandbox-exec`）（请参阅`packages/cli/src/utils/sandbox-macos-permissive-open.sb`），它限制对项目文件夹的写入，但默认允许所有其他操作和出站网络流量（"开放"）。您可以通过在环境或`.env`文件中设置`SEATBELT_PROFILE=restrictive-closed`来切换到`restrictive-closed`配置文件（请参阅`.../sandbox-macos-strict.sb`），该配置文件默认拒绝所有操作和出站网络流量（"关闭"）。可用的内置配置文件是`{permissive,restrictive}-{open,closed,proxied}`（有关代理网络，请参阅下文）。如果您还在项目设置目录`.gemini`下创建文件`.gemini/sandbox-macos-<profile>.sb`，您也可以切换到自定义配置文件`SEATBELT_PROFILE=<profile>`。

### 基于容器的沙箱（所有平台）

为了在MacOS或其他平台上进行更强的基于容器的沙箱，您可以在环境或`.env`文件中设置`GEMINI_SANDBOX=true|docker|podman|<command>`。指定的命令（或者如果`true`则是`docker`或`podman`）必须安装在主机机器上。启用后，`npm run build:all`将构建一个最小的容器（"沙箱"）镜像，`npm start`将在该容器的新实例中启动。第一次构建可能需要20-30秒（主要是由于下载基础镜像），但之后构建和启动开销应该是最小的。默认构建（`npm run build`）不会重新构建沙箱。

基于容器的沙箱挂载项目目录（和系统临时目录）具有读写访问权限，并在您启动/停止Gemini CLI时自动启动/停止/删除。在沙箱内创建的文件应该自动映射到主机机器上的用户/组。您可以通过设置`SANDBOX_{MOUNTS,PORTS,ENV}`来轻松指定额外的挂载、端口或环境变量。您还可以通过在项目设置目录（`.gemini`）下创建文件`.gemini/sandbox.Dockerfile`和/或`.gemini/sandbox.bashrc`并使用`BUILD_SANDBOX=1`运行`gemini`来完全自定义项目的沙箱，以触发构建您的自定义沙箱。

#### 代理网络

所有沙箱方法，包括使用`*-proxied`配置文件的MacOS Seatbelt，都支持通过可以指定为`GEMINI_SANDBOX_PROXY_COMMAND=<command>`的自定义代理服务器限制出站网络流量，其中`<command>`必须启动一个在`:::8877`上监听相关请求的代理服务器。请参阅`scripts/example-proxy.js`了解一个最小代理，它只允许到`example.com:443`的`HTTPS`连接（例如`curl https://example.com`）并拒绝所有其他请求。代理与沙箱一起自动启动和停止。

## 手动发布

我们为每个提交发布一个工件到我们的内部注册表。但如果您需要手动创建本地构建，请运行以下命令：

```
npm run clean
npm install
npm run auth
npm run prerelease:dev
npm publish --workspaces
```
