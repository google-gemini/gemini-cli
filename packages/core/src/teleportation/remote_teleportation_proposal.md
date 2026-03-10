# Remote Teleportation Architecture Proposal

## Objective

Prevent leaking proprietary JetSki Protobuf schemas and decryption keys directly
within the public Gemini CLI bundle. When a user requests to resume a JetSki
trajectory, the CLI will interact with an external, secure, or isolated
converter to fetch the standard `ConversationRecord` JSON.

## Guarantees & Constraints

- No Protobuf definitions are packaged or visible in the Gemini CLI
  distribution.
- Telemetry/Decryption keys do not need to be hardcoded in the CLI.
- Conversion remains effortless and instantaneous for the end-user.
- **Strict Logic Confidentiality**: Proprietary conversion logic and Protobuf
  schemas cannot be readable or reverse-engineered by the user via local caches
  or easily accessible client-side code.

---

## Option 1: Local MCP Server (JetSki Daemon Extension)

Since Gemini CLI already natively supports the **Model Context Protocol (MCP)**,
we can utilize JetSki directly as an MCP provider.

### How it works

The JetSki extension (or its already running background daemon) can expose an
MCP tool, for example, `get_trajectory_history`. When the user runs `/resume`,
Gemini CLI invokes this tool via the standard MCP pipeline.

1.  **User runs `/resume`**: Gemini CLI lists available trajectories (it can
    list .pb files from the local directory or query the MCP server for a
    history list).
2.  **Conversation Selection**: The user selects a session.
3.  **MCP Tool Call**: Gemini calls the MCP tool
    `get_trajectory(filePath: string)`.
4.  **Local Conversion**: JetSki decrypts, parses, and returns the strictly
    CLI-compliant `HistoryItem` JSON payload over stdio/SSE.
5.  **No Overhead**: The CLI injects the payload directly into its state without
    ever touching a Protobuf.

### Effort & Trade-offs

- **Effort**: Very Low. Gemini CLI already supports MCP out of the box. No new
  endpoints, infrastructure, or routing is needed. We only need to write a small
  MCP server module using `@modelcontextprotocol/sdk` inside JetSki.
- **Pros**: Zero remote network latency; highly secure (stays on local machine);
  incredibly seamless.
- **Cons**: Requires the JetSki service to be installed and running in the
  background.

---

## Option 2: Stateless Cloud Function (API/Microservice)

Host the trajectory parsing logic completely server-side.

### How it works

1.  **User runs `/resume`**: The CLI scans local `.pb` trajectories.
2.  **Cloud Request**: The CLI sends a
    `POST https://api.exafunction.com/v1/teleport` request. The body contains
    the binary payload (and maybe an authorization token/key).
3.  **Cloud Conversion**: The cloud function decrypts, parses, and formats the
    trajectory.
4.  **Response**: The API responds with the `ConversationRecord` JSON.

### Effort & Trade-offs

- **Effort**: Medium. Requires setting up a secured API endpoint, likely using
  Google Cloud Functions or AWS Lambda.
- **Pros**: Completely decouples schema and keys from the end-user's device
  entirely. The conversion environment is completely under Exafunction's
  control.
- **Cons**: Network roundtrip latency whenever the user converts a session.
  Involves sending binary trajectory files (potentially containing source code
  snippets) over the network, which could be a privacy concern for some users.

---

## Option 3: Remote "Plugin" Loader (WASM / Transient Javascript)

The CLI downloads the interpreter on-demand, or runs it inside an isolated
Sandbox (like WebAssembly).

### How it works

1.  **On-Demand Download**: When `/resume` is first used, the CLI downloads a
    private, versioned conversion payload (e.g., `teleporter_v1.2.3.wasm` or an
    obfuscated JS bundle) from a secure URL and caches it locally.
2.  **Local Execution**: It runs this script locally to perform decryption and
    conversion.
3.  It keeps the schema out of the open-source CLI bundle, though a determined
    user could still reverse engineer the WASM/JS if they inspect their local
    caches.

### Effort & Trade-offs

- **Effort**: Medium-High. Requires robust WebAssembly compilation from the
  Protobuf definitions, or a dynamic code loading execution chain in Node.js
  that doesn't trigger security flags.
- **Pros**: Speed of local processing, decoupled from the main CLI installation.
- **Cons**: Adds complexity to the bundle distribution system.
- **Cons (Security)**: A determined user could reverse engineer the cached
  WebAssembly or obfuscated JS bundle to reconstruct the JetSki Protobuf schema,
  breaking the logic confidentiality requirement.

---

## Option 4: Remote MCP Server (via SSE)

A remote MCP server would bridge the user's local trajectory files with
Exafunction's parser inside a totally separate host.

### How it works

- We run an SSE MCP service on the Exafunction side.
- Instead of using stdio transport from a local background process (Option 1),
  the Gemini CLI establishes an SSE connection to
  `https://mcp.exafunction.com/sse`.
- The local CLI still queries the filesystem for the `.pb` trajectories.
- It invokes a remote tool: `parse_trajectory(trajectoryPb: string)` and passes
  the local protobuf string as the request argument.
- The remote server unmarshalls, decrypts, and maps the proprietary protobufs
  into the standard JSON response, which the CLI renders natively.

### Effort & Trade-offs

- **Effort**: Medium. Gemini CLI already supports SSE network transports for
  MCP. You would need to host an MCP SSE server remotely.
- **Pros**: Proprietary mapping logic, credentials, and Protobuf schemas are
  hosted totally remote and are decoupled from JetSki OR the CLI. Since it uses
  standard MCP, it requires absolutely no specialized HTTP routing or bespoke
  protocol headers in the CLI because Gemini naturally maps arguments
  dynamically already.
- **Cons**: High network latency (sending large Protobuf strings back and
  forth), privacy concerns because user code trajectories are being transmitted
  remotely.

---

## Recommendation

**Option 4 (Remote MCP)** or **Option 2 (Cloud Function Isolation)** is the
recommended production approach to ensure strict confidentiality.

By keeping the proprietary deserialization binary completely remote behind an
authentication layer, Gemini CLI ensures that end users cannot observe execution
state, trace unmarshalled arrays, or scrape proprietary JetSki Protobuf
primitives natively. If removing heavy network latency is the highest priority,
**Option 1 (JetSki Local MCP)** remains the most effortless and robust path
forward without modifying the open-source CLI distribution.
