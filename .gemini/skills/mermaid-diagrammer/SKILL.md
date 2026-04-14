---
name: mermaid-diagrammer
description: Create, convert, and validate Mermaid diagrams. Use this skill when asked to generate visual diagrams (flowcharts, sequence diagrams, class diagrams, etc.) and export them to PNG images. Follows best practices for syntax robustness, accessibility, and professional styling.
---

# Mermaid Diagrammer

This skill enables the creation of professional Mermaid diagrams and their conversion to high-quality PNG images. It emphasizes robust syntax, accessibility, and maintainable styling.

## Workflow

### 1. Create Mermaid Diagram
Select the appropriate diagram type based on the task (see `references/mermaid_syntax.md`).
- **Syntax Guardrails:** Always use double quotes for labels containing special characters: `A["Label (with Parens)"]`.
- **Accessibility:** Include `accTitle` and `accDescr` for all diagrams.
- **Styling:** Use `classDef` and `subgraph` for complex diagrams to ensure readability.
- Save to a `.mmd` file.

### 2. Convert to PNG
Use the `scripts/convert.cjs` script.
- **Command:** `node <skill_path>/scripts/convert.cjs <input.mmd> <output.png>`
- If conversion fails, check the Mermaid CLI output for syntax errors (e.g., mismatched brackets or unquoted special characters).

### 3. Validate & Verify
Validate the PNG using `scripts/validate_png.cjs`.
- **Command:** `node <skill_path>/scripts/validate_png.cjs <output.png>`
- **Human Verification:** Inform the user when the PNG is ready and where it is located.

## Resources

### scripts/
- `convert.cjs`: Converts Mermaid to PNG via `mermaid-cli`.
- `validate_png.cjs`: PNG integrity check.

### references/
- `mermaid_syntax.md`: Comprehensive reference with best practices for AI-generated Mermaid code, accessibility, and theming.
