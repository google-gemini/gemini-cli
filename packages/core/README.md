Nested package template. Either fill this out with "backend" functionality or create similar packages that you want built separate from the CLI.

To use this package from another dependent package in this monorepo:

1. Add `"@gemini-code/core"` to the dependent package's `package.json`
1. Import a dependency by calling `import { } from "@gemini-code/core"`
