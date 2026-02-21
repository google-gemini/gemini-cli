# Gemini CLI Architecture Overview

> **Highlights**

> - Modular orchestration between local environment, Gemini LLM, and secure
>   sandbox
> - Extensible with custom drivers and AI providers
> - Principle of Least Privilege for security
> - Real-time streaming and tool calling
> - Trusted Folder logic for safe execution

---

## High-Level Design

Gemini CLI acts as an orchestration layer connecting:

- The user's local environment
- The Gemini LLM (via Google AI SDK)
- A secure execution sandbox

Its modular design allows for pluggable "drivers" (sandboxing strategies) and
"providers" (AI model connectors).

---

## Core Components

### 1. Controller (Core Logic)

- **Command Parsing:** Uses yargs or similar to interpret CLI flags (e.g., `-s`
  for sandboxing).
- **Context Management:** Collects local file data, git state, and environment
  variables to ground the AI.
- **Prompt Engineering:** Formats user input into structured prompts for optimal
  model performance.

### 2. Provider Layer (AI Connector)

- **API Abstraction:** Handles communication with the Gemini API.
- **Streaming:** Supports real-time token streaming for responsive UI.
- **Tool Calling:** Maps AI-generated function calls to local scripts or
  internal commands.

### 3. Execution Engine (Sandbox)

- **Driver Strategy:** Switches between Seatbelt (macOS), Docker/Podman
  (Linux/Windows), or Native (no sandbox).
- **Volume Mapping:** Mounts only necessary project directories to prevent
  directory climbing attacks.

---

## System Data Flow

A typical "Analyze and Fix" request:

1. **Ingestion:** CLI reads `settings.json` and targeted files.
2. **Context Construction:** Controller bundles file content with system
   instructions.
3. **Inference:** Bundled prompt sent to Gemini API.
4. **Action Selection:**
   - If model returns text, render to stdout.
   - If model returns a tool call (e.g., `run_test`), Execution Engine triggers
     sandbox.
5. **Feedback Loop:** Output from sandboxed command is fed back to the model to
   verify the fix.

---

## Security Model

Gemini CLI follows the Principle of Least Privilege:

- **Network:** Sandbox is restricted from outbound calls unless configured.
- **Filesystem:** Uses Trusted Folder logic; commands execute only in
  whitelisted directories.
- **Telemetry:** Sensitive data (API keys, file paths) is stripped before
  sending diagnostics to Google.

---

# Gemini CLI Architecture Overview

**Highlights**

- Modular orchestration between local environment, Gemini LLM, and secure
  sandbox
- Extensible with custom drivers and AI providers
- Principle of Least Privilege for security
- Real-time streaming and tool calling
- Trusted Folder logic for safe execution

---

## High-Level Design

Gemini CLI acts as an orchestration layer connecting:

- The user's local environment
- The Gemini LLM (via Google AI SDK)
- A secure execution sandbox

Its modular design allows for pluggable "drivers" (sandboxing strategies) and
"providers" (AI model connectors).

---

## Core Components

### 1. Controller (Core Logic)

- **Command Parsing:** Uses yargs or similar to interpret CLI flags (e.g., `-s`
  for sandboxing).
- **Context Management:** Collects local file data, git state, and environment
  variables to ground the AI.
- **Prompt Engineering:** Formats user input into structured prompts for optimal
  model performance.

### 2. Provider Layer (AI Connector)

- **API Abstraction:** Handles communication with the Gemini API.
- **Streaming:** Supports real-time token streaming for responsive UI.
- **Tool Calling:** Maps AI-generated function calls to local scripts or
  internal commands.

### 3. Execution Engine (Sandbox)

- **Driver Strategy:** Switches between Seatbelt (macOS), Docker/Podman
  (Linux/Windows), or Native (no sandbox).
- **Volume Mapping:** Mounts only necessary project directories to prevent
  directory climbing attacks.

---

## System Data Flow

A typical "Analyze and Fix" request:

1. **Ingestion:** CLI reads `settings.json` and targeted files.
2. **Context Construction:** Controller bundles file content with system
   instructions.
3. **Inference:** Bundled prompt sent to Gemini API.
4. **Action Selection:**
   - If model returns text, render to stdout.
   - If model returns a tool call (e.g., `run_test`), Execution Engine triggers
     sandbox.
5. **Feedback Loop:** Output from sandboxed command is fed back to the model to
   verify the fix.

---

## Security Model

Gemini CLI follows the Principle of Least Privilege:

- **Network:** Sandbox is restricted from outbound calls unless configured.
- **Filesystem:** Uses Trusted Folder logic; commands execute only in
  whitelisted directories.
- **Telemetry:** Sensitive data (API keys, file paths) is stripped before
  sending diagnostics to Google.
