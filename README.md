# ZOE

> **Engineering, not autocomplete.**

Zoe is an independent terminal-native engineering platform. Zoe decouples terminal presentation from runtime intelligence, prioritizing deliberate design, verification, and code craftsmanship over mindless completion.

```text
╭────────────────────────────────────╮
│ ZOE                                │
│ Engineering, not autocomplete.     │
╰────────────────────────────────────╯

zoe > hello
Zoe core is running.
zoe > /help
Available commands:
  /help     - Show available commands
  /clear    - Clear terminal screen history
  /exit     - Exit Zoe
  /version  - Show Zoe version
```

---

## 🏗 Architecture (Milestone 1)

Zoe separates presentation, session management, and intelligence into decoupled layers:

```text
packages/
├── cli/
│   ├── src/
│   │   ├── commands/       # Slash commands (/help, /clear, /exit, /version)
│   │   ├── ui/
│   │   │   ├── components/ # Box Header, MessageList
│   │   │   ├── input/      # Interactive InputPrompt & history
│   │   │   ├── screens/    # MainScreen terminal coordinator
│   │   │   └── theme/      # Terminal theme
│   │   └── index.ts        # CLI entrypoint
│
└── core/
    ├── src/
    │   ├── events/         # Typed EventBus
    │   ├── session/        # SessionEngine & lifecycle
    │   ├── config/         # Configuration manager (~/.zoe/config.json)
    │   └── runtime/        # Pluggable ZoeRuntime (Placeholder for M1)
    └── index.ts
```

---

## 🚀 Quickstart

### Prerequisites
- Node.js `>= 20.0.0`
- npm `>= 10.0.0`

### Installation & Build

```bash
# Install dependencies
npm install

# Build all packages
npm run build

# Run unit tests
npm test

# Run type checks
npm run typecheck
```

### Running Zoe

```bash
# Launch via wrapper
./bin/zoe

# Or via npm script
npm start
```

---

## 📜 License & Attribution

This project is licensed under the **Apache License 2.0**. See [`LICENSE`](LICENSE) for details.

Zoe originated as a fork of [Gemini CLI](https://github.com/google-gemini/gemini-cli) by Google LLC. All historical copyright notices and attributions are retained in accordance with the Apache 2.0 license.
