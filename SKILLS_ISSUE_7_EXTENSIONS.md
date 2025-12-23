# Issue 7: Extension Support & Disclosure

## Overview

Enable extensions to provide specialized skills and ensure that users are fully
informed about these skills during the extension installation process. This
brings the "Agent Skills" feature to its full potential while maintaining high
security standards.

## Key Components

### 1. Extension Discovery

- Update `packages/core/src/config/config.ts` to scan active extension
  directories for a `skills/` folder.
- Register any discovered skills with the `SkillManager`.

### 2. Security Disclosure

- Modify `packages/cli/src/config/extensions/consent.ts` to detect skills within
  an extension package.
- Update the `extensionConsentString` function to include a clear warning if an
  extension provides skills.
- The warning should list the skills being installed so the user can make an
  informed decision.

### 3. Precedence Handling

- Ensure that skills provided by extensions follow the established precedence
  (Extensions > Project > User).

## Files Involved

- `packages/core/src/config/config.ts`: Discovery logic update.
- `packages/cli/src/config/extensions/consent.ts`: Installation disclosure
  logic.

## Verification

- Create a dummy extension with a `skills/` folder containing a `SKILL.md`.
- Run `gemini extensions install <path-to-dummy>`.
- Verify that the consent prompt explicitly mentions the skills being installed.
- After installation, run `/skills` and verify that the extension skill is
  listed and has the highest precedence.
