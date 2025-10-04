<!-- Plugin description -->

## Gemini CLI Companion

This plugin provides integration between [Gemini CLI](https://github.com/google-gemini/gemini-cli) and JetBrains IDEs, similar to the VS Code extension.

## Features

- **Open Editor File Context**: Gemini CLI gains awareness of the files you have open in your editor, providing it with a richer understanding of your project's structure and content.

- **Selection Context**: Gemini CLI can easily access your cursor's position and selected text within the editor, giving it valuable context directly from your current work.

- **Native Diffing**: Seamlessly view, modify, and accept code changes suggested by Gemini CLI directly within the IDE.

- **Launch Gemini CLI**: Quickly start a new Gemini CLI session from the Tools menu or by running the "Run Gemini CLI" action.

## Requirements

To use this plugin, you'll need:

- A compatible JetBrains IDE 2024.1 or later (e.g., IntelliJ IDEA Ultimate/Community, WebStorm, Android Studio, etc.)
- Gemini CLI (installed separately) running within the integrated terminal

## Terms of Service and Privacy Notice

By installing this plugin, you agree to the [Terms of Service](https://github.com/google-gemini/gemini-cli/blob/main/docs/tos-privacy.md).

<!-- Plugin description end -->

## Development

### Prerequisites

- JDK 17
- IntelliJ IDEA or compatible JetBrains IDE
- Gradle

### Building

```bash
./gradlew build
```

### Running

```bash
./gradlew runIde
```

## Installation

1. Build the plugin using `./gradlew buildPlugin`
2. In your JetBrains IDE, go to Settings > Plugins > Install Plugin from Disk
3. Select the generated plugin ZIP file from `./build/distributions/`
