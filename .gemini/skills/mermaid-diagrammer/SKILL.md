---
name: mermaid-diagrammer
description: Create, convert, and validate Mermaid diagrams. Use this skill when asked to generate visual diagrams (flowcharts, sequence diagrams, class diagrams, etc.) and export them to PNG images. Follows best practices for syntax robustness, accessibility, and professional styling.
---

# Mermaid Diagrammer

This skill enables the creation of professional Mermaid diagrams and their conversion to high-quality PNG images. It emphasizes robust syntax, accessibility, and maintainable styling.

## Workflow

### 1. Create Mermaid Diagram
Select the appropriate diagram type based on the task. 

**Standard Operating Procedure (Precedence):**
1. **Local Standards:** You MUST first read `references/mermaid_syntax.md`. This local file contains project-specific syntax templates and takes absolute precedence.
2. **Supplemental Standards:** Call `mcp_mermaid-guide_get_mermaid_style_guide` to retrieve broader organization standards. Use these only if they do not contradict the local file.

**Handling Existing Diagrams / Inputs:**
- **If provided as a `.mmd` file:** Use `read_file` to examine the content and apply edits directly.
- **If provided as an image (PNG/JPG):** Use `read_file` to read the image file, then use your vision capabilities to analyze the structure and interactions in the image, and translate it into Mermaid syntax.
- **If provided as text:** Parse the description to map the nodes and edges.

- **Syntax Guardrails:** Always use double quotes for labels containing special characters: `A["Label (with Parens)"]`.
- **Accessibility:** Include `accTitle` and `accDescr` for all diagrams.
- **Styling:** Use `classDef` and `subgraph` for complex diagrams to ensure readability.
- Save to a `.mmd` file.

### 2. Convert to PNG
Use the `scripts/convert.cjs` script.
- **Command:** `node <skill_path>/scripts/convert.cjs <input.mmd> <output.png> [mermaid_cli_options...]`
- **Defaults:** The script defaults to `--scale 3` (high resolution) and `-b white` (white background).
- **Overrides:** You can pass additional flags (e.g., `-t dark` for dark theme, or `--width 800` for custom width) at the end of the command to override defaults.
- **Transparency:** Use `-b transparent` if the user explicitly requests transparency (e.g., for dark-mode READMEs or presentation slides), but ensure the colors used are high-contrast and visible on dark backgrounds.
- If conversion fails, check the Mermaid CLI output for syntax errors.

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
