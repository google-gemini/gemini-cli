# Gemini CLI Architecture Overview

This document provides a high-level overview of the Gemini CLI's architecture.

## Core components

The Gemini CLI is primarily composed of two main packages, along with a suite of tools that can be used by the system in the course of handling command-line input:

1.  **CLI package (`packages/cli`):**
    - **Purpose:** This contains the user-facing portion of the Gemini CLI, such as handling the initial user input, presenting the final output, and managing the overall user experience.
    - **Key functions contained in the package:**
      - [Input processing](./cli/commands.md)
      - History management
      - Display rendering
      - [Theme and UI customization](./cli/themes.md)
      - [CLI configuration settings](./cli/configuration.md)

2.  **Core package (`packages/core`):**
    - **Purpose:** This acts as the backend for the Gemini CLI. It receives requests sent from `packages/cli`, orchestrates interactions with the Gemini API, and manages the execution of available tools.
    - **Key functions contained in the package:**
      - API client for communicating with the Google Gemini API
      - Prompt construction and management
      - Tool registration and execution logic
      - State management for conversations or sessions
      - Server-side configuration

3.  **Tools (`packages/core/src/tools/`):**
    - **Purpose:** These are individual modules that extend the capabilities of the Gemini model, allowing it to interact with the local environment (e.g., file system, shell commands, web fetching).
    - **Interaction:** `packages/core` invokes these tools based on requests from the Gemini model.

## Interaction Flow

A typical interaction with the Gemini CLI follows this flow:

1.  **User input:** The user types a prompt or command into the terminal, which is managed by `packages/cli`.
2.  **Request to core:** `packages/cli` sends the user's input to `packages/core`.
3.  **Request processed:** The core package:
    - Constructs an appropriate prompt for the Gemini API, possibly including conversation history and available tool definitions.
    - Sends the prompt to the Gemini API.
4.  **Gemini API response:** The Gemini API processes the prompt and returns a response. This response might be a direct answer or a request to use one of the available tools.
5.  **Tool execution (if applicable):**
    - When the Gemini API requests a tool, the core package prepares to execute it.
    - If the requested tool can modify the file system or execute shell commands, the user is first given details of the tool and its arguments, and the user must approve the execution.
    - Read-only operations, such as reading files, might not require explicit user confirmation to proceed.
    - Once confirmed, or if confirmation is not required, the core package executes the relevant action within the relevant tool, and the result is sent back to the Gemini API by the core package.
    - The Gemini API processes the tool result and generates a final response.
6.  **Response to CLI:** The core package sends the final response back to the CLI package.
7.  **Display to user:** The CLI package formats and displays the response to the user in the terminal.

## Key Design Principles

- **Modularity:** The clear separation between the CLI (frontend) and Core (backend) packages promotes independent development, easier maintenance, and allows for potential future extensions (e.g., alternative frontends interacting with the same Core logic).
- **Extensibility:** The robust tool system is designed for easy extension, enabling the addition of new capabilities and integrations with external systems (e.g., via MCP servers).
- **User Experience (UX):** A primary focus is on delivering a rich, interactive, and intuitive terminal experience, making AI-powered coding assistance seamless and efficient.
- **Security:** Critical operations, especially those involving file system modifications or shell command execution, are designed with security in mind, often incorporating user confirmation and sandboxing mechanisms to protect the host system.

## Technology Stack

The Gemini CLI is built upon a modern and efficient technology stack, primarily leveraging:

- **Node.js:** The runtime environment for both the CLI and Core packages.
- **TypeScript:** Ensures type safety, improves code quality, and enhances developer productivity across the entire codebase.
- **React (with Ink):** Used for building the interactive command-line interface, providing a rich and responsive user experience within the terminal.
- **esbuild:** A fast bundler used for packaging the application for distribution and efficient execution.
- **Git:** Integrated for version control, especially for features like checkpointing and file filtering.
- **Docker/Podman:** Utilized for container-based sandboxing, providing isolated environments for tool execution.
