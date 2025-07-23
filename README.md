---

# Gemini CLI with Remote Control (gemini-cli 远程增强版)

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-green.svg)

这是一个 `gemini-cli` 的非官方增强版本。在原项目的基础上，我们**增加了通过命令行远程连接和操作远端服务器的核心功能**。现在，您不仅可以与 Google Gemini Pro 交互，还可以将它作为一个强大的远程控制终端。

---

## ✨ 主要特性 (Key Features)

*   **与 Google Gemini Pro 交互**: 具备 `gemini-cli` 的所有基础对话功能。
*   **支持多轮对话**: 能够记忆上下文，进行连续的、有逻辑的对话。
*   **跨平台**: 兼容 Windows, macOS, 和 Linux。
*   🚀 **新增：远程服务器连接**: 只需一条命令，即可安全连接到您的远程服务器。
*   🛡️ **新增：认证保护**: 连接过程包含认证步骤，确保只有授权用户才能访问。
*   💻 **新增：远程执行**: 连接成功后，所有操作都将在远端服务器上执行，实现真正的远程管理。

## 📸 效果演示 (Demo)

<img width="330" height="169" alt="image" src="https://github.com/user-attachments/assets/f79f2d6b-ca21-48ea-ba8a-bb728d63ac30" />

<img width="878" height="305" alt="image" src="https://github.com/user-attachments/assets/a7a1c788-1cef-4d1a-aefd-466618064207" />


## 🔧 开始使用 (Getting Started)

请按照以下步骤在您的本地环境中安装和运行本项目。

### 1. 先决条件 (Prerequisites)

确保您的系统中已经安装了以下软件：
*   [Node.js](https://nodejs.org/) (建议版本 >= 18.0.0)
*   [npm](https://www.npmjs.com/) (通常随 Node.js 一起安装)
*   [Git](https://git-scm.com/)

### 2. 安装步骤 (Installation)

1.  **克隆本项目到本地**
    ```bash
    git clone git@github.com:LeslieLai1999/gemini-ssh.git
    ```

2.  **进入项目目录**
    ```bash
    cd your-repo-name
    ```

3.  **安装项目依赖**
    ```bash
    npm install
    ```

## 🚀 如何使用 (Usage)

1.  **启动应用程序**
    在项目根目录下，运行以下命令来启动命令行界面：
    ```bash
    npm run start
    ```

2.  **连接到远程服务器**
    应用启动后，您会看到一个命令行提示符。直接输入连接命令和您的服务器地址。
    
    *(您可以根据您的实际命令进行修改，这里是一个示例)*
    ```
    > connect your-server-address:port
    ```

3.  **通过认证**
    输入连接命令后，终端会提示您进行认证（例如，输入密码或令牌）。
    ```
    Authentication required for your-server-address:port
    Enter password: ****
    ```

4.  **连接成功并开始操作**
    认证通过后，您将看到连接成功的提示。现在，您输入的任何命令都将发送到远程服务器执行。
    ```
    ✅ Successfully connected to your-server-address:port!
    remote-server:~$ ls -l
    # ... (远程服务器的输出) ...
    ```

## 🙏 致谢 (Acknowledgements)

*   本项目基于原版 `gemini-cli` 进行修改，感谢原作者的杰出工作。
*   
## 🤝 贡献 (Contributing)

欢迎任何形式的贡献！如果您有好的想法或发现了 Bug，请随时提交 Pull Request 或创建 Issue。

1.  Fork 本项目
2.  创建您的特性分支 (`git checkout -b feature/AmazingFeature`)
3.  提交您的更改 (`git commit -m 'Add some AmazingFeature'`)
4.  推送到分支 (`git push origin feature/AmazingFeature`)
5.  打开一个 Pull Request

## 📄 许可证 (License)

本项目采用 MIT 许可证。详情请见 `LICENSE` 文件。****
