# Gemini CLI Companion - JetBrains Plugin

<!-- Plugin description -->
This plugin provides integration between the Gemini CLI and JetBrains IDEs, similar to the VS Code extension. The plugin is implemented in Kotlin.
<!-- Plugin description end -->

## Features

- Open Editor File Context: Gemini CLI gains awareness of the files you have open in your editor
- Selection Context: Gemini CLI can access your cursor's position and selected text
- Native Diffing: View, modify, and accept code changes suggested by Gemini CLI
- Launch Gemini CLI: Quickly start a new Gemini CLI session from the Tools menu

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
3. Select the generated plugin ZIP file from `build/libs/`