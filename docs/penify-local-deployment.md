# Local deployment and testing

This guide walks you through running Gemini CLI from source on your machine and
validating it with tests. It is intended for contributors and anyone who needs
full control over a local build.

## 0) Prerequisites

1. Install Node.js 20 or newer.
2. Install npm (bundled with Node.js) and Git.
3. Optional but recommended for sandbox and integration tests:
   - Docker or Podman
4. Optional if you plan to use Google login (OAuth):
   - `gcloud` CLI authenticated with your Google account

## 1) Get the source

1. Clone the repository:

   ```bash
   git clone https://github.com/google-gemini/gemini-cli.git
   ```

2. Move into the repo:

   ```bash
   cd gemini-cli
   ```

3. (Optional) Create a working branch:

   ```bash
   git checkout -b local-dev
   ```

## 2) Install dependencies

1. Install pinned dependencies (recommended):

   ```bash
   npm ci
   ```

2. If you modify `package-lock.json`, use `npm install` instead:

   ```bash
   npm install
   ```

## 3) Build the project

1. Build all workspaces:

   ```bash
   npm run build
   ```

2. (Optional) Build a single workspace when iterating:

   ```bash
   npm run build --workspace @google/gemini-cli-core
   npm run build --workspace @google/gemini-cli
   ```

The build outputs are written to `packages/*/dist`.

## 4) Configure authentication (required to call real models)

Choose one of the following.

### Option A: Gemini API key

```bash
export GEMINI_API_KEY="YOUR_GEMINI_API_KEY"
```

### Option B: Vertex AI API key

```bash
export GOOGLE_API_KEY="YOUR_VERTEX_API_KEY"
export GOOGLE_CLOUD_PROJECT="YOUR_GCP_PROJECT_ID"
export GOOGLE_CLOUD_LOCATION="us-central1"
export GOOGLE_GENAI_USE_VERTEXAI="true"
```

Use `GOOGLE_GENAI_USE_VERTEXAI=true` to force Vertex AI in non-interactive runs.

### Option C: Login with Google (OAuth)

1. Start the CLI (see section 6).
2. Choose **Login with Google** when prompted.

For non-interactive runs, you can set `GOOGLE_GENAI_USE_GCA=true` to force
Google-auth-based flows.

For details, see `docs/get-started/authentication.md`.

## 5) Configure a local gateway (optional)

If you are running a local gateway (for example, at `http://localhost:8787`),
set the gateway environment variable before starting the CLI:

```bash
export GEMINI_CLI_GATEWAY_URL="http://localhost:8787"
```

You can also set a per-provider base URL with:

```bash
export GEMINI_CLI_GEMINI_BASE_URL="http://localhost:8787"
export GEMINI_CLI_VERTEX_BASE_URL="http://localhost:8787"
```

For full details, see `how-to-configure.md`.

## 6) Run Gemini CLI locally

You have three common options. All use your local source tree.

### Option A: Dev mode (fast iteration)

1. Build once if you have not already:

   ```bash
   npm run build
   ```

2. Start the CLI:

   ```bash
   npm run start
   ```

3. Run a single prompt (non-interactive) if needed:

   ```bash
   npm run start -- -p "Hello from local build"
   ```

4. After changing TypeScript in `packages/cli` or `packages/core`, rebuild:

   ```bash
   npm run build
   ```

### Option B: Linked package (production-like `gemini` command)

1. Build the packages:

   ```bash
   npm run build
   ```

2. Link the CLI package globally:

   ```bash
   npm link packages/cli
   ```

3. Run it as a normal binary:

   ```bash
   gemini
   ```

4. When you change code, re-run `npm run build` to refresh `dist`.

5. To remove the link later:

   ```bash
   npm unlink -g @google/gemini-cli
   ```

### Option C: Bundled build (closest to release packaging)

1. Build the bundle:

   ```bash
   npm run bundle
   ```

2. Run the bundled CLI:

   ```bash
   node bundle/gemini.js
   ```

3. Re-run `npm run bundle` after code changes.

## 7) Smoke test the gateway (optional)

Use this if you are running a local gateway and want to verify traffic flows
through it.

1. Start your gateway and verify it is listening on the URL you plan to use.
2. In a new terminal, export the gateway URL and a trace header:

   ```bash
   export GEMINI_CLI_GATEWAY_URL="http://localhost:8787"
   export GEMINI_CLI_CUSTOM_HEADERS="X-Trace-Id: local-gateway-smoke"
   ```

3. Run a single prompt:

   ```bash
   npm run start -- -p "Hello from the gateway smoke test"
   ```

4. Check your gateway logs for the `X-Trace-Id` header and confirm the request
   reached the expected upstream (Gemini or Vertex).

## 8) Run tests locally

### 8.1 Unit tests (all packages)

```bash
npm run test
```

### 8.2 Unit tests (single workspace)

```bash
npm run test --workspace @google/gemini-cli-core
npm run test --workspace @google/gemini-cli
```

### 8.3 Lint and typecheck

```bash
npm run lint
npm run typecheck
```

### 8.4 Integration tests (end-to-end)

1. Build the bundle used by the integration test runner:

   ```bash
   npm run bundle
   ```

2. Run integration tests without sandboxing:

   ```bash
   npm run test:integration:sandbox:none
   ```

3. Run integration tests in Docker (requires Docker):

   ```bash
   npm run test:integration:sandbox:docker
   ```

4. Run integration tests in Podman (requires Podman):

   ```bash
   npm run test:integration:sandbox:podman
   ```

More details live in `docs/integration-tests.md`.

## 9) Troubleshooting tips

- If `npm run start` warns about stale builds, re-run `npm run build`.
- If the CLI cannot authenticate, double-check your API keys or Google login.
- If the gateway is not hit, verify `GEMINI_CLI_GATEWAY_URL` and your gateway
  logs.
- If integration tests fail, re-run with `KEEP_OUTPUT=true` to inspect artifacts:

  ```bash
  KEEP_OUTPUT=true npm run test:integration:sandbox:none
  ```
