# Gemini CLI

[![Gemini CLI CI](https://github.com/google-gemini/gemini-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/google-gemini/gemini-cli/actions/workflows/ci.yml)

This repository contains the Gemini CLI tool.

## Quickstart

1. [Install Node 20+](https://nodejs.org/en/download).
2. [Get an API key from Google AI Studio](https://aistudio.google.com/apikey).
3. Set the API key in your shell using the following command, replacing `YOUR_API_KEY` with the API key you obtained: `export GEMINI_API_KEY="YOUR_API_KEY"`.
4. Run the Gemini CLI from your shell using the following command: `npx https://github.com/google-gemini/gemini-cli#early-access`
5. Enjoy.

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

1.  **Gemini API key:**

    - Obtain your API key from Google AI Studio: [https://aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
    - Set the `GEMINI_API_KEY` environment variable. In the following methods, replace `YOUR_GEMINI_API_KEY` with the API key you obtained from Google AI Studio:
      - You can temporarily set the environment variable in your current shell session using the following command:
        ```bash
        export GEMINI_API_KEY="YOUR_GEMINI_API_KEY"
        ```
      - For repeated use, you can add the environment variable to your `.env` file (located in the project directory or user home directory) or your shell's configuration file (like `~/.bashrc`, `~/.zshrc`, or `~/.profile`). For example, the following command adds the environment variable to a `~/.bashrc` file:
        ```bash
        echo 'export GEMINI_API_KEY="YOUR_GEMINI_API_KEY"' >> ~/.bashrc # Or your preferred shell config file
        source ~/.bashrc # Reload the config
        ```

2.  **Google API Key (Vertex AI Express Mode):**

    - You can use a general Google Cloud API key if it has been enabled for the Gemini API or Vertex AI.
    - Set the `GOOGLE_API_KEY` and `GOOGLE_GENAI_USE_VERTEXAI` environment variables. In the following methods, replace `YOUR_GEMINI_API_KEY` with your Google Cloud API key:
      - You can temporarily set these environment variables in your current shell session using the following commands:
        ```bash
        export GOOGLE_API_KEY="YOUR_GOOGLE_API_KEY"
        export GOOGLE_GENAI_USE_VERTEXAI=true
        ```
      - For repeated use, you can add the environment variables to your `.env` file (located in the project directory or user home directory) or your shell's configuration file (like `~/.bashrc`, `~/.zshrc`, or `~/.profile`). For example, the following commands adds the environment variables to a `~/.bashrc` file:
        ```bash
        echo 'export GEMINI_API_KEY="YOUR_GEMINI_API_KEY"' >> ~/.bashrc # Or your preferred shell config file
        echo 'export GOOGLE_GENAI_USE_VERTEXAI=true' >> ~/.bashrc # Or your preferred shell config file
        source ~/.bashrc # Reload the config
        ```

3.  **Vertex AI (Project and Location):**
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
        echo 'export GOOGLE_CLOUD_PROJECT="YOUR_PROJECT_ID"' >> ~/.bashrc # Or your preferred shell config file
        echo 'export GOOGLE_CLOUD_LOCATION="YOUR_PROJECT_LOCATION"' >> ~/.bashrc # Or your preferred shell config file
        echo 'export GOOGLE_GENAI_USE_VERTEXAI=true' >> ~/.bashrc # Or your preferred shell config file
        source ~/.bashrc # Reload the config
        ```

### Next Steps

- Learn how to [contribute to or build from the source](./CONTRIBUTING.md).
- Explore the available **[CLI Commands](./docs/cli/commands.md)**.
- If you encounter any issues, review the **[Troubleshooting guide](./docs/troubleshooting.md)**.
- For more comprehensive documentation, see the [full documentation](./docs/index.md).

## Gemini APIs

This project leverages the Gemini APIs to provide AI capabilities. For details on the terms of service governing the Gemini API, please refer to the [Gemini API Terms of Service](https://ai.google.dev/gemini-api/terms).
