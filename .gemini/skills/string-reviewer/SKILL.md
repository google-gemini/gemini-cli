---
name: string-reviewer
description: >
  Help contributors adhere to project UX writing standards for strings. Use 
  when creating components, reviewing pull requests, or when explicitly 
  asked to review text.
---

# String Reviewer

## Instructions

Look for user-facing strings that are too long, unclear, or inconsistent. This
includes inline text, error messages, and other user-facing text.

Do NOT automatically change strings without user approval, as the context may be  
important. You must only suggest changes and do not attempt to rewrite them
directly unless the user explicitly asks you to do so.

### Step 1: Determine if the text adheres to good UX writing principles

Use these basic principles of good UX writing as a guide for your suggestions. 
These principles include clarity, usefulness, brevity, and style:

#### Clarity

- Text is easy to understand
- Text is easy to follow
- 60 or higher readability score based on the Flesch-Kincaid model
- No errors or typos

#### Usefulness

- Users get the info they need, when they need it
- Use plain, familiar language
- Concepts are explained; value props are user-focused

#### Brevity

- Language is precise
- Short, simple sentences; active voice
- Text is broken up; scannable

#### Style

- Friendly, helpful, positive, and humble tone
- Sentence-style capitalization
- Solitary sentences aren't punctuated
- Speaks to the user ("you")

### Step 2: Ensure that error messages are actionable by the end user

If the text is an error message, ensure that it provides actionable information 
to the end user. Review the reference at [error message guidelines](./references/error-messages.md) 
for more details.

### Step 3: Ensure consistent use of keyboard shortcuts

Our preferred style is `Modifier+Key`. Modifiers should be capitalized, and the
key should be uppercase. There should be no additional spaces.

- **"Escape"** should be written as `Esc` for brevity.
- If there are space constraints, it is acceptable to use Unicode symbols for
  modifiers, for example `⇧+K` for `Shift+K`, or `⏎` for `Enter`. 
  
#### Examples

* `Ctrl+C`
* `Esc`
* `Shift+Tab`

### Step 4: Enforce general style guidelines

1. Don't use a period after a single sentence. When a sentence appears by itself
   on its own line, do not end it with a period. Use a period if the sentence is
   particularly long or complex.
2. Use contractions. However, don't make a sentence harder to understand just to
   follow this rule. For example, "do not" can give more emphasis than "don't"
   when needed. 
3. Use abbreviations with care. It’s okay to abbreviate commonly understood
   terms, such as "VM", but be consistent. Try to avoid mixing and matching
   abbreviations and non-abbreviations in the same flow.
4. Use ampersands instead of “and” sparingly. Don't use "+" instead of "&".
5. Only capitalize the first word in titles and headings.
6. Use a serial/Oxford comma to separate items in a list.
7. Avoid pleasantries like “sorry”. Instead, be clear about the issue and
   promote a positive solution.

### Step 5: Use consistent terminology

Finally, review the text for consistent use of terminology. A full list of
preferred terminology can be found in the [terminology reference](./references/terminology.md).