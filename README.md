# Gemini CLI

[![Gemini CLI CI](https://github.com/google-gemini/gemini-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/google-gemini/gemini-cli/actions/workflows/ci.yml)

This repository contains the Gemini CLI tool.

## Quickstart

1. **Prerequisites:** Ensure you have [Node.js version 18](https://nodejs.org/en/download) or higher installed.
2. **Run the CLI:** Execute the following command in your terminal:

   ```bash
   npx https://github.com/google-gemini/gemini-cli
   ```

3. **Authenticate:** When prompted, sign in with your Google account. This will grant you up to 60 model requests per minute and 1,000 model requests per day using Gemini 2.5 Pro.

You are now ready to use the Gemini CLI!

### For advanced use or increased limits:

If you need to use a specific model or require a higher request capacity, you can use an API key:

1. Generate a key from [Google AI Studio](https://aistudio.google.com/apikey).
2. Set it as an environment variable in your terminal. Replace `YOUR_API_KEY` with your generated key.

   ```bash
   export GEMINI_API_KEY="YOUR_API_KEY"
   ```

For other authentication methods, see the [authentication](./docs/cli/authentication.md) guide.

## Examples

Once the CLI is running, you can start interacting with Gemini from your shell. Try a simple query:

```
> How can I build a web app?
```

Or ask it to perform a task using its tools:

```
> List files in the current directory.
```

## API Key Setup

The Gemini CLI requires you to authenticate with Google's AI services. You'll need to configure **one** of the following authentication methods:

1.  **Gemini Code Assist:**

    - To enable this mode you only need set the GEMINI_CODE_ASSIST environment variable to true.
      - You can temporarily set the environment variable in your current shell session using the following command:
        ```bash
        export GEMINI_CODE_ASSIST="true"
        ```
      - For repeated use, you can add the environment variable to your `.env` file (located in the project directory or user home directory) or your shell's configuration file (like `~/.bashrc`, `~/.zshrc`, or `~/.profile`). For example, the following command adds the environment variable to a `~/.bashrc` file:
        ```bash
        echo 'export GEMINI_CODE_ASSIST="true"' >> ~/.bashrc
        source ~/.bashrc
        ```
    - There are two types of Google Accounts you can use with Gemini CLI:
      - **Personal Google Account**: This is the standard, free account you use for services like Gmail, Google Photos, and Google Drive for personal use (e.g. your-name@gmail.com).
      - **Google Workspace Account**: This is a paid service for businesses and organizations that provides a suite of productivity tools, including a custom email domain (e.g. your-name@your-company.com), enhanced security features, and administrative controls. These accounts are often managed by an employer or school.
        - Google Workspace Account must configure a Google Cloud Project Id to use. You can temporarily set the environment variable in your current shell session using the following command:
        ```bash
        export GOOGLE_CLOUD_PROJECT_ID="YOUR_PROJECT_ID"
        ```
        - For repeated use, you can add the environment variable to your `.env` file (located in the project directory or user home directory) or your shell's configuration file (like `~/.bashrc`, `~/.zshrc`, or `~/.profile`). For example, the following command adds the environment variable to a `~/.bashrc` file:
        ```bash
        echo 'export GOOGLE_CLOUD_PROJECT_ID="YOUR_PROJECT_ID"' >> ~/.bashrc
        source ~/.bashrc
        ```
    - During start up, Gemini CLI will direct you to a webpage for authentication. Once authenticated, your credentials will be cached locally so the web login can be skipped on subsequent runs. Cached credentials last about 20 hours before expiring.
    - Note that the the web login must be done in a browser that can communicate with the machine Gemini Cli is being run from. (Specifically, the browser will be redirected to a localhost url that Gemini CLI will be listening on).

2.  **Gemini API key:**

    - Obtain your API key from Google AI Studio: [https://aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
    - Set the `GEMINI_API_KEY` environment variable. In the following methods, replace `YOUR_GEMINI_API_KEY` with the API key you obtained from Google AI Studio:
      - You can temporarily set the environment variable in your current shell session using the following command:
        ```bash
        export GEMINI_API_KEY="YOUR_GEMINI_API_KEY"
        ```
      - For repeated use, you can add the environment variable to your `.env` file (located in the project directory or user home directory) or your shell's configuration file (like `~/.bashrc`, `~/.zshrc`, or `~/.profile`). For example, the following command adds the environment variable to a `~/.bashrc` file:
        ```bash
        echo 'export GEMINI_API_KEY="YOUR_GEMINI_API_KEY"' >> ~/.bashrc
        source ~/.bashrc
        ```

3.  **Google API Key (Vertex AI Express Mode):**

    - You can use a general Google Cloud API key if it has been enabled for the Gemini API or Vertex AI.
    - Set the `GOOGLE_API_KEY` and `GOOGLE_GENAI_USE_VERTEXAI` environment variables. In the following methods, replace `YOUR_GEMINI_API_KEY` with your Google Cloud API key:
      - You can temporarily set these environment variables in your current shell session using the following commands:
        ```bash
        export GOOGLE_API_KEY="YOUR_GOOGLE_API_KEY"
        export GOOGLE_GENAI_USE_VERTEXAI=true
        ```
      - For repeated use, you can add the environment variables to your `.env` file (located in the project directory or user home directory) or your shell's configuration file (like `~/.bashrc`, `~/.zshrc`, or `~/.profile`). For example, the following commands adds the environment variables to a `~/.bashrc` file:
        ```bash
        echo 'export GEMINI_API_KEY="YOUR_GEMINI_API_KEY"' >> ~/.bashrc
        echo 'export GOOGLE_GENAI_USE_VERTEXAI=true' >> ~/.bashrc
        source ~/.bashrc
        ```

4.  **Vertex AI (Project and Location):**
    - Ensure you have a Google Cloud project and have enabled the Vertex AI API.
    - Set up Application Default Credentials (ADC), using the following command:
      ```bash
      gcloud auth application-default login
      ```
      For more information, see [Set up Application Default Credentials for Google Cloud](https://cloud.google.com/docs/authentication/provide-credentials-adc).
    - Set the `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION`, and `GOOGLE_GENAI_USE_VERTEXAI` environment variables. In the following methods, replace `YOUR_PROJECT_ID` and `YOUR_PROJECT_LOCATION` with the relevant values for your project:
      - You can temporarily set these environment variables in your current shell session using the following commands:
        ```bash
        export GOOGLE_CLOUD_PROJECT="YOUR_PROJECT_ID"
        export GOOGLE_CLOUD_LOCATION="YOUR_PROJECT_LOCATION" # e.g., us-central1
        export GOOGLE_GENAI_USE_VERTEXAI=true
        ```
      - For repeated use, you can add the environment variables to your `.env` file (located in the project directory or user home directory) or your shell's configuration file (like `~/.bashrc`, `~/.zshrc`, or `~/.profile`). For example, the following commands adds the environment variables to a `~/.bashrc` file:
        ```bash
        echo 'export GOOGLE_CLOUD_PROJECT="YOUR_PROJECT_ID"' >> ~/.bashrc
        echo 'export GOOGLE_CLOUD_LOCATION="YOUR_PROJECT_LOCATION"' >> ~/.bashrc
        echo 'export GOOGLE_GENAI_USE_VERTEXAI=true' >> ~/.bashrc
        source ~/.bashrc
        ```

## Token Caching and Cost Optimization

Gemini CLI automatically optimizes API costs through token caching when using API key authentication (Gemini API key or Vertex AI). This feature reuses previous system instructions and context to reduce the number of tokens processed in subsequent requests.

**Token caching is available for:**

- API key users (Gemini API key)
- Vertex AI users (with project and location setup)

**Token caching is not available for:**

- OAuth users (Google Personal/Enterprise accounts) - the Code Assist API does not support cached content creation at this time

You can view your token usage and cached token savings using the `/stats` command. When cached tokens are available, they will be displayed in the stats output.

### Next steps

- Learn how to [contribute to or build from the source](./CONTRIBUTING.md).
- Explore the available **[CLI Commands](./docs/cli/commands.md)**.
- If you encounter any issues, review the **[Troubleshooting guide](./docs/troubleshooting.md)**.
- For more comprehensive documentation, see the [full documentation](./docs/index.md).
- Take a look at some [popular tasks](#popular-tasks) for more inspiration.

## Popular tasks

### Explore a new codebase

Start by `cd`ing into an existing or newly-cloned repository and running `gemini`.

```text
> Describe the main pieces of this system's architecture.
```

```text
> What security mechanisms are in place?
```

### Work with your existing code

```text
> Implement a first draft for GitHub issue #123.
```

```text
> Help me migrate this codebase to the latest version of Java. Start with a plan.
```

### Automate your workflows

Use MCP servers to integrate your local system tools with your enterprise collaboration suite.

```text
> Make me a slide deck showing the git history from the last 7 days, grouped by feature and team member.
```

```text
> Make a full-screen web app for a wall display to show our most interacted-with GitHub issues.
```

### Interact with your system

```text
> Convert all the images in this directory to png, and rename them to use dates from the exif data.
```

```text
> Organise my PDF invoices by month of expenditure.
```

## Gemini APIs

This project leverages the Gemini APIs to provide AI capabilities. For details on the terms of service governing the Gemini API, please refer to the [Gemini API Terms of Service](https://ai.google.dev/gemini-api/terms).
