🌐 [查看英文版](../../../../docs/cli/authentication.md)

# 身份验证设置

Gemini CLI 要求您向 Google 的 AI 服务进行身份验证。在首次启动时，您需要配置以下身份验证方法之一：

1.  **使用 Google 登录 (Gemini Code Assist)：**
    - 使用此选项通过您的 Google 帐户登录。
    - 在初始启动期间，Gemini CLI 会将您引导至一个网页进行身份验证。身份验证后，您的凭据将被本地缓存，以便在后续运行时可以跳过网页登录。
    - 请注意，网页登录必须在可以与运行 Gemini CLI 的计算机通信的浏览器中完成。（具体来说，浏览器将被重定向到 Gemini CLI 将侦听的 localhost URL）。
    - <a id="workspace-gca">用户可能需要指定 GOOGLE_CLOUD_PROJECT，如果：</a>
      1. 您拥有 Google Workspace 帐户。Google Workspace 是面向企业和组织的付费服务，提供一套生产力工具，包括自定义电子邮件域（例如 your-name@your-company.com）、增强的安全功能和管理控制。这些帐户通常由雇主或学校管理。
      2. 您通过 [Google 开发者计划](https://developers.google.com/program/plans-and-pricing)（包括合格的 Google 开发者专家）获得了 Gemini Code Assist 许可证
      3. 您已被分配了当前 Gemini Code Assist 标准或企业订阅的许可证。
      4. 您正在免费个人使用的[支持区域](https://developers.google.com/gemini-code-assist/resources/available-locations)之外使用该产品。
      5. 您是 18 岁以下的 Google 帐户持有人
      - 如果您属于这些类别之一，则必须首先配置要使用的 Google Cloud 项目 ID，[启用 Gemini for Cloud API](https://cloud.google.com/gemini/docs/discover/set-up-gemini#enable-api) 并[配置访问权限](https://cloud.google.com/gemini/docs/discover/set-up-gemini#grant-iam)。

      您可以使用以下命令在当前 shell 会话中临时设置环境变量：

      ```bash
      export GOOGLE_CLOUD_PROJECT="YOUR_PROJECT_ID"
      ```
      - 对于重复使用，您可以将环境变量添加到您的 [.env 文件](#使用-env-文件持久化环境变量)或您的 shell 配置文件（如 `~/.bashrc`、`~/.zshrc` 或 `~/.profile`）中。例如，以下命令将环境变量添加到 `~/.bashrc` 文件中：

      ```bash
      echo 'export GOOGLE_CLOUD_PROJECT="YOUR_PROJECT_ID"' >> ~/.bashrc
      source ~/.bashrc
      ```

2.  **<a id="gemini-api-key"></a>Gemini API 密钥：**
    - 从 Google AI Studio 获取您的 API 密钥：[https://aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
    - 设置 `GEMINI_API_KEY` 环境变量。在以下方法中，将 `YOUR_GEMINI_API_KEY` 替换为您从 Google AI Studio 获取的 API 密钥：
      - 您可以使用以下命令在当前 shell 会话中临时设置环境变量：
        ```bash
        export GEMINI_API_KEY="YOUR_GEMINI_API_KEY"
        ```
      - 对于重复使用，您可以将环境变量添加到您的 [.env 文件](#persisting-environment-variables-with-env-files)中。

      - 或者，您可以从 shell 的配置文件（如 `~/.bashrc`、`~/.zshrc` 或 `~/.profile`）中导出 API 密钥。例如，以下命令将环境变量添加到 `~/.bashrc` 文件中：

        ```bash
        echo 'export GEMINI_API_KEY="YOUR_GEMINI_API_KEY"' >> ~/.bashrc
        source ~/.bashrc
        ```

        :warning: 请注意，当您在 shell 配置文件中导出 API 密钥时，从该 shell 执行的任何其他进程都可以读取它。

3.  **Vertex AI：**
    - 获取您的 Google Cloud API 密钥：[获取 API 密钥](https://cloud.google.com/vertex-ai/generative-ai/docs/start/api-keys?usertype=newuser)
      - 设置 `GOOGLE_API_KEY` 环境变量。在以下方法中，将 `YOUR_GOOGLE_API_KEY` 替换为您的 Vertex AI API 密钥：
        - 您可以使用以下命令在当前 shell 会话中临时设置这些环境变量：
          ```bash
          export GOOGLE_API_KEY="YOUR_GOOGLE_API_KEY"
          ```
        - 对于重复使用，您可以将环境变量添加到您的 [.env 文件](#使用-env-文件持久化环境变量)或您的 shell 配置文件（如 `~/.bashrc`、`~/.zshrc` 或 `~/.profile`）中。例如，以下命令将环境变量添加到 `~/.bashrc` 文件中：
          ```bash
          echo 'export GOOGLE_API_KEY="YOUR_GOOGLE_API_KEY"' >> ~/.bashrc
          source ~/.bashrc
          ```
    - 要使用应用程序默认凭据 (ADC)，请使用以下命令：
      - 确保您拥有一个 Google Cloud 项目并已启用 Vertex AI API。
        ```bash
        gcloud auth application-default login
        ```
        有关更多信息，请参阅[为 Google Cloud 设置应用程序默认凭据](https://cloud.google.com/docs/authentication/provide-credentials-adc)。
      - 设置 `GOOGLE_CLOUD_PROJECT` 和 `GOOGLE_CLOUD_LOCATION` 环境变量。在以下方法中，将 `YOUR_PROJECT_ID` 和 `YOUR_PROJECT_LOCATION` 替换为您的项目的相关值：
        - 您可以使用以下命令在当前 shell 会话中临时设置这些环境变量：
          ```bash
          export GOOGLE_CLOUD_PROJECT="YOUR_PROJECT_ID"
          export GOOGLE_CLOUD_LOCATION="YOUR_PROJECT_LOCATION" # e.g., us-central1
          ```
        - 对于重复使用，您可以将环境变量添加到您的 [.env 文件](#persisting-environment-variables-with-env-files)

        - 或者，您可以从 shell 的配置文件（如 `~/.bashrc`、`~/.zshrc` 或 `~/.profile`）中导出环境变量。例如，以下命令将环境变量添加到 `~/.bashrc` 文件中：

          ```bash
          echo 'export GOOGLE_CLOUD_PROJECT="YOUR_PROJECT_ID"' >> ~/.bashrc
          echo 'export GOOGLE_CLOUD_LOCATION="YOUR_PROJECT_LOCATION"' >> ~/.bashrc
          source ~/.bashrc
          ```

          :warning: 请注意，当您在 shell 配置文件中导出 API 密钥时，从该 shell 执行的任何其他进程都可以读取它。

4.  **Cloud Shell：**
    - 此选项仅在 Google Cloud Shell 环境中运行时可用。
    - 它会自动使用 Cloud Shell 环境中已登录用户的凭据。
    - 这是在 Cloud Shell 中运行且未配置其他方法时的默认身份验证方法。

          :warning: 请注意，当您在 shell 配置文件中导出 API 密钥时，从该 shell 执行的任何其他进程都可以读取它。

### 使用 `.env` 文件持久化环境变量

您可以在项目目录或主目录中创建一个 **`.gemini/.env`** 文件。创建一个普通的 **`.env`** 文件也可以，但建议使用 `.gemini/.env` 以将 Gemini 变量与其他工具隔离。

Gemini CLI 会自动从它找到的**第一个** `.env` 文件加载环境变量，使用以下搜索顺序：

1. 从**当前目录**开始并向上移动到 `/`，对于每个目录，它会检查：
   1. `.gemini/.env`
   2. `.env`
2. 如果未找到文件，它会回退到您的**主目录**：
   - `~/.gemini/.env`
   - `~/.env`

> **重要提示：** 搜索在遇到的**第一个**文件处停止——变量**不会**在多个文件中合并。

#### 示例

**特定于项目的覆盖**（当您在项目内部时优先）：

```bash
mkdir -p .gemini
echo 'GOOGLE_CLOUD_PROJECT="your-project-id"' >> .gemini/.env
```

**用户范围的设置**（在每个目录中都可用）：

```bash
mkdir -p ~/.gemini
cat >> ~/.gemini/.env <<'EOF'
GOOGLE_CLOUD_PROJECT="your-project-id"
GEMINI_API_KEY="your-gemini-api-key"
EOF
```

## 非交互模式/无头环境

在非交互式环境中运行 Gemini CLI 时，您无法使用交互式登录流程。
相反，您必须使用环境变量配置身份验证。

CLI 将自动检测它是否在非交互式终端中运行，并将使用以下身份验证方法之一（如果可用）：

1.  **Gemini API 密钥：**
    - 设置 `GEMINI_API_KEY` 环境变量。
    - CLI 将使用此密钥向 Gemini API 进行身份验证。

2.  **Vertex AI：**
    - 设置 `GOOGLE_GENAI_USE_VERTEXAI=true` 环境变量。
    - **使用 API 密钥：** 设置 `GOOGLE_API_KEY` 环境变量。
    - **使用应用程序默认凭据 (ADC)：**
      - 在您的环境中运行 `gcloud auth application-default login` 以配置 ADC。
      - 确保已设置 `GOOGLE_CLOUD_PROJECT` 和 `GOOGLE_CLOUD_LOCATION` 环境变量。

如果在非交互式会话中未设置这些环境变量，CLI 将退出并显示错误。