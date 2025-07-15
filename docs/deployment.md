# Gemini CLI Execution and Deployment

This document describes how to run Gemini CLI and explains the deployment architecture that Gemini CLI uses.

## Running Gemini CLI

There are several ways to run Gemini CLI. The option you choose depends on how you intend to use Gemini CLI.

---

### 1. Standard installation (Recommended for typical users)

This is the recommended way for end-users to install Gemini CLI. It involves downloading the Gemini CLI package from the NPM registry.

- **Global install:**

  ```bash
  npm install -g @google/gemini-cli
  ```

  Then, run the CLI from anywhere:

  ```bash
  gemini
  ```

- **NPX execution:**

  ```bash
  # Execute the latest version from NPM without a global install
  npx @google/gemini-cli
  ```

---

### 2. Running in a sandbox (Docker/Podman)

For security and isolation, Gemini CLI can be run inside a container. This is the default way that the CLI executes tools that might have side effects.

- **Directly from the Registry:**
  You can run the published sandbox image directly. This is useful for environments where you only have Docker and want to run the CLI.
  ```bash
  # Run the published sandbox image
  docker run --rm -it us-docker.pkg.dev/gemini-code-dev/gemini-cli/sandbox:0.1.1
  ```
- **Using the `--sandbox` flag:**
  If you have Gemini CLI installed locally (using the standard installation described above), you can instruct it to run inside the sandbox container.
  ```bash
  gemini --sandbox -y -p "your prompt here"
  ```

---

### 3. Running from source (Recommended for Gemini CLI contributors)

Contributors to the project will want to run the CLI directly from the source code.

- **Development Mode:**
  This method provides hot-reloading and is useful for active development.
  ```bash
  # From the root of the repository
  npm run start
  ```
- **Production-like mode (Linked package):**
  This method simulates a global installation by linking your local package. It's useful for testing a local build in a production workflow.

  ```bash
  # Link the local cli package to your global node_modules
  npm link packages/cli

  # Now you can run your local version using the `gemini` command
  gemini
  ```

---

### 4. Running the latest Gemini CLI commit from GitHub

You can run the most recently committed version of Gemini CLI directly from the GitHub repository. This is useful for testing features still in development.

```bash
# Execute the CLI directly from the main branch on GitHub
npx https://github.com/google-gemini/gemini-cli
```

## Deployment architecture

The execution methods described above are made possible by the following architectural components and processes:

**NPM packages**

Gemini CLI project is a monorepo that publishes two core packages to the NPM registry:

- `@google/gemini-cli-core`: The backend, handling logic and tool execution.
- `@google/gemini-cli`: The user-facing frontend.

These packages are used when performing the standard installation and when running Gemini CLI from the source.

**Build and packaging processes**

There are two distinct build processes used, depending on the distribution channel:

- **NPM publication:** For publishing to the NPM registry, the TypeScript source code in `@google/gemini-cli-core` and `@google/gemini-cli` is transpiled into standard JavaScript using the TypeScript Compiler (`tsc`). The resulting `dist/` directory is what gets published in the NPM package. This is a standard approach for TypeScript libraries.

- **GitHub `npx` execution:** When running the latest version of Gemini CLI directly from GitHub, a different process is triggered by the `prepare` script in `package.json`. This script uses `esbuild` to bundle the entire application and its dependencies into a single, self-contained JavaScript file. This bundle is created on-the-fly on the user's machine and is not checked into the repository.

**Docker sandbox image**

The Docker-based execution method is supported by the `gemini-cli-sandbox` container image. This image is published to a container registry and contains a pre-installed, global version of Gemini CLI.

## Release process

The release process is automated through GitHub Actions. The release workflow performs the following actions:

1.  Build the NPM packages using `tsc`.
2.  Publish the NPM packages to the artifact registry.
3.  Create GitHub releases with bundled assets.
