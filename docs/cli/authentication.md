## 认证设置

Gemini CLI 需要您与 Google 的 AI 服务进行身份验证。在初始启动时，您需要配置以下**一种**认证方法：

1.  **使用 Google 登录（Gemini Code Assist）：**
    - 使用此选项通过您的 Google 账户登录。
    - 在初始启动期间，Gemini CLI 将引导您访问网页进行身份验证。一旦完成身份验证，您的凭据将在本地缓存，以便在后续运行中跳过网页登录。
    - 请注意，网页登录必须在能够与运行 Gemini CLI 的机器通信的浏览器中进行。（具体来说，浏览器将被重定向到 Gemini CLI 正在监听的 localhost URL）。
    - <a id="workspace-gca">用户可能必须指定 GOOGLE_CLOUD_PROJECT，如果：</a>
      1. 您拥有 Google Workspace 账户。Google Workspace 是为企业和组织提供的付费服务，提供一套生产力工具，包括自定义电子邮件域名（例如 your-name@your-company.com）、增强的安全功能和管理控制。这些账户通常由雇主或学校管理。
      1. 您通过 [Google 开发者计划](https://developers.google.com/program/plans-and-pricing) 获得了免费的 Code Assist 许可证（包括合格的 Google 开发者专家）
      1. 您已被分配到当前的 Gemini Code Assist 标准或企业订阅的许可证。
      1. 您在免费个人使用的 [支持区域](https://developers.google.com/gemini-code-assist/resources/available-locations) 之外使用该产品。
      1. 您是 18 岁以下的 Google 账户持有者
      - 如果您属于这些类别之一，您必须首先配置要使用的 Google Cloud Project Id，[启用 Gemini for Cloud API](https://cloud.google.com/gemini/docs/discover/set-up-gemini#enable-api) 并 [配置访问权限](https://cloud.google.com/gemini/docs/discover/set-up-gemini#grant-iam)。

      您可以使用以下命令在当前 shell 会话中临时设置环境变量：

      ```bash
      export GOOGLE_CLOUD_PROJECT="YOUR_PROJECT_ID"
      ```
      - 对于重复使用，您可以将环境变量添加到您的 `.env` 文件（位于项目目录或用户主目录中）或您的 shell 配置文件（如 `~/.bashrc`、`~/.zshrc` 或 `~/.profile`）中。例如，以下命令将环境变量添加到 `~/.bashrc` 文件中：

      ```bash
      echo 'export GOOGLE_CLOUD_PROJECT="YOUR_PROJECT_ID"' >> ~/.bashrc
      source ~/.bashrc
      ```

2.  **<a id="gemini-api-key"></a>Gemini API 密钥：**
    - 从 Google AI Studio 获取您的 API 密钥：[https://aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
    - 设置 `GEMINI_API_KEY` 环境变量。在以下方法中，将 `YOUR_GEMINI_API_KEY` 替换为您从 Google AI Studio 获得的 API 密钥：
      - 您可以使用以下命令在当前 shell 会话中临时设置环境变量：
        ```bash
        export GEMINI_API_KEY="YOUR_GEMINI_API_KEY"
        ```
      - 对于重复使用，您可以将环境变量添加到您的 `.env` 文件（位于项目目录或用户主目录中）或您的 shell 配置文件（如 `~/.bashrc`、`~/.zshrc` 或 `~/.profile`）中。例如，以下命令将环境变量添加到 `~/.bashrc` 文件中：
        ```bash
        echo 'export GEMINI_API_KEY="YOUR_GEMINI_API_KEY"' >> ~/.bashrc
        source ~/.bashrc
        ```

3.  **Vertex AI：**
    - 如果不使用 express 模式：
      - 确保您拥有 Google Cloud 项目并已启用 Vertex AI API。
      - 设置应用程序默认凭据 (ADC)，使用以下命令：
        ```bash
        gcloud auth application-default login
        ```
        有关更多信息，请参阅 [为 Google Cloud 设置应用程序默认凭据](https://cloud.google.com/docs/authentication/provide-credentials-adc)。
      - 设置 `GOOGLE_CLOUD_PROJECT`、`GOOGLE_CLOUD_LOCATION` 和 `GOOGLE_GENAI_USE_VERTEXAI` 环境变量。在以下方法中，将 `YOUR_PROJECT_ID` 和 `YOUR_PROJECT_LOCATION` 替换为您项目的相关值：
        - 您可以使用以下命令在当前 shell 会话中临时设置这些环境变量：
          ```bash
          export GOOGLE_CLOUD_PROJECT="YOUR_PROJECT_ID"
          export GOOGLE_CLOUD_LOCATION="YOUR_PROJECT_LOCATION" # 例如，us-central1
          export GOOGLE_GENAI_USE_VERTEXAI=true
          ```
        - 对于重复使用，您可以将环境变量添加到您的 `.env` 文件（位于项目目录或用户主目录中）或您的 shell 配置文件（如 `~/.bashrc`、`~/.zshrc` 或 `~/.profile`）中。例如，以下命令将环境变量添加到 `~/.bashrc` 文件中：
          ```bash
          echo 'export GOOGLE_CLOUD_PROJECT="YOUR_PROJECT_ID"' >> ~/.bashrc
          echo 'export GOOGLE_CLOUD_LOCATION="YOUR_PROJECT_LOCATION"' >> ~/.bashrc
          echo 'export GOOGLE_GENAI_USE_VERTEXAI=true' >> ~/.bashrc
          source ~/.bashrc
          ```
    - 如果使用 express 模式：
      - 设置 `GOOGLE_API_KEY` 环境变量。在以下方法中，将 `YOUR_GOOGLE_API_KEY` 替换为 express 模式提供的 Vertex AI API 密钥：
        - 您可以使用以下命令在当前 shell 会话中临时设置这些环境变量：
          ```bash
          export GOOGLE_API_KEY="YOUR_GOOGLE_API_KEY"
          export GOOGLE_GENAI_USE_VERTEXAI=true
          ```
        - 对于重复使用，您可以将环境变量添加到您的 `.env` 文件（位于项目目录或用户主目录中）或您的 shell 配置文件（如 `~/.bashrc`、`~/.zshrc` 或 `~/.profile`）中。例如，以下命令将环境变量添加到 `~/.bashrc` 文件中：
          ```bash
          echo 'export GOOGLE_API_KEY="YOUR_GOOGLE_API_KEY"' >> ~/.bashrc
          echo 'export GOOGLE_GENAI_USE_VERTEXAI=true' >> ~/.bashrc
          source ~/.bashrc
          ```
