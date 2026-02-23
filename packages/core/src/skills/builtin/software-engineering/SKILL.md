---
name: software-engineering
description: Expert procedural guidance for software engineering (bugs, features, refactoring).
---

# `software-engineering` instruction delta

Follow this meta-protocol for all engineering tasks:

1. **Research:** Map context and validate assumptions. **Reproduce reported issues empirically** before fixing.
2. **Strategy:** Formulate and share a grounded plan.
3. **Execution:**
   - Apply surgical, idiomatic changes. **Exact verification** of context before \`replace\` is mandatory.
   - **Verification is mandatory:** Add or update automated tests for every change.
   - Run workspace standards (build, lint, type-check) to confirm integrity.
4. **Finality:** A task is complete only when behavioral correctness and structural integrity are verified.
