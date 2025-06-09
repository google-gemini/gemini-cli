# Gemini CLI Execution and Deployment

This document outlines the various methods for running the Gemini CLI and the deployment architecture that supports them. Understanding these options is crucial for both users and developers.

## How to Run the Gemini CLI

There are several ways to run the Gemini CLI, each catering to different needs, from stable end-user consumption to active development and testing.

---

### 1. Standard Installation (Recommended for Users)

This is the most common and recommended way for end-users to run the Gemini CLI. It involves installing the CLI from the NPM registry.

- **Global Install:**

  ```bash
  # Install the CLI globally
  npm install -g @gemini-cli/cli

  # Now you can run the CLI from anywhere
  gemini
  ```

- **NPX Execution:**
  ```bash
  # Execute the latest version from NPM without a global install
  npx @gemini-cli/cli
  ```

**Underlying Mechanism:** Both of these methods download the `@gemini-cli/cli` package from NPM. This package contains the application's source code transpiled into JavaScript using the TypeScript Compiler (tsc), which is then run by the Node.js runtime.

---

### 2. Running in a Sandbox (Docker/Podman)

For security and isolation, the Gemini CLI can be run inside a container. This is the default way that the CLI executes tools that might have side effects.

- **Directly from the Registry:**
  You can run the published sandbox image directly. This is useful for environments where you only have Docker and want to run the CLI.
  ```bash
  # Run the published sandbox image
  docker run --rm -it us-docker.pkg.dev/gemini-code-dev/gemini-cli/sandbox:0.1.0
  ```
- **Using the `--sandbox` flag:**
  When you have the CLI installed locally (using the standard method above), you can instruct it to run itself inside the sandbox container.
  ```bash
  gemini --sandbox "your prompt here"
  ```

**Underlying Mechanism:** The CLI installed inside the sandbox is installed globally within the container image, in a similar fashion to the "Global Install" method. The local development sandbox is named `gemini-cli-sandbox`, while the published one has a longer, versioned name.

---

### 3. Running from Source (For Developers)

Contributors to the project will want to run the CLI directly from the source code.

- **Development Mode:**
  This method provides hot-reloading and is ideal for active development.
  ```bash
  # From the root of the repository
  npm run start
  ```
- **Production-like Mode (Linked Package):**
  This method simulates a global installation by linking your local package. It's useful for testing a local build in a production user workflow.

  ```bash
  # Link the local cli package to your global node_modules
  npm link packages/cli

  # Now you can run your local version using the `gemini` command
  gemini
  ```

---

### 4. Running the Latest Version from GitHub (Early Access)

You can run the very latest, unreleased version of the CLI directly from the GitHub repository. This is useful for testing cutting-edge features or bug fixes.

```bash
# Execute the CLI directly from the main branch on GitHub
npx https://github.com/google/gemini-cli
```

**Underlying Mechanism & Motivation:** This method was created for our early access program to provide a simple distribution mechanism for external testers who did not have access to our internal artifact registry. When you use `npx` with the GitHub repository URL, `npm` fetches the repository, runs the `prepare` script (which builds the application into a single, bundled file using `esbuild`), and then executes the newly built bundle. This happens on-the-fly on your machine.

## Deployment Architecture

The execution methods described above are made possible by the following architectural components and processes.

### 1. NPM Packages

The project is a monorepo that publishes two core packages to the NPM registry:

- `@gemini-cli/core`: The backend, handling logic and tool execution.
- `@gemini-cli/cli`: The user-facing frontend.

These packages are the foundation for the Standard Installation and Source-based execution methods.

### 2. Build and Packaging Processes

There are two distinct build processes used, depending on the distribution channel:

- **NPM Publication (`tsc`):** For publishing to the NPM registry, the TypeScript source code in `@gemini-cli/core` and `@gemini-cli/cli` is transpiled into standard JavaScript using the TypeScript Compiler (`tsc`). The resulting `dist/` directory is what gets published in the NPM package. This is a standard approach for TypeScript libraries.

- **GitHub `npx` Execution (`esbuild`):** For the `npx <github_repo>` use case, a different process is triggered by the `prepare` script in `package.json`. This script uses `esbuild` to bundle the entire application and its dependencies into a single, self-contained JavaScript file. This bundle is created on-the-fly on the user's machine and is not checked into the repository.

### 3. Docker Sandbox Image

The Docker-based execution method is supported by a container image (`gemini-cli-sandbox`). This image is published to a container registry and contains a pre-installed, global version of the CLI. The `scripts/prepare-cli-packagejson.js` script dynamically injects the URI of this image into the CLI's `package.json` before publishing, so the CLI knows which image to pull when the `--sandbox` flag is used.

## The Release Process

A unified script, `npm run publish:release`, orchestrates the entire release process, tying all the deployment methods together:

1.  **Builds** the NPM packages using `tsc`.
2.  **Updates** the CLI's `package.json` with the Docker image URI.
3.  **Builds and tags** the `gemini-cli-sandbox` Docker image.
4.  **Pushes** the Docker image to the container registry.
5.  **Publishes** the NPM packages to the artifact registry.

---

### Addendum: Bundling vs. Transpiling for Distribution

A consequence of the project's fast, iterative development is the use of two different build outputs: a multi-file distribution for NPM (`tsc`) and a single-file bundle for direct execution from GitHub (`esbuild`). While not a deliberate initial architectural decision, this addendum explores the trade-offs of each approach.

**Single-File Bundle (e.g., `esbuild`)**

This approach packages the entire application, including its dependencies, into one self-contained JavaScript file.

- **Pros:**

  - **Portability and Simplicity:** The entire application is a single file, making it extremely easy to distribute and execute. There are no external `node_modules` dependencies to manage, which eliminates a common source of versioning conflicts and "works on my machine" issues.
  - **Faster Execution for `npx`:** For one-off executions via `npx`, downloading and running a single file can be faster than `npm` resolving, downloading, and linking a complex dependency tree.
  - **Dependency Encapsulation:** All dependencies are locked into the bundle, ensuring that the application runs with the exact versions it was tested with. This prevents issues from unexpected updates to transitive dependencies.
  - **Optimized Footprint:** Bundlers can perform whole-program optimizations. Tree-shaking eliminates unused code from dependencies, and minification reduces the size of the final distributable binary, often resulting in a smaller total footprint than a comparable `node_modules` directory.

- **Cons:**
  - **Larger Initial Download:** The single file is necessarily larger than any individual file in a multi-file distribution, as it contains all dependencies.
  - **Dependency Duplication:** If a user has multiple tools that bundle the same dependencies (e.g., two different CLIs that both bundle `chalk`), those dependencies are downloaded and stored multiple times on their system, whereas `npm` would de-duplicate them.
  - **Slower Rebuilds:** Bundling can be a more complex and slower process than simple transpilation, which can affect development and CI/CD loop times.
  - **Lack of Transparency and Debugging Complexity:** The bundling process can obscure the relationship between the source code and the final output. Global Node.js or ECMAScript utilities that are expected to be defined can disappear, requiring unintuitive script injections (see this project's `esbuild.config.js`) to align the bundle's behavior with the source code's intent. Direct transpilation, in contrast, keeps the output closer to the source, often making it easier to debug discrepancies.
  - **A New Kind of Dependency Hell:** While bundling avoids `node_modules` conflicts, it introduces a new set of challenges. For instance, if a dependency relies on static assets (like `.wasm` or image files), the bundler may not know to include them. When the dependency then tries to reference these assets using file paths, the paths become invalid because everything has been packaged into a single file. This highlights how bundlers can make false assumptions about how nested dependencies expect to be used, trading one form of complexity for another.

**Multi-File Distribution (e.g., `tsc` with `package.json`)**

This is the standard approach for most NPM packages. The TypeScript code is transpiled to JavaScript, but dependencies are left as `import` statements, to be managed by the package manager (`npm`, `yarn`, etc.).

- **Pros:**

  - **Ecosystem Compatibility:** This is the standard, expected format for the NPM ecosystem. It works seamlessly with `npm`, `yarn`, and other package managers.
  - **Dependency Management:** `npm` handles dependency de-duplication and version resolution. This is highly efficient, as shared dependencies are stored only once.
  - **Transparency and Auditing:** It is easy for users to see the exact dependency tree (`npm ls`), audit for vulnerabilities (`npm audit`), and even override specific dependency versions if needed (`overrides` in `package.json`).
  - **Faster Incremental Builds:** `tsc` can perform faster incremental builds during development, as it only needs to re-transpile changed files.

- **Cons:**
  - **Dependency Hell:** The primary drawback. It can lead to complex dependency resolution issues, version conflicts, and a large `node_modules` directory.
  - **Slower `npx` Install:** For `npx`, resolving and installing the full dependency tree can be significantly slower than downloading a single pre-packaged file.
  - **"Works on my machine" issues:** Slight differences in dependency trees between environments can lead to subtle bugs.

**Build & Distribution Considerations**

The project currently maintains both systems to serve two distinct use cases:

1.  The **`tsc` build** is ideal for the stable, versioned **NPM release**, where users benefit from `npm`'s robust dependency management.
2.  The **`esbuild` bundle** is perfect for the **`npx <github_repo>`** scenario, providing a fast, portable, and hassle-free way for testers to run the latest version without a formal installation.

While the current dual-strategy provides a good experience for both end-users and developers/testers, the project would likely benefit from consolidating to a single, cohesive publishing story in the future.
