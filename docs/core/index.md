# Gemini CLI Core

The Gemini CLI Core (`packages/core`) acts as the backend engine for the Gemini CLI, handling communication with the Gemini API, managing tools, and processing requests from the CLI client. For a general overview of the Gemini CLI, see the [main documentation page](../index.md).

## Navigating this Section

- **[Core Configuration](../cli/configuration.md):** Details on how to configure the core component, including environment variables and specific settings.
- **[Core Tools API](./tools-api.md):** Information on how tools are defined, registered, and used by the core.

## Role of the Core

The core package is a crucial part of the Gemini CLI ecosystem. While the CLI (`packages/cli`) provides the user interface, the core is responsible for:

- **API Interaction:** Securely communicating with the Google Gemini API, sending user prompts, and receiving model responses.
- **Prompt Engineering:** Constructing effective prompts for the Gemini model, potentially incorporating conversation history, tool definitions, and instructional context from `GEMINI.md` files.
- **Tool Management & Orchestration:**
  - Registering available tools (e.g., file system tools, shell command execution).
  - Interpreting tool use requests from the Gemini model.
  - Executing the requested tools with the provided arguments.
  - Returning tool execution results to the Gemini model for further processing.
- **Session and State Management:** Keeping track of the conversation state, including history and any relevant context required for coherent interactions.
- **Configuration:** Managing core-specific configurations, such as API key access, model selection, and tool settings.

## Key Components and Functionality

While the exact implementation details are within the `packages/core/src/` directory, key conceptual components include:

- **API Client** (`client.ts`): A module responsible for making HTTP requests to the Gemini API, handling authentication, and parsing responses.
- **Prompt Management** (`prompts.ts`): Logic for creating and formatting the prompts sent to the Gemini model. This includes integrating user queries, historical context, and tool specifications.
- **Tool Registry and Execution** (`tool-registry.ts`, `tools.ts`, individual tool files like `read-file.ts`, `shell.ts`):
  - A system for discovering, registering, and describing available tools to the Gemini model.
  - Code for executing each tool safely and effectively, often involving interaction with the operating system or external services.
- **Configuration (`config.ts`):** Handles loading and providing access to core-side configurations, including API keys, model choices, and potentially tool-specific settings.
- **Turn Management (`turn.ts`):** Manages the flow of a single conversational turn, from receiving user input to generating a final response, potentially involving multiple tool calls.

## Interaction with the CLI

The CLI and Core typically communicate over a local interface (e.g., standard input/output, or a local network connection if designed for broader use, though the current structure suggests a tightly coupled Node.js application).

1.  The CLI captures user input and forwards it to the Core.
2.  The Core processes the input, interacts with the Gemini API and tools as needed.
3.  The Core sends responses (text, tool calls, errors) back to the CLI.
4.  The CLI formats and displays these responses to the user.

## Security Considerations

The core plays a vital role in security:

- **API Key Management:** It handles the `GEMINI_API_KEY` and ensures it is used securely when communicating with the Gemini API.
- **Tool Execution:** When tools interact with the local system (e.g., `run_shell_command`), the core (and its underlying tool implementations) must do so with appropriate caution, often involving sandboxing mechanisms to prevent unintended side effects.

## Chat History Compression

To ensure that long conversations don't exceed the token limits of the Gemini model, the CLI includes a chat history compression feature.

When a conversation approaches the token limit for the configured model, the CLI will automatically compress the conversation history before sending it to the model. This compression is designed to be lossless in terms of the information conveyed, but it reduces the overall number of tokens used.

You can find the token limits for each model in the [Google AI documentation](https://ai.google.dev/gemini-api/docs/models).

## Model Fallback

The Gemini CLI includes a model fallback mechanism to ensure that you can continue to use the CLI even if the default "pro" model is rate-limited.

If you are using the default "pro" model and the CLI detects that you are being rate-limited, it will automatically switch to the "flash" model for the current session. This allows you to continue working without interruption.

## File Discovery Service

The file discovery service is responsible for finding files in the project that are relevant to the current context. It is used by the `@` command and other tools that need to access files.

## Memory Discovery Service

The memory discovery service is responsible for finding and loading the `GEMINI.md` files that provide context to the model. It searches for these files in a hierarchical manner, starting from the current working directory and moving up to the project root and the user's home directory. It also searches in subdirectories.

This allows you to have global, project-level, and component-level context files, which are all combined to provide the model with the most relevant information.

You can use the `/memory show` command to see the combined content of all loaded `GEMINI.md` files, and the `/memory refresh` command to reload them.
