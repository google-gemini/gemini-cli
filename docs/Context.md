# Project Context: Gemini CLI

## What is this project?

This project is the Gemini CLI, a powerful and interactive command-line interface that allows developers to interact with Google's Gemini family of generative AI models directly from their terminal. It is a sophisticated tool built with Node.js, TypeScript, and React (for its interactive terminal UI), designed to be a versatile assistant for a wide range of development tasks.

The project is structured as a monorepo containing three main packages:
1.  **`packages/cli`**: The user-facing command-line application, featuring a rich interactive interface.
2.  **`packages/core`**: The central library containing the core business logic, including communication with the Gemini API, authentication, and tool management.
3.  **`packages/vscode-ide-companion`**: A VS Code extension that integrates the CLI with the editor, allowing it to access workspace context like open files.

## What problem does it solve?

The Gemini CLI solves several key problems for developers:

*   **Reduces Context Switching:** It eliminates the need for developers to leave their terminal or IDE to access the capabilities of a large language model. By bringing Gemini's power into the local development workflow, it streamlines tasks like asking coding questions, generating code snippets, and understanding complex codebases.
*   **Provides a Secure Execution Environment:** Development tasks often require interacting with the file system or executing commands. The CLI provides a sandboxing feature that can execute code in an isolated environment (e.g., a Docker container), protecting the user's machine from accidental or malicious operations.
*   **Enables Automation and Scripting:** Beyond its interactive mode, the CLI can be used in non-interactive scripts and automated workflows (like CI/CD pipelines), allowing developers to incorporate generative AI into their toolchains.
*   **IDE-Aware Assistance:** Standard web-based chats lack the context of a developer's current work. Through its VS Code companion extension, the Gemini CLI can access information about the user's workspace, enabling more relevant and context-aware responses.

## What are its main features?

The Gemini CLI is a feature-rich tool designed for professional developers.

*   **Interactive and Non-Interactive Modes:** It offers both a rich, interactive chat interface for direct use and a non-interactive mode for integration with scripts and automated processes.
*   **IDE Integration:** Connects seamlessly with a companion VS Code extension to gain a deeper understanding of the user's workspace and provide more contextual assistance.
*   **Sandboxed Code Execution:** A critical security feature that allows the CLI to run generated code and commands in a safe, isolated sandbox.
*   **Extensible Tool System:** The CLI's capabilities can be augmented through an extension system, allowing for the addition of new tools and commands.
*   **Flexible Authentication:** Supports various authentication methods to suit different environments, including Google user logins (OAuth 2.0) and service accounts for automated systems.
*   **Advanced Configuration:** Highly configurable via command-line flags, configuration files at the user and project level, and environment variables.
*   **Rich Terminal UI:** The interactive mode is built with React and Ink, providing a modern, app-like experience in the terminal with features like themes, loading spinners, and structured output.
*   **Auto-Update Mechanism:** The CLI can check for new versions and perform automatic updates to ensure users have the latest features and security patches.
