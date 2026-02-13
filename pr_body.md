## Summary

This PR addresses critical security concerns regarding deceptive Unicode
characters (e.g., BiDi overrides, zero-width characters) and homograph attacks
in URIs. It provides comprehensive sanitization for terminal output and a
transparent disclosure mechanism for non-ASCII hostnames.

## Details

This PR addresses the following items from the Unicode Security roadmap:

### 1. Comprehensive Unicode Sanitization (Hardened)

- Updated `stripUnsafeCharacters` in `packages/cli/src/ui/utils/textUtils.ts` to
  strip:
  - **BiDi Control Characters:** (U+200E, U+200F, U+202A-U+202E, U+2066-U+2069).
  - **Zero-Width Characters:** (U+200B, U+200C, U+FEFF).
- Preserved U+200D (ZWJ) for complex emoji support.

### 2. Punycode Conversion and Homograph Warnings (New)

- **Detection Utility:** Implemented `detectHomograph` in `urlSecurityUtils.ts`
  to identify hostnames that undergo Punycode conversion.
- **Security Warning UI:** Created a `UriSecurityWarning` component to display
  "Original" vs "Actual Host (Punycode)" for deceptive URIs.
- **Confirmation Integration:** Integrated high-visibility warnings into the
  tool confirmation flow (e.g., `web-fetch`).
- **Markdown Integration:** Enhanced the markdown renderer to visually flag
  potential homograph links in chat history.

### 3. String Literal Sanitization in Tool Calls

- Ensured all critical user-visible fields in tool confirmations (MCP names,
  diff filenames, file diff content) are sanitized.

### 4. Integrated Sanitization into Output

- Integrated `stripUnsafeCharacters` directly into `RenderInline` for global,
  automatic protection of nearly all primary terminal output.

## Related Issues

Resolves security concerns around obfuscated tool calls and homograph URI
attacks.

## How to Validate

1. **Unit Tests:**
   `npm test -w @google/gemini-cli -- src/ui/utils/textUtils.test.ts src/ui/utils/urlSecurityUtils.test.ts`
2. **Component Tests:**
   `npm test -w @google/gemini-cli -- src/ui/components/shared/UriSecurityWarning.test.tsx src/ui/utils/InlineMarkdownRendererComponent.test.tsx`
3. **Integration Tests:**
   `npm test -w @google/gemini-cli -- src/ui/components/messages/ToolConfirmationMessage.test.tsx`
4. **Manual Verification:**
   - Ask Gemini to "fetch https://googIe.com" (using Cyrillic 'I').
   - Verify the prominent ⚠️ WARNING block appears in the confirmation dialog.
   - Verify the link is also flagged in the chat history.

## Pre-Merge Checklist

- [x] Added/updated tests
- [x] Validated on MacOS (npm run)
