# Gemini CLI installation, execution, and deployment

This document provides an overview of Gemini CLI's sytem requriements,
installation methods, and release types.

## System requirements

- **Operating System:**
  - macOS 16+
  - Windows 10.0.26100+
  - Ubuntu 20.04+
- **Runtime:** Node.js 20.0.0+
- **Shell:** Bash or Zsh recommended
- **Location:**
  [Gemini Code Assist supported locations](https://developers.google.com/gemini-code-assist/resources/available-locations#americas)
- **Internet connection required**

Gemini CLI comes pre-installed on
[**Cloud Shell**](https://docs.cloud.google.com/shell/docs) and
[**Cloud Workstations**](https://cloud.google.com/workstations).

## How to install and/or run Gemini CLI

There are several ways to run Gemini CLI. The recommended option depends on how
you intend to use Gemini CLI.

- As a standard installation. This is the most straightforward method of using
  Gemini CLI.
- In a sandbox. This method offers increased security and isolation.
- From the source. This is recommended for contributors to the project.

### 1. Standard installation (recommended for most users)

This is the recommended way for end-users to install Gemini CLI. It involves
downloading the Gemini CLI package from the NPM registry.

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

### 2. Run in a sandbox (Docker/Podman)

For security and isolation, Gemini CLI can be run inside a container. This is
the default way that the CLI executes tools that might have side effects.

- **Directly from the registry:** You can run the published sandbox image
  directly. This is useful for environments where you only have Docker and want
  to run the CLI.
  ```bash
  # Run the published sandbox image
  docker run --rm -it us-docker.pkg.dev/gemini-code-dev/gemini-cli/sandbox:0.1.1
  ```
- **Using the `--sandbox` flag:** If you have Gemini CLI installed locally
  (using the standard installation described above), you can instruct it to run
  inside the sandbox container.
  ```bash
  gemini --sandbox -y -p "your prompt here"
  ```

### 3. Run from source (recommended for Gemini CLI contributors)

Contributors to the project will want to run the CLI directly from the source
code.

- **Development mode:** This method provides hot-reloading and is useful for
  active development.
  ```bash
  # From the root of the repository
  npm run start
  ```
- **Production-like mode (linked package):** This method simulates a global
  installation by linking your local package. It's useful for testing a local
  build in a production workflow.

  ```bash
  # Link the local cli package to your global node_modules
  npm link packages/cli

  # Now you can run your local version using the `gemini` command
  gemini
  ```

### 4. Running the latest Gemini CLI commit from GitHub

You can run the most recently committed version of Gemini CLI directly from the
GitHub repository. This is useful for testing features still in development.

```bash
# Execute the CLI directly from the main branch on GitHub
npx https://github.com/google-gemini/gemini-cli
```
