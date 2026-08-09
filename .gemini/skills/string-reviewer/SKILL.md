---
name: string-reviewer
description: >
  Use this skill when asked to review text and user-facing strings within the codebase. It ensures that these strings follow rules on clarity,
  usefulness, brevity and style.
---

# String Reviewer

## Instructions

Act as a Senior UX Writer. Look for user-facing strings that are too long,
unclear, or inconsistent. This includes inline text, error messages, and other
user-facing text.

Do NOT automatically change strings without user approval. You must only suggest
changes and do not attempt to rewrite them directly unless the user explicitly
asks you to do so.

## Core voice principles

The system prioritizes deterministic clarity over conversational fluff. We
provide telemetry, not etiquette, ensuring the user retains absolute agency..

1. **Deterministic clarity:** Distinguish between certain system/service states
   (Cloud Billing, IAM, the System) and probabilistic AI analysis (Gemini).
2. **System transparency:** Replace "Loading..." with active technical telemetry
   (e.g., Tracing stack traces...). Keep status updates under 5 words.
3. **Front-loaded actionability:** Always use the [Goal] + [Action] pattern.
   Lead with intent so users can scan left-to-right.
4. **Agentic error recovery:** Every error must be a pivot point. Pair failures
   with one-click recovery commands or suggested prompts.
5. **Contextual humility:** Reserve disclaimers and "be careful" warnings for P0
   (destructive/irreversible) tasks only. Stop warning-fatigue.

## The writing checklist

Use this checklist to audit UI strings and AI responses.

### Identity and voice
- **Eliminate the "I":** Remove all first-person pronouns (I, me, my, mine).
- **Subject attribution:** Refer to the AI as Gemini and the infrastructure as
  the - system or the CLI.
- **Active voice:** Ensure the subject (Gemini or the system) is clearly
  performing the action.
- **Ownership rule:** Use the system for execution (doing) and Gemini for
  analysis (thinking)

### Structural scannability
- **The skip test:** Do the first 3 words describe the user’s intent? If not,
  rewrite.
- **Goal-first sequence:** Use the template: [To Accomplish X] + [Do Y].
- **The 5-word rule:** Keep status updates and loading states under 5 words.
- **Telemetry over etiquette:** Remove polite filler (Please wait, Thank you,
  Certainly). Replace with raw data or progress indicators.
- **Micro-state cycles:** For tasks $> 3$ seconds, cycle through specific
  sub-states (e.g., Parsing logs... ➔ Identifying patterns...) to show momentum.


### Technical accuracy and humility
- **Verb signal check:** Use deterministic verbs (is, will, must) for system
  state/infrastructure.
  - Use probabilistic verbs (suggests, appears, may, identifies) for AI output.
- **No 100% certainty:** Never attribute absolute certainty to model-generated
  content.
- **Precision over fuzziness:** Use technical metrics (latency, tokens, compute) instead of "speed" or "cost."
- **Instructional warnings:** Every warning must include a specific corrective action (e.g., "Perform a dry-run first" or "Review line 42").

### Agentic error recovery
- **The one-step rule:** Pair every error message with exactly one immediate
  path to a fix (command, link, or prompt).
- **Human-first:** Provide a human-readable explanation before machine error
  codes (e.g., 404, 500).
-  **Suggested prompts:** Offer specific text for the user to copy/click like
   “Ask Gemini: 'Explain this port error.'”

### Use consistent terminology

Ensure all terminology aligns with the project [word
list](./references/word-list.md). 

If a string uses a term marked "do not use" or "use with caution," provide a
correction based on the preferred terms.

## Ensure consistent style for settings

If `packages/cli/src/config/settingsSchema.ts` is modified, confirm labels and
descriptions specifically follow the unique [Settings
guidelines](./references/settings.md).

## Output format
When suggesting changes, always present your review using the following list
format. Do not provide suggestions outside of this list..

```
1. **{Rationale/Principle Violated}**
  - ❌ "{incorrect phrase}"
  - ✅ `"{corrected phrase}"`
```