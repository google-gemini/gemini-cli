# Installation

This guide provides instructions for installing Gemini CLI on your system.

## Prerequisites

- [Node.js](https://nodejs.org/) version 18 or higher.

## Installation

You can install Gemini CLI using one of the following methods:

### npx

The recommended way to run Gemini CLI is with `npx`. This will ensure that you are always using the latest version.

```bash
npx https://github.com/google-gemini/gemini-cli
```

### npm

You can also install Gemini CLI globally using `npm`.

```bash
npm install -g @google/gemini-cli
```

## Authentication

After installing Gemini CLI, you will need to authenticate with your Google account. The first time you run the `gemini` command, you will be prompted to sign in.

Alternatively, you can create an API key in [Google AI Studio](https://aistudio.google.com/apikey) and set it as an environment variable:

```bash
export GEMINI_API_KEY="YOUR_API_KEY"
```

For more information on authentication, see the [Authentication Guide](./authentication.md).
