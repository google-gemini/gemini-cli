# A2A Master Integration Plan

## 1. Introduction

This document outlines a comprehensive strategy for integrating the A2A protocol into the Gemini CLI ecosystem. This plan prioritizes building A2A capabilities into the core `gemini-cli` first, allowing `gemini-cli-run` and other components to inherit and extend these capabilities. This approach promotes code reuse, consistency, and maintainability.

## 2. Background

The A2A protocol is a standardized communication protocol that enables interoperability between AI agents. Key concepts include:

*   **Agent Card:** A discoverable JSON file (`/.well-known/agent-card.json`) that describes an agent's capabilities, including its name, skills, and authentication requirements.
*   **Skills:** Specific functions or capabilities that an agent exposes.
*   **Tasks:** Long-running operations initiated by sending a message to an agent. Tasks have a lifecycle and can be queried for their status.
*   **Messages:** The primary means of communication, containing text, data, or file parts.

## 3. Phase 1: Enhance `@google/gemini-cli-core` with A2A Foundation

The first phase will focus on building a reusable, core A2A library within the `gemini-cli` itself.

### 3.1. Define A2A Data Models and Schemas

*   **Action:** We will add `@a2a-js/sdk` as a dependency to `@google/gemini-cli-core`. This will provide the TypeScript `type` and `interface` definitions for all A2A data models, which will be used for compile-time type safety. The canonical type definitions can be found at: [https://github.com/a2aproject/a2a-js/blob/main/src/types.ts](https://github.com/a2aproject/a2a-js/blob/main/src/types.ts).

    In addition to the TypeScript types, we will create a new file in `@google/gemini-cli-core` (e.g., `src/a2a/a2a-schemas.ts`) to define **Zod schemas** that mirror these A2A data models. This is critical for runtime validation of incoming requests on the server-side (`@gemini-cli-run/agent`).

*   **Outcome:** The Gemini CLI ecosystem will have a single, authoritative source for both compile-time A2A types and runtime A2A validation schemas, ensuring consistency, interoperability, and robustness.

### 3.2. Implement `A2AClientService`

*   **Action:** Implement a client-side `A2AClientService` within `@google/gemini-cli-core`. This service will be responsible for all client-side A2A interactions.
*   **Outcome:** A reusable, client-focused service that can be consumed by any part of the `gemini-cli`.

## 4. `A2AClientService` Implementation Details

### 4.1. Native Support vs. MCP Server

We will implement the `A2AClientService` with **native support** within the Gemini CLI. This means that the A2A logic will be directly integrated into the CLI's codebase, rather than being exposed through a separate MCP server. This approach offers several advantages:

*   **Performance:** Native integration will be more performant than an MCP server, as it avoids the overhead of HTTP requests between the CLI and the server.
*   **Simplicity:** A native implementation will be simpler to maintain and debug, as all the code will be in a single repository.
*   **User Experience:** A native implementation will provide a more seamless user experience, as there will be no need to start and manage a separate server process.

### 4.2. `A2AClientService` Responsibilities

The `A2AClientService` will be responsible for the following:

*   **Agent Discovery:** Discovering agents via their Agent Card.
*   **Credential Management:** Securely storing and managing authentication tokens for different agents.
*   **Message Sending:** Sending messages to agents and creating tasks.
*   **Task Management:** Querying and canceling tasks.
*   **Context Management:** Managing the `contextId` for conversational context.

## 5. Phase 2: Implement A2A Client Functionality in `gemini-cli`

With the foundation in place, this phase will focus on making the `gemini-cli` application a fully-featured A2A client.

### 5.1. Implement `gemini a2a` Command Group

*   **Action:** Create the `gemini a2a` command group with the following subcommands:
    *   `gemini a2a discover <url>`: Discovers and displays the Agent Card from a given URL.
    *   `gemini a2a register <url> [--name <name>] [--token <token>]`: Registers a new agent, optionally with a custom name and authentication token.
    *   `gemini a2a unregister <name>`: Removes a registered agent.
    *   `gemini a2a list`: Lists all registered agents.
    *   `gemini a2a chat <agent_name>`: Starts an interactive chat session with a registered agent.
    *   `gemini a2a task send <agent_name> <prompt>`: Sends a one-off task to a registered agent.
    *   `gemini a2a task get <task_id>`: Checks the status of a task.
    *   `gemini a2a task cancel <task_id>`: Cancels a task.
*   **Outcome:** These commands will use the `A2AClientService` from `@google/gemini-cli-core` to provide a rich, intuitive command-line interface for interacting with A2A agents.

### 5.2. Develop Interactive Chat Mode

*   **Action:** Build the `gemini a2a chat <agent_name>` command to provide an interactive chat experience similar to the existing `gemini chat` command.
*   **Outcome:** A seamless, conversational way for users to interact with A2A agents directly from their terminal.

### 5.3. Integrate with Task Management

*   **Action:** Integrate A2A task management with the existing Gemini CLI task management system.
*   **Outcome:** A unified view of all ongoing tasks, whether they are local, running on `@gemini-cli-run`, or A2A tasks.

### 5.4. Expose as a Tool

*   **Action:** The A2A service will also expose a tool to the Gemini CLI that allows the model to discover and interact with registered A2A agents.
*   **Outcome:** This will enable the Gemini CLI to act as a "meta-agent," delegating tasks to other specialized agents as needed.

## 6. Phase 3: Make `@gemini-cli-run/agent` an A2A-Compliant Server

This final phase will focus on exposing `gemini-cli-run` agents as A2A-compliant servers.

### 6.1. Import A2A Dependencies

*   **Action:** The `@gemini-cli-run/agent` package will add `@google/gemini-cli-core` as a dependency to get access to the A2A data models, schemas, and utilities.

### 6.2. Implement A2A Server Endpoints

*   **Action:** Create a new `A2AController` in the `@gemini-cli-run/agent`'s Express.js server. This controller will implement the server-side A2A endpoints:
    *   `GET /.well-known/agent-card.json`
    *   `POST /sendMessage`
    *   `GET /getTask`
    *   `POST /cancelTask`
*   **Outcome:** The controller will translate incoming A2A requests into actions for the internal `Agent` class and respond with the A2A-compliant data objects, making every `gemini-cli-run` instance a fully compliant A2A agent.

## 7. Conclusion

This master plan provides a robust and scalable path for A2A integration. By building the foundation into the core `gemini-cli`, we ensure a consistent and maintainable implementation that will benefit the entire Gemini CLI ecosystem.
