# Welcome to the Gemini CLI Documentation

This documentation provides a comprehensive guide to installing, using, and developing the Gemini CLI tool. Gemini CLI allows you to interact with Gemini models through a powerful and flexible command-line interface.

## Overview

The Gemini CLI is a tool designed to bring the capabilities of Gemini models to your terminal. It consists of a client-side application (`packages/cli`) that communicates with a local server (`packages/core`), which in turn interacts with the Gemini API. The CLI supports a variety of tools for file system operations, code execution, web fetching, and more, enhancing your workflow with AI-powered assistance.

The `packages/cli` is the primary way users interact with the Gemini AI model and its associated tools directly from their terminal. It offers an interactive Read-Eval-Print Loop (REPL) environment where you can send prompts to Gemini, receive responses, and see the results of any tools Gemini uses to fulfill your requests.

The `packages/core` acts as the backend engine, handling communication with the Gemini API, managing tools, and processing requests from the CLI client.

## Navigating the Documentation

This documentation is organized into the following sections:

- **[Architecture Overview](./architecture.md):** Understand the high-level design of the Gemini CLI, including its core components and how they interact.
- **CLI Usage:**
  - **[CLI Introduction](./cli/index.md):** An overview of the command-line interface.
  - **[Commands](./cli/commands.md):** Detailed descriptions of all available CLI commands.
  - **[Configuration](./cli/configuration.md):** How to configure the CLI.
  - **[Extensions](./extension.md):** How to extend the CLI with new functionality.
- **Core Details:**
  - **[Core Introduction](./core/index.md):** An overview of the core component.
  - **[Configuration](./core/configuration.md):** How to configure the core.
  - **[Tools API](./core/tools-api.md):** Information on how the core manages and exposes tools.
- **Tools:**
  - **[Tools Overview](./tools/index.md):** A general look at the available tools.
  - **[File System Tools](./tools/file-system.md):** Documentation for tools like `read_file`, `write_file`, etc.
  - **[Shell Tool](./tools/shell.md):** Using the `run_shell_command` tool.
  - **[Web Fetch Tool](./tools/web-fetch.md):** Using the `web_fetch` tool.
  - **[Web Search Tool](./tools/web-search.md):** Using the `google_web_search` tool.
  - **[Multi-File Read Tool](./tools/multi-file.md):** Using the `read_many_files` tool.
- **[Contributing & Development Guide](../CONTRIBUTING.md):** Information for contributors and developers, including setup, building, testing, and coding conventions.
- **[Troubleshooting Guide](./troubleshooting.md):** Find solutions to common problems and FAQs.

We hope this documentation helps you make the most of the Gemini CLI!
