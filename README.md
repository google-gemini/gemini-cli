# Gemini CLI

[![Gemini CLI CI](https://github.com/google-gemini/gemini-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/google-gemini/gemini-cli/actions/workflows/ci.yml)

This repository contains the Gemini CLI tool.

## Quickstart

1. Install [Node 18+](https://nodejs.org/en/download)
2. Set your API key: `export GEMINI_API_KEY="YOUR_API_KEY"` ([Get an API key](https://aistudio.google.com/apikey))

- For future sessions you can add this to your shell's configuration file, or use a `.env` file in your project's hierarchy

3. Run with: `npx https://github.com/google-gemini/gemini-cli#early-access`
4. Enjoy

## Examples

Once the CLI is running, you can start interacting with Gemini. Try a simple query:

```
> How can I build a web app?
```

Or ask it to perform a task using its tools:

```
> List files in the current directory.
```

## API Key Setup

The Gemini CLI requires a Gemini API Key. It supports several ways to authenticate with Google's AI services. You'll need to configure **one** of the following methods:

1.  **Gemini API Key:**

    - Obtain your API key from Google AI Studio: [https://aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
    - Set the `GEMINI_API_KEY` environment variable. You can do this temporarily in your current shell session:
      ```bash
      export GEMINI_API_KEY="YOUR_GEMINI_API_KEY"
      ```
      Or add it to your `.env` file (in project directory or user home) or shell's configuration file (like `~/.bashrc`, `~/.zshrc`, or `~/.profile`) for persistence:
      ```bash
      echo 'export GEMINI_API_KEY="YOUR_GEMINI_API_KEY"' >> ~/.bashrc # Or your preferred shell config file
      source ~/.bashrc # Reload the config
      ```
      Replace `"YOUR_GEMINI_API_KEY"` with your actual key.

2.  **Google API Key (Vertex AI Express Mode):**

    - This key can be a general Google Cloud API key enabled for the Gemini API or Vertex AI.
    - Set the `GOOGLE_API_KEY` and `GOOGLE_GENAI_USE_VERTEXAI` environment variables:
      ```bash
      export GOOGLE_API_KEY="YOUR_GOOGLE_API_KEY"
      export GOOGLE_GENAI_USE_VERTEXAI=true
      ```

3.  **Vertex AI (Project and Location):**
    - Ensure you have a Google Cloud Project and have enabled the Vertex AI API.
    - Set up Application Default Credentials (ADC). For more details, refer to the [official Google Cloud ADC documentation](https://cloud.google.com/docs/authentication/provide-credentials-adc):
      ```bash
      gcloud auth application-default login
      ```
    - Set the `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION`, and `GOOGLE_GENAI_USE_VERTEXAI` environment variables:
      ```bash
      export GOOGLE_CLOUD_PROJECT="YOUR_PROJECT_ID"
      export GOOGLE_CLOUD_LOCATION="YOUR_PROJECT_LOCATION" # e.g., us-central1
      export GOOGLE_GENAI_USE_VERTEXAI=true
      ```

## Next Steps

Congratulations! You've successfully set up and run the Gemini CLI.

- If you're interested in contributing or building from source, check [CONTRIBUTING](./CONTRIBUTING.md)
- Explore the **[CLI Commands](./docs/cli/commands.md)** to learn about all available functionalities.
- If you encounter any issues, check the **[Troubleshooting Guide](./docs/troubleshooting.md)**.
- For more comprehensive documentation, please see the [full documentation here](./docs/index.md).
