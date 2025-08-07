# A2A Protocol Compliance Evaluation for gemini-cli-run

## 1. Introduction

This document evaluates the `@gemini-cli-run` ecosystem's compliance with the Agent-to-Agent (A2A) protocol specification. The goal is to determine how `gemini-cli-run` agents can be treated as A2A-compliant agents and to identify any gaps that need to be addressed.

## 2. Analysis

I will now analyze the `gemini-cli-run` codebase, comparing its implementation to the key requirements of the A2A protocol specification.

### 2.1. Agent Card

**Compliance:** Partial

*   **What exists:** The `gemini-cli-run` agent does not currently expose a `/.well-known/agent-card.json` endpoint. However, the necessary information to construct an Agent Card is available within the agent's configuration and code.
*   **Gaps:** A dedicated endpoint needs to be created that serves an Agent Card. This endpoint should dynamically generate the card based on the agent's configuration, including its name, skills (which can be derived from the registered tools), and any authentication requirements.

### 2.2. Transport

**Compliance:** High

*   **What exists:** The `gemini-cli-run` agent exposes a REST API over HTTP, which is a compliant A2A transport.
*   **Gaps:** None. The existing API can be adapted to serve the A2A endpoints.

### 2.3. Endpoints

**Compliance:** Partial

*   **What exists:** The `gemini-cli-run` agent has the following endpoints that can be mapped to the A2A specification:
    *   `POST /message`: Can be adapted to handle A2A `sendMessage` requests.
    *   `GET /`: Can be adapted to handle A2A `getTask` requests.
    *   `POST /cancel`: Can be adapted to handle A2A `cancelTask` requests.
*   **Gaps:** The existing endpoints need to be modified to accept and respond with the A2A-specified data objects. Additionally, a new endpoint for `getAgentCard` needs to be created.

### 2.4. Data Objects

**Compliance:** Low

*   **What exists:** The `gemini-cli-run` agent uses its own internal data models for tasks and messages, defined with `zod` in `@gemini-cli-run/core`.
*   **Gaps:** The agent needs to be updated to use the A2A-specified data objects for all A2A communication. This will involve creating new data models that align with the A2A specification and updating the API endpoints to use them.

### 2.5. Authentication

**Compliance:** High

*   **What exists:** The `AgentManager` in `@gemini-cli-run/core` already has robust authentication mechanisms for interacting with Google Cloud services, including support for Workload Identity Federation.
*   **Gaps:** This existing authentication logic can be leveraged to secure the A2A endpoints. The Agent Card should be updated to reflect the authentication requirements of the agent.

## 3. Recommendations

To make `gemini-cli-run` agents fully A2A-compliant, the following changes are recommended:

1.  **Create an `A2AController`:** Create a new controller in the `@gemini-cli-run/agent` package that is specifically responsible for handling A2A requests. This controller will implement the A2A endpoints and use the A2A data objects.
2.  **Implement the `/agent-card` Endpoint:** Create a new endpoint that serves a dynamically generated Agent Card.
3.  **Adapt Existing Endpoints:** Adapt the existing `message`, `getTask`, and `cancelTask` endpoints to be A2A-compliant.
4.  **Implement A2A Data Objects:** Create new data models that align with the A2A specification.
5.  **Leverage Existing Authentication:** Use the existing authentication mechanisms to secure the A2A endpoints.

By implementing these changes, we can ensure that `gemini-cli-run` agents can seamlessly interoperate with other A2A-compliant agents, unlocking a new level of extensibility and power for the Gemini CLI ecosystem.
